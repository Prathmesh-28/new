import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import {
  computeFinancialSnapshot, amortizationSchedule, totalInterest, prepaymentImpact, emi, irr,
} from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import {
  Scale, Landmark, ArrowRight, Zap, Calculator, ShieldAlert, GitCompareArrows, PauseCircle,
  Plus, CheckCircle2, AlertTriangle, TrendingDown,
  CalendarRange, Target, Percent, DoorClosed, CircleDollarSign, ArrowDownUp, BadgeIndianRupee,
  PiggyBank, Gem, Factory, RefreshCw, Layers, Wallet,
  Activity, BarChart3, Coins, Gauge,
  CalendarClock, CalendarDays, TrendingUp, ShieldCheck, HandCoins, Receipt, Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { addMonths, format, parseISO } from "date-fns";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import AiInsight from "@/components/ai/AiInsight";
import { useT } from "@/i18n";
import DataFreshnessBadge from "@/components/DataFreshnessBadge";

type ActiveLoanLike = { id: string; lender: string; outstanding: number; rate: number; monthlyEmi: number };

function remainingMonths(loan: { outstanding: number; rate: number; monthlyEmi: number }): number {
  const r = loan.rate / 100 / 12;
  if (loan.monthlyEmi <= loan.outstanding * r) return 360; // EMI doesn't cover interest
  if (r === 0) return Math.ceil(loan.outstanding / Math.max(1, loan.monthlyEmi));
  return Math.ceil(Math.log(loan.monthlyEmi / (loan.monthlyEmi - loan.outstanding * r)) / Math.log(1 + r));
}

export default function DebtPage() {
  const { store } = useApp();
  const navigate = useNavigate();
  const tr = useT();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const loans = store.activeLoans;

  const [tab, setTab] = useState<
    | "overview" | "amortise" | "dscr" | "refinance" | "moratorium"
    | "schedule" | "optimizer" | "wacd" | "foreclosure" | "balloon" | "stepemi" | "subsidy"
    | "lasf" | "gold" | "equip" | "reset" | "stacking" | "wcdl"
    | "icr" | "maturity" | "prepaypenalty" | "gearing"
    | "emidue" | "ratebench" | "premiumfin" | "refundbridge"
  >("overview");
  const [selectedId, setSelectedId] = useState<string | null>(loans[0]?.id ?? null);
  const [prepay, setPrepay] = useState(100000);
  const [refiRate, setRefiRate] = useState(14);

  const selected = loans.find(l => l.id === selectedId) ?? loans[0] ?? null;
  const selRemaining = selected ? remainingMonths(selected) : 0;
  const schedule = useMemo(
    () => selected ? amortizationSchedule(selected.outstanding, selected.rate, selRemaining) : [],
    [selected, selRemaining],
  );
  const chartData = useMemo(() => schedule.map(r => ({
    month: r.month, Principal: Math.round(r.principal), Interest: Math.round(r.interest), Balance: Math.round(r.closing),
  })), [schedule]);

  const prepayResult = selected ? prepaymentImpact(selected.outstanding, selected.rate, selRemaining, prepay) : null;

  const refi = useMemo(() => {
    if (!selected) return null;
    const currentInterest = totalInterest(selected.outstanding, selected.rate, selRemaining);
    const newInterest = totalInterest(selected.outstanding, refiRate, selRemaining);
    return {
      currentInterest, newInterest,
      saving: currentInterest - newInterest,
      newEmi: emi(selected.outstanding, refiRate, selRemaining),
    };
  }, [selected, selRemaining, refiRate]);

  const dscrOk = snap.dscr === null || snap.dscr >= 1.25;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Scale size={18} className="text-[var(--color-primary)]" /> {tr("debt.title")}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {tr("debt.subtitle")}
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", tr("debt.tab.overview"), Scale],
            ["amortise", tr("debt.tab.amortise"), Calculator],
            ["dscr", tr("debt.tab.dscr"), ShieldAlert],
            ["refinance", tr("debt.tab.refinance"), GitCompareArrows],
            ["moratorium", tr("debt.tab.moratorium"), PauseCircle],
            ["schedule", tr("debt.tab.schedule"), CalendarRange],
            ["optimizer", "Prepay Optimizer", Target],
            ["wacd", "Cost of Debt", Percent],
            ["foreclosure", "Foreclosure Calc", DoorClosed],
            ["balloon", "Balloon / Bullet", CircleDollarSign],
            ["stepemi", "Step-Up / Down EMI", ArrowDownUp],
            ["subsidy", "Interest Subsidy", BadgeIndianRupee],
            ["lasf", "Loan vs FD / Securities", PiggyBank],
            ["gold", "Gold-Loan Estimator", Gem],
            ["equip", "Equipment: Buy vs Lease", Factory],
            ["reset", "Rate-Reset Impact", RefreshCw],
            ["stacking", "Exposure / Stacking", Layers],
            ["wcdl", "WC Demand Loan / OD", Wallet],
            ["icr", "Interest Coverage", Activity],
            ["maturity", "Maturity Profile", BarChart3],
            ["prepaypenalty", "Prepay vs Penalty", Coins],
            ["gearing", "Debt-to-Equity Target", Gauge],
            ["emidue", "EMI Due Calendar", CalendarClock],
            ["ratebench", "Rate Benchmark", TrendingUp],
            ["premiumfin", "Premium / Liability Financing", ShieldCheck],
            ["refundbridge", "Refund / ITC Bridge", Receipt],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "amortise" && <AmortisePrepaySimulator />}
      {tab === "dscr" && <DscrCoverageTracker />}
      {tab === "refinance" && <RefinanceComparator />}
      {tab === "moratorium" && <MoratoriumRecaster loans={loans} />}
      {tab === "schedule" && <RepaymentLadder loans={loans} />}
      {tab === "optimizer" && <PrepayOptimizer loans={loans} />}
      {tab === "wacd" && <CostOfDebtTracker loans={loans} />}
      {tab === "foreclosure" && <ForeclosureCalculator loans={loans} />}
      {tab === "balloon" && <BalloonPlanner />}
      {tab === "stepemi" && <StepEmiPlanner loans={loans} />}
      {tab === "subsidy" && <InterestSubsidyEstimator loans={loans} />}
      {tab === "lasf" && <LoanAgainstAssetEstimator />}
      {tab === "gold" && <GoldLoanEstimator />}
      {tab === "equip" && <EquipmentBuyVsLease />}
      {tab === "reset" && <RateResetImpact loans={loans} />}
      {tab === "stacking" && <ExposureStackingTracker loans={loans} />}
      {tab === "wcdl" && <WorkingCapitalLineCalculator />}
      {tab === "icr" && <InterestCoverageTrend loans={loans} />}
      {tab === "maturity" && <DebtMaturityProfile loans={loans} />}
      {tab === "prepaypenalty" && <PrepaymentPenaltyVsSavings loans={loans} />}
      {tab === "gearing" && <DebtToEquityPlanner loans={loans} />}
      {tab === "emidue" && <EmiDueCalendar loans={loans} />}
      {tab === "ratebench" && <RateBenchmark loans={loans} />}
      {tab === "premiumfin" && <PremiumFinancingCalculator />}
      {tab === "refundbridge" && <RefundBridgeAdvance />}

      {tab === "overview" && <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: tr("debt.kpi.totalOutstanding"), value: formatAmount(snap.debtOutstanding), color: "text-[var(--color-text)]", sub: `${loans.length} active loan(s)` },
          { label: tr("debt.kpi.monthlyDebtService"), value: formatAmount(snap.monthlyDebtService), color: "text-red-400", sub: `${formatAmount(snap.monthlyInterest)}/mo is pure interest` },
          { label: tr("debt.kpi.weightedAvgRate"), value: snap.weightedAvgRatePct !== null ? `${snap.weightedAvgRatePct.toFixed(1)}%` : "-", color: "text-yellow-400", sub: "Across all loans" },
          { label: tr("debt.kpi.dscr"), value: snap.dscr !== null ? `${snap.dscr.toFixed(2)}x` : "No debt", color: dscrOk ? "text-green-400" : "text-red-400", sub: dscrOk ? "Above 1.25x lender bar" : "Below 1.25x - refinance risk" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <AiInsight
        collapsed
        title="What should I pay down first?"
        question="Looking at my debt and repayment schedule, what should I prioritise paying down and where can I save on interest?"
        context={{
          totalOutstanding: snap.debtOutstanding,
          monthlyDebtService: snap.monthlyDebtService,
          monthlyInterest: snap.monthlyInterest,
          weightedAvgRatePct: snap.weightedAvgRatePct,
          dscr: snap.dscr,
          loans: loans.slice(0, 20).map(l => ({
            lender: l.lender, outstanding: l.outstanding, rate: l.rate, monthlyEmi: l.monthlyEmi,
            remainingMonths: remainingMonths(l), estInterestLeft: Math.round(totalInterest(l.outstanding, l.rate, remainingMonths(l))),
          })),
          selectedLoan: selected ? { lender: selected.lender, outstanding: selected.outstanding, rate: selected.rate, monthlyEmi: selected.monthlyEmi, remainingMonths: selRemaining } : null,
          nextMonthsSchedule: schedule.slice(0, 12).map(r => ({ month: r.month, opening: Math.round(r.opening), interest: Math.round(r.interest), principal: Math.round(r.principal), closing: Math.round(r.closing) })),
        }}
      />

      {loans.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
          <Landmark size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">{tr("debt.empty.title")}</p>
          <p className="text-xs text-[var(--color-muted)] mb-4">{tr("debt.empty.desc")}</p>
          <button onClick={() => navigate("/credit")} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-medium">
            {tr("debt.empty.cta")}
          </button>
        </div>
      ) : (
        <>
          {/* Loan table */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <p className="text-sm font-semibold">Active Loans</p>
              <button onClick={() => navigate("/lenders")} className="text-[10px] text-[var(--color-primary)] hover:underline">Compare lender quotes →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Lender", "Outstanding", "Rate", "EMI", "Paid Off", "Est. Interest Left", ""].map(h =>
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {loans.map(l => {
                    const paidPct = l.principal > 0 ? Math.round(((l.principal - l.outstanding) / l.principal) * 100) : 0;
                    const rem = remainingMonths(l);
                    const intLeft = totalInterest(l.outstanding, l.rate, rem);
                    return (
                      <tr key={l.id} className={`hover:bg-white/2 cursor-pointer ${selected?.id === l.id ? "bg-[var(--color-primary)]/5" : ""}`} onClick={() => setSelectedId(l.id)}>
                        <td className="px-5 py-3 font-medium">{l.lender}</td>
                        <td className="px-5 py-3 tabular-nums font-semibold">{formatAmount(l.outstanding)}</td>
                        <td className="px-5 py-3 tabular-nums">{l.rate}%</td>
                        <td className="px-5 py-3 tabular-nums">{formatAmount(l.monthlyEmi)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${paidPct}%` }} />
                            </div>
                            <span className="text-xs text-[var(--color-muted)]">{paidPct}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 tabular-nums text-red-400">{formatAmount(intLeft)}</td>
                        <td className="px-5 py-3 text-[10px] text-[var(--color-primary)]">{selected?.id === l.id ? "Selected" : "Analyse →"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <>
              {/* Amortisation chart */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
                <p className="text-sm font-semibold mb-1">Amortisation - {selected.lender}</p>
                <p className="text-xs text-[var(--color-muted)] mb-4">
                  {selRemaining} months remaining · EMI {formatCurrency(Math.round(selected.monthlyEmi))} · every EMI early in the term is mostly interest.
                </p>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={chartData}>
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={60} />
                    <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} labelFormatter={m => `Month ${m}`} />
                    <Area type="monotone" dataKey="Interest" stackId="1" stroke="#ef4444" fill="#ef444430" />
                    <Area type="monotone" dataKey="Principal" stackId="1" stroke="#22c55e" fill="#22c55e30" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Prepayment simulator */}
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Zap size={13} className="text-yellow-400" /> Prepayment Simulator</p>
                  <p className="text-xs text-[var(--color-muted)] mb-4">One-time lump sum, same EMI - see how much interest disappears.</p>
                  <label className="text-xs text-[var(--color-muted)]">Lump-sum amount</label>
                  <input
                    type="range" min={10000} max={Math.max(10000, selected.outstanding)} step={10000} value={Math.min(prepay, selected.outstanding)}
                    onChange={e => setPrepay(Number(e.target.value))}
                    className="w-full mt-2 accent-[var(--color-primary)]"
                  />
                  <p className="text-lg font-bold tabular-nums mb-3">{formatCurrency(Math.min(prepay, selected.outstanding))}</p>
                  {prepayResult && (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Interest saved", value: formatAmount(prepayResult.interestSaved), color: "text-green-400" },
                        { label: "Months cut", value: `${prepayResult.monthsSaved}`, color: "text-green-400" },
                        { label: "New payoff", value: `${prepayResult.newTermMonths} mo`, color: "text-[var(--color-text)]" },
                      ].map(s => (
                        <div key={s.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                          <p className="text-[10px] text-[var(--color-muted)] mb-1">{s.label}</p>
                          <p className={`text-base font-bold tabular-nums ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Refinance comparison */}
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Landmark size={13} className="text-blue-400" /> Refinance Check</p>
                  <p className="text-xs text-[var(--color-muted)] mb-4">If a lender offers a lower rate for the same remaining term:</p>
                  <label className="text-xs text-[var(--color-muted)]">New rate: <strong className="text-[var(--color-text)]">{refiRate}%</strong> (current {selected.rate}%)</label>
                  <input type="range" min={8} max={Math.max(9, selected.rate)} step={0.5} value={refiRate}
                    onChange={e => setRefiRate(Number(e.target.value))}
                    className="w-full mt-2 mb-4 accent-[var(--color-primary)]" />
                  {refi && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-[var(--color-muted)]">Interest at {selected.rate}%</span><span className="tabular-nums">{formatAmount(refi.currentInterest)}</span></div>
                      <div className="flex justify-between"><span className="text-[var(--color-muted)]">Interest at {refiRate}%</span><span className="tabular-nums">{formatAmount(refi.newInterest)}</span></div>
                      <div className="flex justify-between"><span className="text-[var(--color-muted)]">New EMI</span><span className="tabular-nums">{formatCurrency(Math.round(refi.newEmi))}</span></div>
                      <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
                        <span className="font-semibold">Lifetime saving</span>
                        <span className={`font-bold tabular-nums ${refi.saving > 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(refi.saving)}</span>
                      </div>
                    </div>
                  )}
                  <button onClick={() => navigate("/lenders")}
                    className="mt-4 w-full text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-2 rounded-lg hover:bg-[var(--color-primary)]/25 flex items-center justify-center gap-1.5">
                    Run a lender auction at this rate <ArrowRight size={11} />
                  </button>
                </div>
              </div>

              {/* Schedule table (first 12 months) */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--color-border)]">
                  <p className="text-sm font-semibold">Repayment Schedule - next 12 months</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[var(--color-border)]">
                      <tr>{["Month", "Opening", "EMI", "Interest", "Principal", "Closing"].map(h =>
                        <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {schedule.slice(0, 12).map(r => (
                        <tr key={r.month} className="hover:bg-white/2">
                          <td className="px-5 py-2.5 tabular-nums">{r.month}</td>
                          <td className="px-5 py-2.5 tabular-nums">{formatAmount(r.opening)}</td>
                          <td className="px-5 py-2.5 tabular-nums">{formatCurrency(Math.round(r.payment))}</td>
                          <td className="px-5 py-2.5 tabular-nums text-red-400">{formatCurrency(Math.round(r.interest))}</td>
                          <td className="px-5 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.principal))}</td>
                          <td className="px-5 py-2.5 tabular-nums">{formatAmount(r.closing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
      </>}
    </div>
  );
}

// shared styles
const DINP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

// ── #86 Loan Amortisation & Prepayment Simulator ─────────────────────────────────
// Full EMI schedule from first principles + part-prepayment interest savings.
// Reads an active loan if present, but works fully stand-alone with manual inputs.
function AmortisePrepaySimulator() {
  const { store } = useApp();
  const loans = store.activeLoans;
  const [principal, setPrincipal] = useState("");
  const [ratePct, setRatePct] = useState("");
  const [months, setMonths] = useState("");
  const [prepayAmt, setPrepayAmt] = useState("");
  const [prepayMonth, setPrepayMonth] = useState("12");
  const [prepayMode, setPrepayMode] = useState<"tenure" | "emi">("tenure");

  const prefill = (l: typeof loans[number]) => {
    setPrincipal(String(Math.round(l.outstanding)));
    setRatePct(String(l.rate));
    setMonths(String(remainingMonths(l)));
  };

  const P = parseFloat(principal) || 0;
  const annual = parseFloat(ratePct) || 0;
  const N = Math.max(0, Math.round(parseFloat(months) || 0));
  const lump = parseFloat(prepayAmt) || 0;
  const pMonth = Math.max(1, Math.round(parseFloat(prepayMonth) || 1));
  const fc = formatCurrency;

  const result = useMemo(() => {
    if (P <= 0 || N <= 0) return null;
    const baseEmi = emi(P, annual, N);
    const r = annual / 100 / 12;
    // Re-cast schedule applying a one-time prepayment at month `pMonth`.
    const run = (lumpAmt: number, mode: "tenure" | "emi") => {
      let bal = P;
      let pay = baseEmi;
      let interest = 0;
      const rows: { month: number; opening: number; payment: number; interest: number; principal: number; closing: number; prepay: number }[] = [];
      for (let m = 1; m <= 1000 && bal > 0.01; m++) {
        let prepay = 0;
        if (lumpAmt > 0 && m === pMonth) {
          prepay = Math.min(lumpAmt, bal);
          bal -= prepay;
          if (mode === "emi" && bal > 0.01) {
            // keep tenure, lower EMI for remaining months
            pay = emi(bal, annual, Math.max(1, N - m));
          }
        }
        if (bal <= 0.01) { if (prepay > 0) rows.push({ month: m, opening: bal + prepay, payment: 0, interest: 0, principal: 0, closing: 0, prepay }); break; }
        const int = bal * r;
        const princ = Math.min(pay - int, bal);
        interest += int;
        rows.push({ month: m, opening: bal + prepay, payment: princ + int, interest: int, principal: princ, closing: bal - princ, prepay });
        bal -= princ;
      }
      return { rows, totalInterest: interest, term: rows.length };
    };
    const base = run(0, "tenure");
    const withPrepay = lump > 0 ? run(lump, prepayMode) : null;
    return { baseEmi, base, withPrepay };
  }, [P, annual, N, lump, pMonth, prepayMode]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Loan Amortisation & Prepayment Simulator</h3>
          {loans.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {loans.map(l => (
                <button key={l.id} onClick={() => prefill(l)}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]">
                  Load {l.lender}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Principal (₹)</label>
            <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="2000000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
            <input type="number" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="13.5" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
            <input type="number" value={months} onChange={e => setMonths(e.target.value)} placeholder="60" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Prepay amount (₹)</label>
            <input type="number" value={prepayAmt} onChange={e => setPrepayAmt(e.target.value)} placeholder="200000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Prepay at month</label>
            <input type="number" value={prepayMonth} onChange={e => setPrepayMonth(e.target.value)} placeholder="12" className={DINP} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[var(--color-muted)]">On prepayment:</span>
          {([["tenure", "Reduce tenure (same EMI)"], ["emi", "Reduce EMI (same tenure)"]] as const).map(([id, label]) => (
            <label key={id} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="prepayMode" checked={prepayMode === id} onChange={() => setPrepayMode(id)} className="accent-[var(--color-primary)]" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter principal, rate and tenure to generate the amortisation schedule.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Monthly EMI", value: fc(Math.round(result.baseEmi)), color: "text-[var(--color-text)]" },
              { label: "Total Interest (no prepay)", value: formatAmount(Math.round(result.base.totalInterest)), color: "text-red-400" },
              { label: "Interest Saved", value: result.withPrepay ? formatAmount(Math.max(0, Math.round(result.base.totalInterest - result.withPrepay.totalInterest))) : "-", color: "text-green-400" },
              { label: result.withPrepay && prepayMode === "tenure" ? "Months Cut" : "New Term", value: result.withPrepay ? (prepayMode === "tenure" ? `${result.base.term - result.withPrepay.term} mo` : `${result.withPrepay.term} mo`) : `${result.base.term} mo`, color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {result.withPrepay && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm font-bold text-green-400 flex items-center gap-2">
                <CheckCircle2 size={14} /> Prepaying {fc(lump)} at month {pMonth} {prepayMode === "tenure"
                  ? `saves ${formatAmount(Math.max(0, Math.round(result.base.totalInterest - result.withPrepay.totalInterest)))} interest and clears the loan ${result.base.term - result.withPrepay.term} months early.`
                  : `cuts your interest by ${formatAmount(Math.max(0, Math.round(result.base.totalInterest - result.withPrepay.totalInterest)))} while keeping the original tenure.`}
              </p>
            </div>
          )}

          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Amortisation Schedule {result.withPrepay ? "(with prepayment)" : ""} - first 24 months</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Month", "Opening", "EMI", "Interest", "Principal", "Prepay", "Closing"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(result.withPrepay ?? result.base).rows.slice(0, 24).map(r => (
                    <tr key={r.month} className={`hover:bg-white/2 ${r.prepay > 0 ? "bg-green-950/20" : ""}`}>
                      <td className="px-4 py-2 tabular-nums">{r.month}</td>
                      <td className="px-4 py-2 tabular-nums">{formatAmount(Math.round(r.opening))}</td>
                      <td className="px-4 py-2 tabular-nums">{fc(Math.round(r.payment))}</td>
                      <td className="px-4 py-2 tabular-nums text-red-400">{fc(Math.round(r.interest))}</td>
                      <td className="px-4 py-2 tabular-nums text-green-400">{fc(Math.round(r.principal))}</td>
                      <td className="px-4 py-2 tabular-nums text-[var(--color-primary)]">{r.prepay > 0 ? fc(Math.round(r.prepay)) : "-"}</td>
                      <td className="px-4 py-2 tabular-nums">{formatAmount(Math.round(r.closing))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Reducing-balance method. Banks may charge prepayment penalty on fixed-rate loans (floating-rate term loans to individuals are typically penalty-free). Verify charges with your lender.</p>
        </>
      )}
    </div>
  );
}

// ── #87 DSCR / Interest-Coverage Tracker (covenant monitoring) ───────────────────
type CovenantRow = { id: string; name: string; metric: "dscr" | "icr" | "leverage"; operator: ">=" | "<="; threshold: number };
function DscrCoverageTracker() {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [covenants, setCovenants] = useFeatureState<CovenantRow[]>("debt-covenants", []);
  const [cName, setCName] = useState("");
  const [cMetric, setCMetric] = useState<CovenantRow["metric"]>("dscr");
  const [cOp, setCOp] = useState<CovenantRow["operator"]>(">=");
  const [cThreshold, setCThreshold] = useState("1.25");
  const fc = formatCurrency;

  // Net operating income = pre-debt-service operating surplus (monthly net + interest add-back) annualised.
  const monthlyNoi = snap.monthlyNet + snap.monthlyInterest;
  const annualNoi = monthlyNoi * 12;
  const annualDebtService = snap.monthlyDebtService * 12;
  const annualInterest = snap.monthlyInterest * 12;
  const dscr = snap.dscr;
  const icr = snap.interestCoverage;
  const leverage = monthlyNoi > 0 ? snap.debtOutstanding / annualNoi : null; // Debt / EBITDA-proxy

  const metricValue = (m: CovenantRow["metric"]): number | null =>
    m === "dscr" ? dscr : m === "icr" ? icr : leverage;

  const breached = (c: CovenantRow) => {
    const v = metricValue(c.metric);
    if (v === null) return false;
    return c.operator === ">=" ? v < c.threshold : v > c.threshold;
  };

  const addCovenant = () => {
    const t = parseFloat(cThreshold);
    if (!cName.trim() || isNaN(t)) { toast.error("Enter a covenant name and numeric threshold"); return; }
    setCovenants([...covenants, { id: crypto.randomUUID(), name: cName.trim(), metric: cMetric, operator: cOp, threshold: t }]);
    setCName("");
    toast.success("Covenant added");
  };
  const anyBreach = covenants.some(breached);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "DSCR", value: dscr !== null ? `${dscr.toFixed(2)}x` : "No debt", color: dscr === null || dscr >= 1.25 ? "text-green-400" : "text-red-400", sub: "NOI ÷ debt service" },
          { label: "Interest Coverage", value: icr !== null ? `${icr.toFixed(2)}x` : "-", color: icr === null || icr >= 2 ? "text-green-400" : "text-red-400", sub: "EBIT-proxy ÷ interest" },
          { label: "Debt / NOI (leverage)", value: leverage !== null ? `${leverage.toFixed(2)}x` : "-", color: leverage === null || leverage <= 3 ? "text-green-400" : "text-yellow-400", sub: "Outstanding ÷ annual NOI" },
          { label: "Annual NOI (est.)", value: formatAmount(Math.round(annualNoi)), color: "text-[var(--color-text)]", sub: "Net + interest add-back ×12" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4 space-y-2 text-sm`}>
        <p className="text-sm font-semibold mb-1">How DSCR is computed</p>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Annual NOI (operating surplus)</span><span className="tabular-nums">{fc(Math.round(annualNoi))}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Annual debt service (EMI ×12)</span><span className="tabular-nums">{fc(Math.round(annualDebtService))}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Annual interest</span><span className="tabular-nums">{fc(Math.round(annualInterest))}</span></div>
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Lender Covenants</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Covenant name</label>
            <input value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. HDFC term loan" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Metric</label>
            <select value={cMetric} onChange={e => setCMetric(e.target.value as CovenantRow["metric"])} className={DINP}>
              <option value="dscr">DSCR</option>
              <option value="icr">Interest Coverage</option>
              <option value="leverage">Debt / NOI</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Operator</label>
            <select value={cOp} onChange={e => setCOp(e.target.value as CovenantRow["operator"])} className={DINP}>
              <option value=">=">at least (≥)</option>
              <option value="<=">at most (≤)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Threshold</label>
            <input type="number" value={cThreshold} onChange={e => setCThreshold(e.target.value)} placeholder="1.25" className={DINP} />
          </div>
          <button onClick={addCovenant} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>

        {covenants.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No covenants tracked. Add the DSCR / coverage limits from your sanction letter to monitor breach risk.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Covenant", "Requirement", "Actual", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {covenants.map(c => {
                  const v = metricValue(c.metric);
                  const label = c.metric === "dscr" ? "DSCR" : c.metric === "icr" ? "Interest Coverage" : "Debt / NOI";
                  const isBreach = breached(c);
                  return (
                    <tr key={c.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)]">{label} {c.operator} {c.threshold}x</td>
                      <td className="px-3 py-2.5 tabular-nums">{v !== null ? `${v.toFixed(2)}x` : "-"}</td>
                      <td className="px-3 py-2.5">
                        {v === null ? <span className="text-xs text-[var(--color-muted)]">No data</span>
                          : isBreach ? <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><AlertTriangle size={12} /> Breach</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={12} /> OK</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => setCovenants(covenants.filter(x => x.id !== c.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {anyBreach && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> One or more covenants are in breach. Lenders can recall the facility or reprice - engage proactively before the next reporting date.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">NOI is approximated as operating net cash flow plus interest add-back (an EBITDA proxy). DSCR ≥ 1.25x and interest coverage ≥ 2x are common lender bars. Use your audited figures for covenant certificates.</p>
    </div>
  );
}

// ── #88 Debt Consolidation / Refinance Comparator (effective cost) ───────────────
type OfferRow = { id: string; lender: string; rate: number; tenureMonths: number; processingPct: number; otherFees: number };
function RefinanceComparator() {
  const { store } = useApp();
  const loans = store.activeLoans;
  const totalOutstanding = loans.reduce((s, l) => s + l.outstanding, 0);
  const totalEmi = loans.reduce((s, l) => s + l.monthlyEmi, 0);

  const [amount, setAmount] = useState("");
  const [offers, setOffers] = useFeatureState<OfferRow[]>("debt-refi-offers", []);
  const [oLender, setOLender] = useState("");
  const [oRate, setORate] = useState("");
  const [oTenure, setOTenure] = useState("");
  const [oProc, setOProc] = useState("1");
  const [oFees, setOFees] = useState("0");
  const fc = formatCurrency;

  const consolidationAmount = parseFloat(amount) || Math.round(totalOutstanding);

  // Existing weighted blended cost: total interest if each loan runs its own remaining term.
  const existing = useMemo(() => {
    if (loans.length === 0) return null;
    const totInt = loans.reduce((s, l) => s + totalInterest(l.outstanding, l.rate, remainingMonths(l)), 0);
    const wRate = totalOutstanding > 0 ? loans.reduce((s, l) => s + l.rate * l.outstanding, 0) / totalOutstanding : 0;
    return { totalInterest: totInt, weightedRate: wRate, emi: totalEmi };
  }, [loans, totalOutstanding, totalEmi]);

  const evaluated = useMemo(() => offers.map(o => {
    const fees = consolidationAmount * (o.processingPct / 100) + o.otherFees;
    const newEmi = emi(consolidationAmount, o.rate, o.tenureMonths);
    const interest = totalInterest(consolidationAmount, o.rate, o.tenureMonths);
    const totalCost = interest + fees; // interest + upfront fees
    // Effective annualised cost = IRR of: receive principal-net-of-fees, pay EMI over tenure.
    const cashflows = [consolidationAmount - fees, ...Array(o.tenureMonths).fill(-newEmi)];
    const effRate = irr(cashflows);
    return { ...o, fees, newEmi, interest, totalCost, effRate };
  }), [offers, consolidationAmount]);

  const best = evaluated.length > 0
    ? evaluated.reduce((a, b) => (b.totalCost < a.totalCost ? b : a))
    : null;

  const addOffer = () => {
    const rate = parseFloat(oRate), tenure = Math.round(parseFloat(oTenure));
    if (!oLender.trim() || isNaN(rate) || isNaN(tenure) || tenure <= 0) { toast.error("Enter lender, rate and a valid tenure"); return; }
    setOffers([...offers, { id: crypto.randomUUID(), lender: oLender.trim(), rate, tenureMonths: tenure, processingPct: parseFloat(oProc) || 0, otherFees: parseFloat(oFees) || 0 }]);
    setOLender(""); setORate(""); setOTenure("");
    toast.success("Offer added");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Consolidation / Refinance Comparator</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount to refinance / consolidate (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder={loans.length ? `Auto: ${Math.round(totalOutstanding)}` : "1500000"} className={DINP} />
          </div>
        </div>
        {existing && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            {[
              { label: "Current EMI (all loans)", value: fc(Math.round(existing.emi)) },
              { label: "Current weighted rate", value: `${existing.weightedRate.toFixed(2)}%` },
              { label: "Interest left (current path)", value: formatAmount(Math.round(existing.totalInterest)) },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className="text-base font-bold tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-sm font-semibold">Add a lender offer</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Lender</label>
            <input value={oLender} onChange={e => setOLender(e.target.value)} placeholder="Lender" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate %</label>
            <input type="number" value={oRate} onChange={e => setORate(e.target.value)} placeholder="11.5" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (mo)</label>
            <input type="number" value={oTenure} onChange={e => setOTenure(e.target.value)} placeholder="48" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Processing %</label>
            <input type="number" value={oProc} onChange={e => setOProc(e.target.value)} placeholder="1" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Other fees ₹</label>
            <input type="number" value={oFees} onChange={e => setOFees(e.target.value)} placeholder="0" className={DINP} />
          </div>
          <button onClick={addOffer} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add two or more offers to rank them by effective all-in cost.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold">Offers ranked by all-in cost</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Lender", "Rate", "Tenure", "EMI", "Fees", "Interest", "All-in Cost", "Effective APR", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {evaluated.map(o => (
                  <tr key={o.id} className={`hover:bg-white/2 ${best && o.id === best.id ? "bg-green-950/20" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">{o.lender}{best && o.id === best.id && <span className="ml-1.5 text-[9px] text-green-400 font-semibold">BEST</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums">{o.rate}%</td>
                    <td className="px-3 py-2.5 tabular-nums">{o.tenureMonths} mo</td>
                    <td className="px-3 py-2.5 tabular-nums">{fc(Math.round(o.newEmi))}</td>
                    <td className="px-3 py-2.5 tabular-nums text-yellow-400">{fc(Math.round(o.fees))}</td>
                    <td className="px-3 py-2.5 tabular-nums text-red-400">{formatAmount(Math.round(o.interest))}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{formatAmount(Math.round(o.totalCost))}</td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--color-primary)]">{o.effRate !== null ? `${o.effRate.toFixed(2)}%` : "-"}</td>
                    <td className="px-3 py-2.5 text-right"><button onClick={() => setOffers(offers.filter(x => x.id !== o.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {best && existing && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400 flex items-center gap-2">
            <TrendingDown size={14} /> {best.lender} at {best.rate}% has the lowest all-in cost ({formatAmount(Math.round(best.totalCost))} incl. {fc(Math.round(best.fees))} fees){best.totalCost < existing.totalInterest ? ` - ~${formatAmount(Math.round(existing.totalInterest - best.totalCost))} cheaper than staying put.` : " - but your current loans are still cheaper; consolidating may not pay off."}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">All-in cost = lifetime interest + processing & other upfront fees. Effective APR is the IRR of the net disbursal vs the EMI stream - the true comparable cost. Factor in any foreclosure charges on the loans being closed.</p>
    </div>
  );
}

// ── #89 Moratorium & Restructuring Re-cast Modeller ──────────────────────────────
function MoratoriumRecaster({ loans }: { loans: ActiveLoanLike[] }) {
  const [selId, setSelId] = useState<string | null>(loans[0]?.id ?? null);
  const [manualP, setManualP] = useState("");
  const [manualR, setManualR] = useState("");
  const [manualN, setManualN] = useState("");
  const [moratoriumMonths, setMoratoriumMonths] = useState(6);
  const [accrueInterest, setAccrueInterest] = useState(true);
  const [newRate, setNewRate] = useState("");
  const [extendMonths, setExtendMonths] = useState(0);
  const fc = formatCurrency;

  const selected = loans.find(l => l.id === selId) ?? loans[0] ?? null;
  const P = selected ? selected.outstanding : parseFloat(manualP) || 0;
  const rate = selected ? selected.rate : parseFloat(manualR) || 0;
  const baseTerm = selected ? remainingMonths(selected) : Math.round(parseFloat(manualN) || 0);
  const effRate = parseFloat(newRate) || rate;

  const recast = useMemo(() => {
    if (P <= 0 || baseTerm <= 0) return null;
    const r = rate / 100 / 12;
    // During moratorium: no EMI. Interest either capitalised onto principal or waived.
    const accrued = accrueInterest ? P * (Math.pow(1 + r, moratoriumMonths) - 1) : 0;
    const newPrincipal = P + accrued;
    const newTerm = baseTerm + extendMonths;
    const baseEmi = emi(P, rate, baseTerm);
    const baseInterest = totalInterest(P, rate, baseTerm);
    const recastEmi = emi(newPrincipal, effRate, newTerm);
    const recastInterest = totalInterest(newPrincipal, effRate, newTerm) + accrued;
    return {
      accrued, newPrincipal, baseEmi, recastEmi, baseInterest, recastInterest,
      newTerm, totalMonthsToClose: moratoriumMonths + newTerm,
      extraInterest: recastInterest - baseInterest,
    };
  }, [P, rate, baseTerm, moratoriumMonths, accrueInterest, effRate, extendMonths]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PauseCircle size={14} className="text-[var(--color-primary)]" /> Moratorium & Restructuring Re-cast Modeller</h3>
        {loans.length > 0 ? (
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Loan</label>
            <select value={selId ?? ""} onChange={e => setSelId(e.target.value)} className={`${DINP} max-w-sm`}>
              {loans.map(l => <option key={l.id} value={l.id}>{l.lender} - {fc(Math.round(l.outstanding))} @ {l.rate}%</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Outstanding (₹)</label>
              <input type="number" value={manualP} onChange={e => setManualP(e.target.value)} placeholder="1500000" className={DINP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
              <input type="number" value={manualR} onChange={e => setManualR(e.target.value)} placeholder="13" className={DINP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Remaining tenure (months)</label>
              <input type="number" value={manualN} onChange={e => setManualN(e.target.value)} placeholder="48" className={DINP} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Moratorium / payment holiday: <strong className="text-[var(--color-text)]">{moratoriumMonths} mo</strong></label>
            <input type="range" min={0} max={24} step={1} value={moratoriumMonths} onChange={e => setMoratoriumMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Extend tenure by: <strong className="text-[var(--color-text)]">{extendMonths} mo</strong></label>
            <input type="range" min={0} max={60} step={3} value={extendMonths} onChange={e => setExtendMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Restructured rate (% p.a.)</label>
            <input type="number" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder={`Same as now (${rate}%)`} className={DINP} />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <input type="checkbox" checked={accrueInterest} onChange={e => setAccrueInterest(e.target.checked)} className="accent-[var(--color-primary)]" />
          Capitalise interest during moratorium (add to principal) - uncheck if the lender waives it
        </label>
      </div>

      {!recast ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the loan details to model the restructured schedule.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Interest accrued in holiday", value: formatAmount(Math.round(recast.accrued)), color: recast.accrued > 0 ? "text-orange-400" : "text-green-400" },
              { label: "Re-cast principal", value: formatAmount(Math.round(recast.newPrincipal)), color: "text-[var(--color-text)]" },
              { label: "New EMI", value: fc(Math.round(recast.recastEmi)), color: recast.recastEmi > recast.baseEmi ? "text-red-400" : "text-green-400", sub: `was ${fc(Math.round(recast.baseEmi))}` },
              { label: "Extra lifetime interest", value: formatAmount(Math.round(recast.extraInterest)), color: recast.extraInterest > 0 ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                {k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          <div className={`${CARD} p-4 space-y-2 text-sm`}>
            <p className="text-sm font-semibold mb-1">Before vs after restructuring</p>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">EMI</span><span className="tabular-nums">{fc(Math.round(recast.baseEmi))} → <strong>{fc(Math.round(recast.recastEmi))}</strong></span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Total interest</span><span className="tabular-nums">{formatAmount(Math.round(recast.baseInterest))} → <strong>{formatAmount(Math.round(recast.recastInterest))}</strong></span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Months to fully close</span><span className="tabular-nums">{baseTerm} → <strong>{recast.totalMonthsToClose}</strong> (incl. {moratoriumMonths}-mo holiday)</span></div>
          </div>

          <div className={`rounded-lg p-4 border ${recast.extraInterest > 0 ? "border-orange-800/40 bg-orange-950/20" : "border-green-800/40 bg-green-950/20"}`}>
            <p className={`text-sm font-bold ${recast.extraInterest > 0 ? "text-orange-400" : "text-green-400"} flex items-center gap-2`}>
              <AlertTriangle size={14} /> A {moratoriumMonths}-month holiday eases near-term cash but {recast.extraInterest > 0 ? `costs ${formatAmount(Math.round(recast.extraInterest))} more interest overall` : "does not add interest under these terms"}. The EMI {recast.recastEmi > recast.baseEmi ? "rises" : "falls"} to {fc(Math.round(recast.recastEmi))} once payments resume.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Models a payment holiday with optional interest capitalisation, tenure extension and rate reset. Restructuring may affect your credit report and is at the lender's discretion. Confirm exact terms in the revised sanction letter.</p>
    </div>
  );
}

// shared empty-state for loan-driven tools
function NoLoansHint({ what }: { what: string }) {
  return (
    <div className={`${CARD} border-dashed p-10 text-center`}>
      <Landmark size={22} className="mx-auto text-[var(--color-muted)] mb-3" />
      <p className="text-sm font-medium mb-1">No active loans</p>
      <p className="text-xs text-[var(--color-muted)]">{what} appears here once you have one or more running loans.</p>
    </div>
  );
}

// ── #90 Debt Schedule / Repayment Ladder ─────────────────────────────────────────
// Merges every active loan into one forward calendar: combined EMI per month plus
// the running total outstanding, so you can see exactly when each loan rolls off
// and how the monthly debt burden steps down over time.
function RepaymentLadder({ loans }: { loans: ActiveLoanLike[] }) {
  const [horizon, setHorizon] = useFeatureState<number>("debt-ladder-horizon", 24);
  const fc = formatCurrency;

  const data = useMemo(() => {
    if (loans.length === 0) return [];
    // Per-loan reducing-balance state.
    const state = loans.map(l => ({
      lender: l.lender, bal: l.outstanding, emiAmt: l.monthlyEmi, r: l.rate / 100 / 12,
      term: remainingMonths(l),
    }));
    const start = new Date();
    const rows: { month: string; idx: number; combinedEmi: number; interest: number; principal: number; outstanding: number; active: number }[] = [];
    for (let m = 1; m <= horizon; m++) {
      let combinedEmi = 0, interest = 0, principal = 0, outstanding = 0, active = 0;
      for (const s of state) {
        if (s.bal > 0.01) {
          const int = s.bal * s.r;
          const pay = Math.min(s.emiAmt, s.bal + int);
          const princ = Math.min(pay - int, s.bal);
          s.bal -= princ;
          combinedEmi += pay; interest += int; principal += princ;
          if (s.bal > 0.01) active += 1;
        }
        outstanding += Math.max(0, s.bal);
      }
      rows.push({
        month: format(addMonths(start, m - 1), "MMM yy"),
        idx: m, combinedEmi, interest, principal, outstanding, active,
      });
    }
    return rows;
  }, [loans, horizon]);

  const chartData = useMemo(() => data.map(r => ({
    month: r.month, EMI: Math.round(r.combinedEmi), Outstanding: Math.round(r.outstanding),
  })), [data]);

  // Detect the months where a loan finishes (active count drops).
  const rolloffs = useMemo(() => {
    const out: { month: string; freed: number }[] = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i].active < data[i - 1].active || (data[i].combinedEmi < data[i - 1].combinedEmi - 1)) {
        out.push({ month: data[i].month, freed: Math.round(data[i - 1].combinedEmi - data[i].combinedEmi) });
      }
    }
    return out.filter(o => o.freed > 0);
  }, [data]);

  if (loans.length === 0) return <NoLoansHint what="A combined repayment timeline for all your loans" />;

  const peakEmi = data.length ? Math.max(...data.map(r => r.combinedEmi)) : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarRange size={14} className="text-[var(--color-primary)]" /> Debt Schedule / Repayment Ladder</h3>
          <label className="text-xs text-[var(--color-muted)] flex items-center gap-2">Horizon
            <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} className={`${DINP} w-auto py-1`}>
              {[12, 24, 36, 48, 60].map(h => <option key={h} value={h}>{h} mo</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Current combined EMI", value: fc(Math.round(data[0]?.combinedEmi ?? 0)) },
            { label: "Peak monthly burden", value: fc(Math.round(peakEmi)) },
            { label: "Loans rolling off in window", value: `${rolloffs.length}` },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className="text-base font-bold tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-1">Combined EMI &amp; outstanding over time</p>
        <p className="text-xs text-[var(--color-muted)] mb-4">Each step down is a loan finishing - that freed cash is your future headroom.</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 12))} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={60} />
            <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
            <Area type="stepAfter" dataKey="EMI" stroke="#f59e0b" fill="#f59e0b30" />
            <Area type="monotone" dataKey="Outstanding" stroke="#3b82f6" fill="#3b82f620" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {rolloffs.length > 0 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400 flex items-center gap-2">
            <CheckCircle2 size={14} /> {rolloffs[0].month}: a loan closes and frees ~{fc(rolloffs[0].freed)}/mo of cash flow{rolloffs.length > 1 ? `, with ${rolloffs.length - 1} more step-down(s) ahead.` : "."}
          </p>
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Month-by-month ladder</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Month", "Combined EMI", "Interest", "Principal", "Outstanding", "Active loans"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.map(r => (
                <tr key={r.idx} className="hover:bg-white/2">
                  <td className="px-4 py-2 tabular-nums">{r.month}</td>
                  <td className="px-4 py-2 tabular-nums font-medium">{fc(Math.round(r.combinedEmi))}</td>
                  <td className="px-4 py-2 tabular-nums text-red-400">{fc(Math.round(r.interest))}</td>
                  <td className="px-4 py-2 tabular-nums text-green-400">{fc(Math.round(r.principal))}</td>
                  <td className="px-4 py-2 tabular-nums">{formatAmount(Math.round(r.outstanding))}</td>
                  <td className="px-4 py-2 tabular-nums text-[var(--color-muted)]">{r.active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Built from each loan's current outstanding, rate and EMI under the reducing-balance method. Assumes EMIs continue unchanged and ignores any floating-rate resets.</p>
    </div>
  );
}

// ── #91 Interest-Cost Optimizer (avalanche vs snowball prepay order) ──────────────
// Given a monthly surplus you can throw at debt, rank which loan to attack first.
// Avalanche (highest rate first) minimises interest; snowball (smallest balance
// first) clears loans fastest for psychological wins. We simulate both, applying
// the surplus on top of all minimum EMIs, and report total interest + payoff time.
function PrepayOptimizer({ loans }: { loans: ActiveLoanLike[] }) {
  const [budgetStr, setBudgetStr] = useFeatureState<string>("debt-optimizer-budget", "25000");
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");
  const fc = formatCurrency;
  const surplus = Math.max(0, parseFloat(budgetStr) || 0);

  const simulate = (order: "avalanche" | "snowball") => {
    const ls = loans.map(l => ({ id: l.id, lender: l.lender, bal: l.outstanding, emiAmt: l.monthlyEmi, r: l.rate / 100 / 12, rate: l.rate }));
    let totalInt = 0;
    let months = 0;
    const closeMonth: Record<string, number> = {};
    for (let m = 1; m <= 600 && ls.some(l => l.bal > 0.01); m++) {
      months = m;
      let extra = surplus;
      // Pay minimum EMIs first.
      for (const l of ls) {
        if (l.bal <= 0.01) continue;
        const int = l.bal * l.r;
        totalInt += int;
        const princ = Math.min(l.emiAmt - int, l.bal);
        l.bal -= Math.max(0, princ);
        if (l.bal <= 0.01 && !closeMonth[l.id]) closeMonth[l.id] = m;
      }
      // Direct the surplus to the target loan(s).
      const live = ls.filter(l => l.bal > 0.01);
      const ranked = order === "avalanche"
        ? [...live].sort((a, b) => b.rate - a.rate)
        : [...live].sort((a, b) => a.bal - b.bal);
      for (const t of ranked) {
        if (extra <= 0) break;
        const pay = Math.min(extra, t.bal);
        t.bal -= pay;
        extra -= pay;
        if (t.bal <= 0.01 && !closeMonth[t.id]) closeMonth[t.id] = m;
      }
    }
    return { totalInt, months, closeMonth };
  };

  const result = useMemo(() => {
    if (loans.length === 0) return null;
    const avalanche = simulate("avalanche");
    const snowball = simulate("snowball");
    // No-extra baseline for context.
    const baselineInt = loans.reduce((s, l) => s + totalInterest(l.outstanding, l.rate, remainingMonths(l)), 0);
    return { avalanche, snowball, baselineInt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, surplus]);

  const chosen = result ? (strategy === "avalanche" ? result.avalanche : result.snowball) : null;

  // Recommended attack order for the chosen strategy.
  const order = useMemo(() => {
    const ls = loans.map(l => ({ id: l.id, lender: l.lender, bal: l.outstanding, rate: l.rate, closeAt: chosen?.closeMonth[l.id] }));
    return strategy === "avalanche"
      ? ls.sort((a, b) => b.rate - a.rate)
      : ls.sort((a, b) => a.bal - b.bal);
  }, [loans, strategy, chosen]);

  if (loans.length === 0) return <NoLoansHint what="A prepayment priority plan across all loans" />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Interest-Cost Optimizer - which loan to prepay first</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Spare cash for debt each month (over &amp; above EMIs) (₹)</label>
            <input type="number" value={budgetStr} onChange={e => setBudgetStr(e.target.value)} placeholder="25000" className={DINP} />
          </div>
          <div className="flex items-center gap-3 text-xs pb-1">
            <span className="text-[var(--color-muted)]">Strategy:</span>
            {([["avalanche", "Avalanche (save most interest)"], ["snowball", "Snowball (clear loans fastest)"]] as const).map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="strategy" checked={strategy === id} onChange={() => setStrategy(id)} className="accent-[var(--color-primary)]" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {result && chosen && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Interest with this plan", value: formatAmount(Math.round(chosen.totalInt)), color: "text-[var(--color-text)]" },
              { label: "Interest saved vs EMI-only", value: formatAmount(Math.max(0, Math.round(result.baselineInt - chosen.totalInt))), color: "text-green-400" },
              { label: "Debt-free in", value: `${chosen.months} mo`, color: "text-[var(--color-text)]" },
              { label: "Avalanche vs Snowball", value: result.avalanche.totalInt <= result.snowball.totalInt ? `Avalanche saves ${formatAmount(Math.round(result.snowball.totalInt - result.avalanche.totalInt))}` : `Snowball saves ${formatAmount(Math.round(result.avalanche.totalInt - result.snowball.totalInt))}`, color: "text-yellow-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Attack order - {strategy === "avalanche" ? "highest rate first" : "smallest balance first"}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["#", "Lender", "Balance", "Rate", "Cleared by"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {order.map((l, i) => (
                    <tr key={l.id} className={`hover:bg-white/2 ${i === 0 ? "bg-[var(--color-primary)]/5" : ""}`}>
                      <td className="px-4 py-2.5 tabular-nums font-semibold">{i + 1}{i === 0 && <span className="ml-1.5 text-[9px] text-[var(--color-primary)] font-semibold">TARGET</span>}</td>
                      <td className="px-4 py-2.5 font-medium">{l.lender}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(l.bal))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{l.rate}%</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{l.closeAt ? `month ${l.closeAt}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
            <p className="text-sm font-bold text-green-400 flex items-center gap-2">
              <TrendingDown size={14} /> Throw your {fc(surplus)}/mo at <strong>{order[0]?.lender}</strong> first. This {strategy} plan clears all debt in {chosen.months} months and saves {formatAmount(Math.max(0, Math.round(result.baselineInt - chosen.totalInt)))} in interest versus paying only EMIs.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Surplus is applied on top of every minimum EMI, then rolled to the next target as each loan closes (debt-avalanche / snowball method). Check each lender's prepayment penalty before redirecting cash.</p>
    </div>
  );
}

// ── #92 Weighted-Average Cost of Debt (WACD) ─────────────────────────────────────
// The single blended rate you actually pay, weighted by each loan's outstanding,
// with each loan's contribution to the blend and its share of the monthly interest
// bill - so you can see which loan is dragging the average up.
function CostOfDebtTracker({ loans }: { loans: ActiveLoanLike[] }) {
  const fc = formatCurrency;
  const data = useMemo(() => {
    const total = loans.reduce((s, l) => s + l.outstanding, 0);
    const monthlyInt = loans.reduce((s, l) => s + (l.outstanding * (l.rate / 100)) / 12, 0);
    const wacd = total > 0 ? loans.reduce((s, l) => s + l.rate * l.outstanding, 0) / total : 0;
    const rows = loans.map(l => {
      const weight = total > 0 ? l.outstanding / total : 0;
      const monthlyLoanInt = (l.outstanding * (l.rate / 100)) / 12;
      return {
        id: l.id, lender: l.lender, outstanding: l.outstanding, rate: l.rate,
        weightPct: weight * 100,
        contribution: l.rate * weight, // bps-style contribution to WACD
        monthlyInt: monthlyLoanInt,
        intShare: monthlyInt > 0 ? (monthlyLoanInt / monthlyInt) * 100 : 0,
        aboveAvg: l.rate > wacd,
      };
    }).sort((a, b) => b.rate - a.rate);
    return { total, monthlyInt, wacd, rows };
  }, [loans]);

  const chartData = useMemo(() => data.rows.map(r => ({ lender: r.lender, Rate: Math.round(r.rate * 10) / 10 })), [data]);

  if (loans.length === 0) return <NoLoansHint what="Your blended cost of debt" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Weighted Avg Cost of Debt", value: `${data.wacd.toFixed(2)}%`, color: "text-yellow-400", sub: "Blended across all loans" },
          { label: "Total Debt", value: formatAmount(Math.round(data.total)), color: "text-[var(--color-text)]", sub: `${loans.length} loan(s)` },
          { label: "Monthly Interest Bill", value: fc(Math.round(data.monthlyInt)), color: "text-red-400", sub: `${fc(Math.round(data.monthlyInt * 12))}/yr` },
          { label: "Costliest Loan", value: data.rows[0] ? `${data.rows[0].rate}%` : "-", color: "text-red-400", sub: data.rows[0]?.lender ?? "" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Percent size={13} className="text-[var(--color-primary)]" /> Rate by loan vs blended {data.wacd.toFixed(2)}%</p>
        <p className="text-xs text-[var(--color-muted)] mb-4">Bars above the blend are pulling your cost of debt up - prime refinance / prepay candidates.</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="lender" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={36} />
            <Tooltip formatter={(v: number) => [`${v}%`, "Rate"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="Rate" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.Rate > data.wacd ? "#ef4444" : "#22c55e"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Cost contribution by loan</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Lender", "Outstanding", "Rate", "Weight", "Adds to WACD", "Monthly Interest", "% of Interest"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.rows.map(r => (
                <tr key={r.id} className={`hover:bg-white/2 ${r.aboveAvg ? "bg-red-950/10" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(r.outstanding))}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.aboveAvg ? "text-red-400" : "text-green-400"}`}>{r.rate}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.weightPct.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.contribution.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 tabular-nums text-red-400">{fc(Math.round(r.monthlyInt))}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.intShare.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">WACD = Σ(rate × outstanding) ÷ total outstanding. "Adds to WACD" is each loan's weighted contribution; the column sums to the blended rate. Replacing an above-average loan lowers your whole cost of debt.</p>
    </div>
  );
}

// ── #93 Foreclosure / Pre-closure Charges Calculator ─────────────────────────────
// Decide whether closing a loan early actually pays. Shows interest you'd save by
// foreclosing now vs the foreclosure penalty + any outstanding charges, and the
// net benefit. Penalty is computed on outstanding principal at your input %.
function ForeclosureCalculator({ loans }: { loans: ActiveLoanLike[] }) {
  const [selId, setSelId] = useState<string | null>(loans[0]?.id ?? null);
  const [penaltyPct, setPenaltyPct] = useFeatureState<string>("debt-foreclosure-penalty", "4");
  const [gstOnPenalty, setGstOnPenalty] = useState(true);
  const [otherCharges, setOtherCharges] = useState("0");
  const fc = formatCurrency;

  const selected = loans.find(l => l.id === selId) ?? loans[0] ?? null;

  const result = useMemo(() => {
    if (!selected) return null;
    const rem = remainingMonths(selected);
    const interestIfContinued = totalInterest(selected.outstanding, selected.rate, rem);
    const penalty = selected.outstanding * ((parseFloat(penaltyPct) || 0) / 100);
    const gst = gstOnPenalty ? penalty * 0.18 : 0;
    const other = parseFloat(otherCharges) || 0;
    const totalCost = penalty + gst + other;
    const net = interestIfContinued - totalCost;
    // Break-even penalty rate at which foreclosure exactly equals continuing.
    const breakEvenPct = selected.outstanding > 0 ? (interestIfContinued / selected.outstanding) * 100 : 0;
    return { rem, interestIfContinued, penalty, gst, other, totalCost, net, breakEvenPct };
  }, [selected, penaltyPct, gstOnPenalty, otherCharges]);

  if (loans.length === 0) return <NoLoansHint what="A foreclosure cost-benefit calculation" />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><DoorClosed size={14} className="text-[var(--color-primary)]" /> Foreclosure / Pre-closure Charges Calculator</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Loan to foreclose</label>
            <select value={selId ?? ""} onChange={e => setSelId(e.target.value)} className={DINP}>
              {loans.map(l => <option key={l.id} value={l.id}>{l.lender} - {fc(Math.round(l.outstanding))} @ {l.rate}%</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Foreclosure penalty (% of o/s)</label>
            <input type="number" value={penaltyPct} onChange={e => setPenaltyPct(e.target.value)} placeholder="4" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Other charges (₹)</label>
            <input type="number" value={otherCharges} onChange={e => setOtherCharges(e.target.value)} placeholder="0" className={DINP} />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <input type="checkbox" checked={gstOnPenalty} onChange={e => setGstOnPenalty(e.target.checked)} className="accent-[var(--color-primary)]" />
          Add 18% GST on the foreclosure penalty (standard on the charge component)
        </label>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Interest saved (close now)", value: formatAmount(Math.round(result.interestIfContinued)), color: "text-green-400", sub: `${result.rem} months avoided` },
              { label: "Foreclosure penalty", value: fc(Math.round(result.penalty)), color: "text-red-400", sub: `${penaltyPct}% of ${formatAmount(Math.round(selected!.outstanding))}` },
              { label: "Total cost to close", value: fc(Math.round(result.totalCost)), color: "text-red-400", sub: result.gst > 0 ? `incl. ${fc(Math.round(result.gst))} GST` : "no GST" },
              { label: "Net benefit", value: formatAmount(Math.round(result.net)), color: result.net > 0 ? "text-green-400" : "text-red-400", sub: result.net > 0 ? "Foreclosure pays off" : "Cheaper to continue" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className={`rounded-lg p-4 border ${result.net > 0 ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
            <p className={`text-sm font-bold ${result.net > 0 ? "text-green-400" : "text-orange-400"} flex items-center gap-2`}>
              {result.net > 0 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {result.net > 0
                ? `Foreclosing ${selected!.lender} now saves a net ${formatAmount(Math.round(result.net))} after ${fc(Math.round(result.totalCost))} in charges.`
                : `The ${fc(Math.round(result.totalCost))} charge exceeds the ${formatAmount(Math.round(result.interestIfContinued))} interest left - continuing is cheaper unless you redeploy the cash at a higher return.`}
              {" "}Break-even penalty is {result.breakEvenPct.toFixed(2)}% of outstanding.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">RBI bars foreclosure charges on floating-rate term loans to individuals; fixed-rate, business and many MSME loans can still levy 2-5%. GST applies to the charge. Confirm the exact figure in your sanction terms.</p>
    </div>
  );
}

// ── #94 Balloon / Bullet Repayment Planner ───────────────────────────────────────
// Plan a structure where you pay reduced (or interest-only) instalments during the
// term and settle a large balloon/bullet at maturity - common for equipment and
// bridge loans. Compares against a fully-amortising loan of the same size.
function BalloonPlanner() {
  const [principal, setPrincipal] = useState("");
  const [ratePct, setRatePct] = useState("");
  const [months, setMonths] = useState("");
  const [mode, setMode] = useState<"interest_only" | "balloon_pct">("interest_only");
  const [balloonPct, setBalloonPct] = useState("40");
  const fc = formatCurrency;

  const P = parseFloat(principal) || 0;
  const annual = parseFloat(ratePct) || 0;
  const N = Math.max(0, Math.round(parseFloat(months) || 0));

  const result = useMemo(() => {
    if (P <= 0 || N <= 0 || annual < 0) return null;
    const r = annual / 100 / 12;
    // Balloon amount: full principal (interest-only) or a chosen % of principal.
    const balloon = mode === "interest_only" ? P : P * (Math.min(100, Math.max(0, parseFloat(balloonPct) || 0)) / 100);
    const amortisedPortion = P - balloon; // principal repaid over the term via EMI
    // Periodic payment = interest on full balance each month + EMI on the amortising slice.
    // We approximate by amortising `amortisedPortion` while paying interest on the residual balloon.
    let bal = P;
    let interestTotal = 0;
    const rows: { month: number; opening: number; payment: number; interest: number; principal: number; closing: number }[] = [];
    const emiOnSlice = amortisedPortion > 0 ? emi(amortisedPortion, annual, N) : 0;
    for (let m = 1; m <= N; m++) {
      const int = bal * r;
      // principal reduction this month comes only from the amortising slice schedule
      const princ = Math.min(Math.max(0, emiOnSlice - amortisedPortion * r), bal - balloon);
      const pay = int + princ;
      interestTotal += int;
      rows.push({ month: m, opening: bal, payment: pay, interest: int, principal: princ, closing: bal - princ });
      bal -= princ;
    }
    // Final bullet at maturity settles the residual balance.
    const bulletDue = bal;
    const periodicPay = rows[0]?.payment ?? 0;
    // Compare to fully-amortising loan.
    const fullEmi = emi(P, annual, N);
    const fullInterest = totalInterest(P, annual, N);
    const balloonTotalInterest = interestTotal; // interest paid over term (bullet is principal)
    return { balloon, bulletDue, periodicPay, fullEmi, fullInterest, balloonTotalInterest, rows };
  }, [P, annual, N, mode, balloonPct]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CircleDollarSign size={14} className="text-[var(--color-primary)]" /> Balloon / Bullet Repayment Planner</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Loan amount (₹)</label>
            <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="3000000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
            <input type="number" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="12" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
            <input type="number" value={months} onChange={e => setMonths(e.target.value)} placeholder="36" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Balloon as % of principal</label>
            <input type="number" value={balloonPct} onChange={e => setBalloonPct(e.target.value)} disabled={mode === "interest_only"} placeholder="40" className={`${DINP} ${mode === "interest_only" ? "opacity-50" : ""}`} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[var(--color-muted)]">Structure:</span>
          {([["interest_only", "Interest-only (100% bullet at end)"], ["balloon_pct", "Partial amortisation + balloon"]] as const).map(([id, label]) => (
            <label key={id} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="balloonMode" checked={mode === id} onChange={() => setMode(id)} className="accent-[var(--color-primary)]" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter loan amount, rate and tenure to design the balloon structure.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Monthly payment", value: fc(Math.round(result.periodicPay)), color: "text-[var(--color-text)]", sub: `vs ${fc(Math.round(result.fullEmi))} fully-amortising` },
              { label: "Balloon due at maturity", value: formatAmount(Math.round(result.bulletDue)), color: "text-orange-400", sub: `month ${N}` },
              { label: "Interest over term", value: formatAmount(Math.round(result.balloonTotalInterest)), color: "text-red-400", sub: "excludes the bullet (principal)" },
              { label: "Extra interest vs amortising", value: formatAmount(Math.max(0, Math.round(result.balloonTotalInterest - result.fullInterest))), color: "text-red-400", sub: "price of lower instalments" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20">
            <p className="text-sm font-bold text-orange-400 flex items-center gap-2">
              <AlertTriangle size={14} /> You pay ~{fc(Math.round(result.periodicPay))}/mo but must arrange {formatAmount(Math.round(result.bulletDue))} to clear the balloon at month {N}. Line up a refinance, asset sale or cash reserve before maturity to avoid a default.
            </p>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Schedule - first 12 months</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Month", "Opening", "Payment", "Interest", "Principal", "Closing"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {result.rows.slice(0, 12).map(r => (
                    <tr key={r.month} className="hover:bg-white/2">
                      <td className="px-4 py-2 tabular-nums">{r.month}</td>
                      <td className="px-4 py-2 tabular-nums">{formatAmount(Math.round(r.opening))}</td>
                      <td className="px-4 py-2 tabular-nums">{fc(Math.round(r.payment))}</td>
                      <td className="px-4 py-2 tabular-nums text-red-400">{fc(Math.round(r.interest))}</td>
                      <td className="px-4 py-2 tabular-nums text-green-400">{fc(Math.round(r.principal))}</td>
                      <td className="px-4 py-2 tabular-nums">{formatAmount(Math.round(r.closing))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Interest accrues on the full residual balance each month; a chosen slice of principal amortises over the term and the rest falls due as a single bullet at maturity. Refinancing risk sits entirely on the balloon date.</p>
        </>
      )}
    </div>
  );
}

// ── #95 Step-Up / Step-Down EMI Planner ──────────────────────────────────────────
// Graduated EMIs that rise (step-up - match a growing business) or fall (step-down)
// at a chosen % each year. Solves the starting EMI so the loan still clears in the
// tenure, then schedules the annual steps and totals the interest vs a flat EMI.
function StepEmiPlanner({ loans }: { loans: ActiveLoanLike[] }) {
  const [selId, setSelId] = useState<string | null>(loans[0]?.id ?? null);
  const [manualP, setManualP] = useState("");
  const [manualR, setManualR] = useState("");
  const [manualN, setManualN] = useState("");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [stepPct, setStepPct] = useState("10");
  const fc = formatCurrency;

  const selected = loans.find(l => l.id === selId) ?? loans[0] ?? null;
  const P = selected ? selected.outstanding : parseFloat(manualP) || 0;
  const rate = selected ? selected.rate : parseFloat(manualR) || 0;
  const N = selected ? remainingMonths(selected) : Math.max(0, Math.round(parseFloat(manualN) || 0));

  const result = useMemo(() => {
    if (P <= 0 || N <= 0) return null;
    const r = rate / 100 / 12;
    const step = (parseFloat(stepPct) || 0) / 100;
    const sign = direction === "up" ? 1 : -1;
    const years = Math.ceil(N / 12);
    // factor for the EMI in year y relative to the base EMI E0.
    const factor = (y: number) => Math.pow(1 + sign * step, y);
    // Solve base EMI E0 so PV of all stepped payments == principal.
    // PV = Σ over months of (E0 * factor(year) / (1+r)^m). Linear in E0 → solve directly.
    let pvUnit = 0; // PV of payments if E0 = 1
    for (let m = 1; m <= N; m++) {
      const y = Math.floor((m - 1) / 12);
      pvUnit += factor(y) / Math.pow(1 + r, m);
    }
    const baseEmi = pvUnit > 0 ? P / pvUnit : 0;
    // Run the schedule.
    let bal = P;
    let interestTotal = 0;
    const yearRows: { year: number; emi: number }[] = [];
    for (let y = 0; y < years; y++) yearRows.push({ year: y + 1, emi: baseEmi * factor(y) });
    for (let m = 1; m <= N && bal > 0.01; m++) {
      const y = Math.floor((m - 1) / 12);
      const pay = baseEmi * factor(y);
      const int = bal * r;
      const princ = Math.min(pay - int, bal);
      interestTotal += int;
      bal -= princ;
    }
    const flatEmi = emi(P, rate, N);
    const flatInterest = totalInterest(P, rate, N);
    return { baseEmi, finalEmi: baseEmi * factor(years - 1), interestTotal, flatEmi, flatInterest, yearRows, residual: bal };
  }, [P, rate, N, direction, stepPct]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ArrowDownUp size={14} className="text-[var(--color-primary)]" /> Step-Up / Step-Down EMI Planner</h3>
        {loans.length > 0 ? (
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Loan</label>
            <select value={selId ?? ""} onChange={e => setSelId(e.target.value)} className={`${DINP} max-w-sm`}>
              {loans.map(l => <option key={l.id} value={l.id}>{l.lender} - {fc(Math.round(l.outstanding))} @ {l.rate}%</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Principal (₹)</label>
              <input type="number" value={manualP} onChange={e => setManualP(e.target.value)} placeholder="2000000" className={DINP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
              <input type="number" value={manualR} onChange={e => setManualR(e.target.value)} placeholder="13" className={DINP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
              <input type="number" value={manualN} onChange={e => setManualN(e.target.value)} placeholder="60" className={DINP} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-[var(--color-muted)]">Direction:</span>
            {([["up", "Step-up (EMI rises yearly)"], ["down", "Step-down (EMI falls yearly)"]] as const).map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="stepDir" checked={direction === id} onChange={() => setDirection(id)} className="accent-[var(--color-primary)]" />
                {label}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[var(--color-muted)]">Annual step</span>
            <input type="number" value={stepPct} onChange={e => setStepPct(e.target.value)} className={`${DINP} w-20 py-1`} />
            <span className="text-[var(--color-muted)]">%</span>
          </label>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the loan details to design the graduated EMI plan.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Starting EMI", value: fc(Math.round(result.baseEmi)), color: "text-[var(--color-text)]", sub: `vs ${fc(Math.round(result.flatEmi))} flat` },
              { label: "Final-year EMI", value: fc(Math.round(result.finalEmi)), color: direction === "up" ? "text-red-400" : "text-green-400" },
              { label: "Total interest", value: formatAmount(Math.round(result.interestTotal)), color: "text-red-400", sub: `flat: ${formatAmount(Math.round(result.flatInterest))}` },
              { label: "vs flat EMI interest", value: `${result.interestTotal > result.flatInterest ? "+" : "−"}${formatAmount(Math.abs(Math.round(result.interestTotal - result.flatInterest)))}`, color: result.interestTotal > result.flatInterest ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                {k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">EMI by year ({direction === "up" ? "rising" : "falling"} {parseFloat(stepPct) || 0}% p.a.)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Year", "Monthly EMI", "vs flat EMI"].map(h =>
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {result.yearRows.map(y => (
                    <tr key={y.year} className="hover:bg-white/2">
                      <td className="px-5 py-2.5 tabular-nums">Year {y.year}</td>
                      <td className="px-5 py-2.5 tabular-nums font-medium">{fc(Math.round(y.emi))}</td>
                      <td className={`px-5 py-2.5 tabular-nums ${y.emi > result.flatEmi ? "text-red-400" : "text-green-400"}`}>{y.emi >= result.flatEmi ? "+" : "−"}{fc(Math.abs(Math.round(y.emi - result.flatEmi)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className={`rounded-lg p-4 border ${direction === "up" ? "border-blue-800/40 bg-blue-950/20" : "border-green-800/40 bg-green-950/20"}`}>
            <p className={`text-sm font-bold ${direction === "up" ? "text-blue-400" : "text-green-400"} flex items-center gap-2`}>
              <CheckCircle2 size={14} /> {direction === "up"
                ? `Start at a lighter ${fc(Math.round(result.baseEmi))} and step up ${parseFloat(stepPct) || 0}% a year as revenue grows - useful for early-stage cash crunch, though total interest is ${formatAmount(Math.round(result.interestTotal))}.`
                : `Front-load with ${fc(Math.round(result.baseEmi))} now and ease off ${parseFloat(stepPct) || 0}% a year - pays down principal faster and trims interest to ${formatAmount(Math.round(result.interestTotal))}.`}
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">The starting EMI is solved so the present value of all stepped payments equals the principal, keeping the original tenure. Lenders offer step-up/step-down (graduated/flexi) EMIs selectively - confirm availability.</p>
    </div>
  );
}

// ── #96 Interest-Subsidy Estimator (CGTMSE / MUDRA / CLCSS / subvention) ──────────
// Estimate the benefit of Indian MSME credit schemes: an interest-subvention that
// rebates a % of interest, and/or a capital subsidy (e.g. CLCSS) on eligible plant
// & machinery. Shows effective post-subsidy rate and total cash benefit.
type SchemeKey = "subvention" | "clcss" | "mudra";
function InterestSubsidyEstimator({ loans }: { loans: ActiveLoanLike[] }) {
  const [selId, setSelId] = useState<string | null>(loans[0]?.id ?? null);
  const [manualP, setManualP] = useState("");
  const [manualR, setManualR] = useState("");
  const [manualN, setManualN] = useState("");
  const [scheme, setScheme] = useState<SchemeKey>("subvention");
  const [subventionPct, setSubventionPct] = useFeatureState<string>("debt-subvention-pct", "2");
  const [clcssPct, setClcssPct] = useState("15");
  const [eligibleCapex, setEligibleCapex] = useState("");
  const fc = formatCurrency;

  const selected = loans.find(l => l.id === selId) ?? loans[0] ?? null;
  const P = selected ? selected.outstanding : parseFloat(manualP) || 0;
  const rate = selected ? selected.rate : parseFloat(manualR) || 0;
  const N = selected ? remainingMonths(selected) : Math.max(0, Math.round(parseFloat(manualN) || 0));

  const result = useMemo(() => {
    if (P <= 0 || N <= 0) return null;
    const grossInterest = totalInterest(P, rate, N);
    const sub = (parseFloat(subventionPct) || 0);
    // Interest subvention: rebate of `sub`% p.a. on outstanding ≈ scale gross interest by sub/rate.
    const subventionBenefit = scheme !== "clcss" && rate > 0 ? grossInterest * Math.min(1, sub / rate) : 0;
    const effRate = Math.max(0, rate - (scheme !== "clcss" ? sub : 0));
    // CLCSS capital subsidy: % of eligible plant & machinery (capped at ₹1Cr eligible → ₹15L subsidy).
    const capex = parseFloat(eligibleCapex) || 0;
    const cappedCapex = Math.min(capex, 10000000);
    const capitalSubsidy = scheme === "clcss" ? cappedCapex * ((parseFloat(clcssPct) || 0) / 100) : 0;
    const totalBenefit = subventionBenefit + capitalSubsidy;
    return { grossInterest, subventionBenefit, effRate, capitalSubsidy, totalBenefit };
  }, [P, rate, N, scheme, subventionPct, clcssPct, eligibleCapex]);

  const schemeMeta: Record<SchemeKey, { name: string; note: string }> = {
    subvention: { name: "Interest Subvention (e.g. 2% MSME / Atmanirbhar)", note: "Government rebates a fixed % p.a. of interest on the eligible loan." },
    clcss: { name: "CLCSS Capital Subsidy", note: "15% subsidy on eligible plant & machinery, capped at ₹15L (₹1Cr eligible)." },
    mudra: { name: "MUDRA / Stand-Up India linked", note: "Concessional rate / subvention under priority-sector MSME schemes." },
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BadgeIndianRupee size={14} className="text-[var(--color-primary)]" /> Interest-Subsidy / Subvention Estimator</h3>
        {loans.length > 0 ? (
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Loan</label>
            <select value={selId ?? ""} onChange={e => setSelId(e.target.value)} className={`${DINP} max-w-sm`}>
              {loans.map(l => <option key={l.id} value={l.id}>{l.lender} - {fc(Math.round(l.outstanding))} @ {l.rate}%</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Loan amount (₹)</label>
              <input type="number" value={manualP} onChange={e => setManualP(e.target.value)} placeholder="1500000" className={DINP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
              <input type="number" value={manualR} onChange={e => setManualR(e.target.value)} placeholder="11" className={DINP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
              <input type="number" value={manualN} onChange={e => setManualN(e.target.value)} placeholder="48" className={DINP} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Scheme</label>
            <select value={scheme} onChange={e => setScheme(e.target.value as SchemeKey)} className={DINP}>
              <option value="subvention">Interest Subvention (2%)</option>
              <option value="clcss">CLCSS Capital Subsidy</option>
              <option value="mudra">MUDRA / Stand-Up India</option>
            </select>
          </div>
          {scheme === "clcss" ? (
            <>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Eligible plant &amp; machinery (₹)</label>
                <input type="number" value={eligibleCapex} onChange={e => setEligibleCapex(e.target.value)} placeholder="2000000" className={DINP} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Subsidy %</label>
                <input type="number" value={clcssPct} onChange={e => setClcssPct(e.target.value)} placeholder="15" className={DINP} />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Subvention % p.a.</label>
              <input type="number" value={subventionPct} onChange={e => setSubventionPct(e.target.value)} placeholder="2" className={DINP} />
            </div>
          )}
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">{schemeMeta[scheme].note}</p>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the loan details to estimate your scheme benefit.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Gross interest (no scheme)", value: formatAmount(Math.round(result.grossInterest)), color: "text-red-400" },
              { label: scheme === "clcss" ? "Capital subsidy" : "Interest subvention benefit", value: formatAmount(Math.round(scheme === "clcss" ? result.capitalSubsidy : result.subventionBenefit)), color: "text-green-400" },
              { label: "Effective rate after subvention", value: `${result.effRate.toFixed(2)}%`, color: "text-green-400", sub: scheme === "clcss" ? "rate unchanged" : `was ${rate}%` },
              { label: "Total scheme benefit", value: formatAmount(Math.round(result.totalBenefit)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                {k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
            <p className="text-sm font-bold text-green-400 flex items-center gap-2">
              <CheckCircle2 size={14} /> {schemeMeta[scheme].name} could be worth ~{formatAmount(Math.round(result.totalBenefit))}{scheme !== "clcss" ? `, cutting your effective cost from ${rate}% to ${result.effRate.toFixed(2)}%.` : " as an upfront capital subsidy."} Eligibility depends on Udyam registration, sector and lender tie-up.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative only. Actual subvention rates, caps and eligibility (Udyam registration, manufacturing/service category, scheme validity) vary and change with notifications. Confirm with your lender / the scheme portal before relying on these figures.</p>
    </div>
  );
}

// ── #97 Loan-Against-FD / Securities Estimator ───────────────────────────────────
// Borrowing against your own fixed deposit or shares/MFs is cheap secured credit:
// the limit is an LTV slice of the asset and the rate is usually a thin spread over
// the FD rate. This shows the sanctionable limit and the true net carry cost - the
// loan interest you pay minus the yield you keep earning on the pledged asset.
function LoanAgainstAssetEstimator() {
  const [assetType, setAssetType] = useState<"fd" | "securities">("fd");
  const [assetValue, setAssetValue] = useState("");
  const [yieldPct, setYieldPct] = useState("7");
  const [drawPct, setDrawPct] = useState(80);
  const [tenureMonths, setTenureMonths] = useState("12");
  const fc = formatCurrency;

  // RBI/market norms: ~90% LTV against own FD, ~50% against listed equity/MF.
  const maxLtv = assetType === "fd" ? 90 : 50;
  // Loan rate: FD-backed ≈ FD rate + ~1.5-2%; securities (LAS) ≈ 9-11% flat-ish.
  const av = parseFloat(assetValue) || 0;
  const ay = parseFloat(yieldPct) || 0;
  const N = Math.max(0, Math.round(parseFloat(tenureMonths) || 0));
  const drawn = useMemo(() => av * (Math.min(drawPct, maxLtv) / 100), [av, drawPct, maxLtv]);
  const loanRate = assetType === "fd" ? ay + 2 : 10.5;

  const result = useMemo(() => {
    if (av <= 0 || N <= 0) return null;
    const sanctionLimit = av * (maxLtv / 100);
    const interest = totalInterest(drawn, loanRate, N) || (drawn * (loanRate / 100) * (N / 12));
    // Yield you keep earning on the still-pledged asset over the same period.
    const yieldKept = av * (ay / 100) * (N / 12);
    const netCarry = interest - yieldKept;
    const emiAmt = emi(drawn, loanRate, N);
    return { sanctionLimit, drawn, interest, yieldKept, netCarry, loanRate, emiAmt };
  }, [av, ay, N, drawn, loanRate, maxLtv]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Loan Against FD / Securities Estimator</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[var(--color-muted)]">Pledge:</span>
          {([["fd", "Fixed Deposit (up to 90% LTV)"], ["securities", "Shares / Mutual Funds (up to 50% LTV)"]] as const).map(([id, label]) => (
            <label key={id} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="lasfType" checked={assetType === id} onChange={() => { setAssetType(id); setDrawPct(id === "fd" ? 80 : 45); }} className="accent-[var(--color-primary)]" />
              {label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Asset value (₹)</label>
            <input type="number" value={assetValue} onChange={e => setAssetValue(e.target.value)} placeholder="1000000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{assetType === "fd" ? "FD rate" : "Portfolio yield"} (% p.a.)</label>
            <input type="number" value={yieldPct} onChange={e => setYieldPct(e.target.value)} placeholder="7" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
            <input type="number" value={tenureMonths} onChange={e => setTenureMonths(e.target.value)} placeholder="12" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Draw: <strong className="text-[var(--color-text)]">{Math.min(drawPct, maxLtv)}%</strong> of value</label>
            <input type="range" min={10} max={maxLtv} step={5} value={Math.min(drawPct, maxLtv)} onChange={e => setDrawPct(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the asset value and tenure to size your secured credit line.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Max sanctionable limit", value: formatAmount(Math.round(result.sanctionLimit)), color: "text-[var(--color-text)]", sub: `${maxLtv}% LTV cap` },
              { label: "Amount drawn", value: formatAmount(Math.round(result.drawn)), color: "text-[var(--color-text)]", sub: `EMI ${fc(Math.round(result.emiAmt))}/mo` },
              { label: "Loan interest paid", value: formatAmount(Math.round(result.interest)), color: "text-red-400", sub: `~${result.loanRate.toFixed(1)}% rate` },
              { label: "Net carry cost", value: formatAmount(Math.round(result.netCarry)), color: result.netCarry > 0 ? "text-orange-400" : "text-green-400", sub: "interest − yield kept" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
            <p className="text-sm font-bold text-green-400 flex items-center gap-2">
              <CheckCircle2 size={14} /> Pledging keeps your {assetType === "fd" ? "deposit earning" : "portfolio invested"} - the real cost is only {formatAmount(Math.round(result.netCarry))} (the {result.loanRate.toFixed(1)}% loan rate net of the {ay}% you still earn). Far cheaper than breaking the FD or selling at a loss.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">FD-backed overdrafts typically allow up to 90% LTV at ~1.5-2% over the FD rate; equity/MF loans (LAS) cap near 50% with mark-to-market margin calls if prices fall. Interest is usually charged only on the utilised amount.</p>
    </div>
  );
}

// ── #98 Gold-Loan Estimator (digital pledge) ─────────────────────────────────────
// Size a working-capital draw against pledged gold: net weight × purity × market
// rate gives the gold value, RBI caps the loan at 75% LTV, and you compare a regular
// EMI against a bullet (interest-serviced, principal-at-maturity) structure common
// for short-tenor gold loans.
function GoldLoanEstimator() {
  const [grams, setGrams] = useState("");
  const [purity, setPurity] = useState<"24" | "22" | "18">("22");
  const [ratePerGram, setRatePerGram] = useState("7200");
  const [ltvPct, setLtvPct] = useState(75);
  const [loanRate, setLoanRate] = useState("11");
  const [tenureMonths, setTenureMonths] = useState("12");
  const [structure, setStructure] = useState<"emi" | "bullet">("emi");
  const fc = formatCurrency;

  const g = parseFloat(grams) || 0;
  const r24 = parseFloat(ratePerGram) || 0; // rate quoted for pure 24K gold per gram
  const purityFactor = purity === "24" ? 1 : purity === "22" ? 22 / 24 : 18 / 24;
  const N = Math.max(0, Math.round(parseFloat(tenureMonths) || 0));
  const lr = parseFloat(loanRate) || 0;

  const result = useMemo(() => {
    if (g <= 0 || N <= 0) return null;
    const goldValue = g * purityFactor * r24;
    const maxLoan = goldValue * (Math.min(ltvPct, 75) / 100);
    let interest: number, emiAmt: number, bulletDue: number;
    if (structure === "emi") {
      interest = totalInterest(maxLoan, lr, N);
      emiAmt = emi(maxLoan, lr, N);
      bulletDue = 0;
    } else {
      // interest-only servicing, full principal at maturity
      interest = maxLoan * (lr / 100) * (N / 12);
      emiAmt = maxLoan * (lr / 100) / 12; // monthly interest only
      bulletDue = maxLoan;
    }
    return { goldValue, maxLoan, interest, emiAmt, bulletDue };
  }, [g, purityFactor, r24, ltvPct, lr, N, structure]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gem size={14} className="text-[var(--color-primary)]" /> Gold-Loan Estimator</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Net gold weight (grams)</label>
            <input type="number" value={grams} onChange={e => setGrams(e.target.value)} placeholder="100" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purity</label>
            <select value={purity} onChange={e => setPurity(e.target.value as "24" | "22" | "18")} className={DINP}>
              <option value="24">24K (pure)</option>
              <option value="22">22K (jewellery)</option>
              <option value="18">18K</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">24K rate (₹/gram)</label>
            <input type="number" value={ratePerGram} onChange={e => setRatePerGram(e.target.value)} placeholder="7200" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Loan rate (% p.a.)</label>
            <input type="number" value={loanRate} onChange={e => setLoanRate(e.target.value)} placeholder="11" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
            <input type="number" value={tenureMonths} onChange={e => setTenureMonths(e.target.value)} placeholder="12" className={DINP} />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">LTV: <strong className="text-[var(--color-text)]">{Math.min(ltvPct, 75)}%</strong></label>
            <input type="range" min={40} max={75} step={5} value={Math.min(ltvPct, 75)} onChange={e => setLtvPct(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-primary)]" />
          </div>
          <div className="md:col-span-2 flex items-end gap-3 text-xs">
            <span className="text-[var(--color-muted)]">Structure:</span>
            {([["emi", "EMI (principal + interest)"], ["bullet", "Interest-only, principal at end"]] as const).map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="goldStruct" checked={structure === id} onChange={() => setStructure(id)} className="accent-[var(--color-primary)]" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the gold weight and tenure to estimate the eligible loan.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Pledged gold value", value: formatAmount(Math.round(result.goldValue)), color: "text-[var(--color-text)]", sub: `${purity}K · ${g} g` },
              { label: "Eligible loan", value: formatAmount(Math.round(result.maxLoan)), color: "text-[var(--color-primary)]", sub: `${Math.min(ltvPct, 75)}% LTV` },
              { label: structure === "emi" ? "Monthly EMI" : "Monthly interest", value: fc(Math.round(result.emiAmt)), color: "text-[var(--color-text)]", sub: structure === "bullet" ? "interest-only" : `${N} months` },
              { label: "Total interest", value: formatAmount(Math.round(result.interest)), color: "text-red-400", sub: result.bulletDue > 0 ? `+ ${formatAmount(Math.round(result.bulletDue))} bullet` : "" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                {k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-yellow-800/40 bg-yellow-950/20">
            <p className="text-sm font-bold text-yellow-400 flex items-center gap-2">
              <AlertTriangle size={14} /> Gold loans disburse same-day but the lender holds your gold and can auction it on default. RBI caps LTV at 75% of value - if gold prices fall the lender may seek a top-up. Reserve the principal {result.bulletDue > 0 ? "for the maturity bullet" : "via your EMIs"} to redeem the pledge.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Eligible loan = net weight × purity factor × 24K rate × LTV (RBI cap 75%). Stones and impurities are deducted before valuation; lenders also levy valuation/processing charges. Use today's quoted rate for an accurate figure.</p>
    </div>
  );
}

// ── #99 Equipment Finance vs Operating Lease Comparator ──────────────────────────
// Capex decision for machinery/vehicles: buy on a term loan (you own a depreciating
// asset with a residual value) vs an operating lease (lower outflow, no ownership).
// Compares total cash out and the net cost after accounting for the residual value
// you keep if you buy.
function EquipmentBuyVsLease() {
  const [assetCost, setAssetCost] = useState("");
  const [loanRate, setLoanRate] = useState("13");
  const [downPct, setDownPct] = useState("15");
  const [termMonths, setTermMonths] = useState("48");
  const [residualPct, setResidualPct] = useState("20");
  const [leaseMonthly, setLeaseMonthly] = useState("");
  const fc = formatCurrency;

  const cost = parseFloat(assetCost) || 0;
  const N = Math.max(0, Math.round(parseFloat(termMonths) || 0));

  const result = useMemo(() => {
    if (cost <= 0 || N <= 0) return null;
    const down = cost * ((parseFloat(downPct) || 0) / 100);
    const financed = cost - down;
    const buyEmi = emi(financed, parseFloat(loanRate) || 0, N);
    const buyInterest = totalInterest(financed, parseFloat(loanRate) || 0, N);
    const residual = cost * ((parseFloat(residualPct) || 0) / 100);
    const buyCashOut = down + buyEmi * N;
    const buyNetCost = buyCashOut - residual; // you keep the asset worth `residual`
    const leaseM = parseFloat(leaseMonthly) || 0;
    const leaseCashOut = leaseM * N; // no ownership at end
    const leaseNetCost = leaseCashOut;
    return { down, financed, buyEmi, buyInterest, residual, buyCashOut, buyNetCost, leaseM, leaseCashOut, leaseNetCost };
  }, [cost, loanRate, downPct, N, residualPct, leaseMonthly]);

  const buyCheaper = result ? result.buyNetCost < result.leaseNetCost : true;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Factory size={14} className="text-[var(--color-primary)]" /> Equipment Finance vs Lease Comparator</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Asset cost (₹)</label>
            <input type="number" value={assetCost} onChange={e => setAssetCost(e.target.value)} placeholder="2500000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Loan rate (% p.a.)</label>
            <input type="number" value={loanRate} onChange={e => setLoanRate(e.target.value)} placeholder="13" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Down payment (%)</label>
            <input type="number" value={downPct} onChange={e => setDownPct(e.target.value)} placeholder="15" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Term (months)</label>
            <input type="number" value={termMonths} onChange={e => setTermMonths(e.target.value)} placeholder="48" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Residual value at end (%)</label>
            <input type="number" value={residualPct} onChange={e => setResidualPct(e.target.value)} placeholder="20" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Lease rental (₹/mo)</label>
            <input type="number" value={leaseMonthly} onChange={e => setLeaseMonthly(e.target.value)} placeholder="55000" className={DINP} />
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the asset cost, term and a lease quote to compare ownership vs renting.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`${CARD} p-4 space-y-2 text-sm ${buyCheaper ? "border-green-800/40" : ""}`}>
              <p className="text-sm font-semibold flex items-center gap-2">Buy on loan {buyCheaper && <span className="text-[9px] text-green-400 font-semibold">CHEAPER</span>}</p>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Down payment</span><span className="tabular-nums">{fc(Math.round(result.down))}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">EMI × {N}</span><span className="tabular-nums">{fc(Math.round(result.buyEmi))} → {formatAmount(Math.round(result.buyEmi * N))}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Interest paid</span><span className="tabular-nums text-red-400">{formatAmount(Math.round(result.buyInterest))}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Asset kept (residual)</span><span className="tabular-nums text-green-400">−{formatAmount(Math.round(result.residual))}</span></div>
              <div className="flex justify-between pt-2 border-t border-[var(--color-border)]"><span className="font-semibold">Net cost of ownership</span><span className="font-bold tabular-nums">{formatAmount(Math.round(result.buyNetCost))}</span></div>
            </div>
            <div className={`${CARD} p-4 space-y-2 text-sm ${!buyCheaper ? "border-green-800/40" : ""}`}>
              <p className="text-sm font-semibold flex items-center gap-2">Operating lease {!buyCheaper && <span className="text-[9px] text-green-400 font-semibold">CHEAPER</span>}</p>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Down payment</span><span className="tabular-nums">{fc(0)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Rental × {N}</span><span className="tabular-nums">{fc(Math.round(result.leaseM))} → {formatAmount(Math.round(result.leaseCashOut))}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Tax-deductible</span><span className="tabular-nums">Full rental</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Asset owned at end</span><span className="tabular-nums text-red-400">None</span></div>
              <div className="flex justify-between pt-2 border-t border-[var(--color-border)]"><span className="font-semibold">Net cost of leasing</span><span className="font-bold tabular-nums">{formatAmount(Math.round(result.leaseNetCost))}</span></div>
            </div>
          </div>
          {result.leaseM > 0 && (
            <div className={`rounded-lg p-4 border ${buyCheaper ? "border-green-800/40 bg-green-950/20" : "border-blue-800/40 bg-blue-950/20"}`}>
              <p className={`text-sm font-bold ${buyCheaper ? "text-green-400" : "text-blue-400"} flex items-center gap-2`}>
                {buyCheaper ? <CheckCircle2 size={14} /> : <GitCompareArrows size={14} />}
                {buyCheaper
                  ? `Buying is ~${formatAmount(Math.round(result.leaseNetCost - result.buyNetCost))} cheaper net of the ${formatAmount(Math.round(result.residual))} residual you keep - sensible if the asset stays useful past the term.`
                  : `Leasing is ~${formatAmount(Math.round(result.buyNetCost - result.leaseNetCost))} cheaper and keeps the asset off your balance sheet - better if the equipment dates fast or you want to preserve cash and limits.`}
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Simplified pre-tax cash comparison. Leasing rentals are fully deductible while ownership lets you claim depreciation and input tax credit - your CA can quantify the post-tax difference, which often shifts the verdict.</p>
    </div>
  );
}

// ── #100 Interest-Rate Reset (Repo / MCLR) Impact ────────────────────────────────
// Floating-rate loans reprice when the RBI repo or the bank's MCLR moves. Drag the
// bps change to see, for every active loan, the new EMI (tenure held) or the new
// payoff term (EMI held) and the rupee impact on your combined debt service.
function RateResetImpact({ loans }: { loans: ActiveLoanLike[] }) {
  const [bps, setBps] = useFeatureState<number>("debt-reset-bps", 25);
  const [mode, setMode] = useState<"emi" | "tenure">("emi");
  const fc = formatCurrency;
  const deltaPct = bps / 100;

  const rows = useMemo(() => loans.map(l => {
    const rem = remainingMonths(l);
    const newRate = Math.max(0, l.rate + deltaPct);
    const newEmi = emi(l.outstanding, newRate, rem);
    const newTerm = remainingMonths({ outstanding: l.outstanding, rate: newRate, monthlyEmi: l.monthlyEmi });
    const oldInterest = totalInterest(l.outstanding, l.rate, rem);
    const newInterestEmi = totalInterest(l.outstanding, newRate, rem);
    const newInterestTenure = totalInterest(l.outstanding, newRate, newTerm);
    return {
      id: l.id, lender: l.lender, outstanding: l.outstanding, rate: l.rate, newRate,
      emi: l.monthlyEmi, newEmi, rem, newTerm,
      emiDelta: newEmi - l.monthlyEmi,
      extraInterest: mode === "emi" ? newInterestEmi - oldInterest : newInterestTenure - oldInterest,
    };
  }), [loans, deltaPct, mode]);

  const totals = useMemo(() => ({
    emiDelta: rows.reduce((s, r) => s + r.emiDelta, 0),
    extraInterest: rows.reduce((s, r) => s + r.extraInterest, 0),
    monthsAdded: rows.reduce((s, r) => s + Math.max(0, r.newTerm - r.rem), 0),
  }), [rows]);

  if (loans.length === 0) return <NoLoansHint what="The EMI / tenure impact of a rate reset" />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><RefreshCw size={14} className="text-[var(--color-primary)]" /> Interest-Rate Reset (Repo / MCLR) Impact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate change: <strong className={deltaPct >= 0 ? "text-red-400" : "text-green-400"}>{bps >= 0 ? "+" : ""}{bps} bps ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(2)}%)</strong></label>
            <input type="range" min={-200} max={200} step={25} value={bps} onChange={e => setBps(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-primary)]" />
          </div>
          <div className="flex items-center gap-3 text-xs pb-1">
            <span className="text-[var(--color-muted)]">On reset:</span>
            {([["emi", "Reset EMI (hold tenure)"], ["tenure", "Hold EMI (reset tenure)"]] as const).map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="resetMode" checked={mode === id} onChange={() => setMode(id)} className="accent-[var(--color-primary)]" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: mode === "emi" ? "Combined EMI change" : "Combined extra interest", value: mode === "emi" ? `${totals.emiDelta >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(totals.emiDelta)))}/mo` : formatAmount(Math.round(totals.extraInterest)), color: (mode === "emi" ? totals.emiDelta : totals.extraInterest) > 0 ? "text-red-400" : "text-green-400" },
          { label: "Extra lifetime interest", value: `${totals.extraInterest >= 0 ? "+" : "−"}${formatAmount(Math.abs(Math.round(totals.extraInterest)))}`, color: totals.extraInterest > 0 ? "text-red-400" : "text-green-400" },
          { label: mode === "tenure" ? "Months added (sum)" : "Loans repriced", value: mode === "tenure" ? `${totals.monthsAdded} mo` : `${loans.length}`, color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Per-loan reset - {mode === "emi" ? "EMI held to tenure" : "EMI fixed, tenure flexes"}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Lender", "Old rate", "New rate", mode === "emi" ? "New EMI" : "New term", "Impact"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.rate}%</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.newRate > r.rate ? "text-red-400" : "text-green-400"}`}>{r.newRate.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{mode === "emi" ? `${fc(Math.round(r.emi))} → ${fc(Math.round(r.newEmi))}` : `${r.rem} → ${r.newTerm} mo`}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.extraInterest > 0 ? "text-red-400" : "text-green-400"}`}>{mode === "emi" ? `${r.emiDelta >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(r.emiDelta)))}/mo` : `${r.newTerm - r.rem >= 0 ? "+" : "−"}${Math.abs(r.newTerm - r.rem)} mo`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">External-benchmark (repo-linked) loans reprice within a quarter of an RBI move; MCLR loans reset on their reset date. Banks usually hold your EMI and stretch the tenure on a hike - watch for tenure ballooning past your plan. Fixed-rate loans are unaffected.</p>
    </div>
  );
}

// ── #101 Group Exposure / Loan-Stacking Tracker ──────────────────────────────────
// Total leverage across every lender against your real income. Computes FOIR
// (fixed-obligations-to-income), debt-to-annual-revenue and per-lender concentration
// so you can spot over-leverage before a lender's stacking check flags you.
function ExposureStackingTracker({ loans }: { loans: ActiveLoanLike[] }) {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const fc = formatCurrency;

  const data = useMemo(() => {
    const totalOutstanding = loans.reduce((s, l) => s + l.outstanding, 0);
    const totalEmi = loans.reduce((s, l) => s + l.monthlyEmi, 0);
    const monthlyIncome = Math.max(0, snap.monthlyRevenue);
    const annualRevenue = monthlyIncome * 12;
    const foir = monthlyIncome > 0 ? (totalEmi / monthlyIncome) * 100 : null;
    const debtToRevenue = annualRevenue > 0 ? totalOutstanding / annualRevenue : null;
    const rows = loans.map(l => ({
      id: l.id, lender: l.lender, outstanding: l.outstanding, emi: l.monthlyEmi,
      sharePct: totalOutstanding > 0 ? (l.outstanding / totalOutstanding) * 100 : 0,
    })).sort((a, b) => b.outstanding - a.outstanding);
    const topConcentration = rows[0]?.sharePct ?? 0;
    return { totalOutstanding, totalEmi, monthlyIncome, foir, debtToRevenue, rows, topConcentration, lenderCount: loans.length };
  }, [loans, snap]);

  const foirHot = data.foir !== null && data.foir > 50;
  const stackingRisk = data.lenderCount >= 4 || foirHot;

  if (loans.length === 0) return <NoLoansHint what="Your group exposure and over-leverage check" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "FOIR (EMIs ÷ income)", value: data.foir !== null ? `${data.foir.toFixed(0)}%` : "-", color: foirHot ? "text-red-400" : "text-green-400", sub: "lenders cap ~50%" },
          { label: "Debt ÷ annual revenue", value: data.debtToRevenue !== null ? `${data.debtToRevenue.toFixed(2)}x` : "-", color: data.debtToRevenue !== null && data.debtToRevenue > 1 ? "text-yellow-400" : "text-green-400", sub: "leverage vs turnover" },
          { label: "Active lenders", value: `${data.lenderCount}`, color: data.lenderCount >= 4 ? "text-yellow-400" : "text-[var(--color-text)]", sub: "stacking flag at 4+" },
          { label: "Top-lender concentration", value: `${data.topConcentration.toFixed(0)}%`, color: "text-[var(--color-text)]", sub: data.rows[0]?.lender ?? "" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Exposure by lender</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Lender", "Outstanding", "Monthly EMI", "Share of debt"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(r.outstanding))}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fc(Math.round(r.emi))}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${Math.min(100, r.sharePct)}%` }} />
                      </div>
                      <span className="text-xs text-[var(--color-muted)] tabular-nums">{r.sharePct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`rounded-lg p-4 border ${stackingRisk ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold ${stackingRisk ? "text-red-400" : "text-green-400"} flex items-center gap-2`}>
          {stackingRisk ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {stackingRisk
            ? `Over-leverage risk: ${foirHot ? `EMIs eat ${data.foir?.toFixed(0)}% of income (above the ~50% FOIR bar)` : `${data.lenderCount} active lenders can trip a loan-stacking check`}. A new lender may decline or reprice - consolidate before applying.`
            : `Healthy exposure: EMIs are ${data.foir !== null ? `${data.foir.toFixed(0)}% of income` : "well covered"} across ${data.lenderCount} lender(s), within typical underwriting bars.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">FOIR = total EMIs ÷ monthly income (3-month average revenue used as a proxy). Most lenders cap FOIR near 50-55% and watch for borrowing across many lenders ("stacking"). Bureau data may show obligations not tracked here - keep this list complete.</p>
    </div>
  );
}

// ── #102 Working-Capital Demand Loan / OD-CC Interest Calculator ─────────────────
// Cash-credit / overdraft lines charge interest only on what you draw, plus a
// commitment fee on the idle sanctioned limit. This sizes the real monthly cost of
// a revolving line at your average utilisation versus a fully-drawn term loan.
function WorkingCapitalLineCalculator() {
  const [sanctioned, setSanctioned] = useState("");
  const [avgUtilPct, setAvgUtilPct] = useState(60);
  const [rate, setRate] = useState("12");
  const [commitmentPct, setCommitmentPct] = useState("0.5");
  const [renewalFee, setRenewalFee] = useState("0");
  const fc = formatCurrency;

  const limit = parseFloat(sanctioned) || 0;
  const lr = parseFloat(rate) || 0;

  const result = useMemo(() => {
    if (limit <= 0) return null;
    const drawn = limit * (avgUtilPct / 100);
    const undrawn = limit - drawn;
    const monthlyInterest = (drawn * (lr / 100)) / 12;
    const annualInterest = drawn * (lr / 100);
    // Commitment / non-utilisation fee on the idle portion (annual).
    const commitmentFee = undrawn * ((parseFloat(commitmentPct) || 0) / 100);
    const renewal = parseFloat(renewalFee) || 0;
    const annualCost = annualInterest + commitmentFee + renewal;
    // Effective rate on the money you actually use.
    const effRateOnDrawn = drawn > 0 ? (annualCost / drawn) * 100 : 0;
    // A term loan would charge interest on the full limit even when idle.
    const termLoanInterest = limit * (lr / 100);
    const saved = termLoanInterest - annualInterest;
    return { drawn, undrawn, monthlyInterest, annualInterest, commitmentFee, renewal, annualCost, effRateOnDrawn, termLoanInterest, saved };
  }, [limit, avgUtilPct, lr, commitmentPct, renewalFee]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Working-Capital Demand Loan / OD-CC Calculator</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sanctioned limit (₹)</label>
            <input type="number" value={sanctioned} onChange={e => setSanctioned(e.target.value)} placeholder="5000000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="12" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Commitment fee (% on idle)</label>
            <input type="number" value={commitmentPct} onChange={e => setCommitmentPct(e.target.value)} placeholder="0.5" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Renewal / processing (₹/yr)</label>
            <input type="number" value={renewalFee} onChange={e => setRenewalFee(e.target.value)} placeholder="0" className={DINP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Average utilisation: <strong className="text-[var(--color-text)]">{avgUtilPct}%</strong> of limit</label>
          <input type="range" min={0} max={100} step={5} value={avgUtilPct} onChange={e => setAvgUtilPct(Number(e.target.value))} className="w-full mt-1 accent-[var(--color-primary)]" />
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the sanctioned limit and your typical utilisation to size the line's real cost.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Avg drawn balance", value: formatAmount(Math.round(result.drawn)), color: "text-[var(--color-text)]", sub: `${formatAmount(Math.round(result.undrawn))} idle` },
              { label: "Monthly interest", value: fc(Math.round(result.monthlyInterest)), color: "text-red-400", sub: "on drawn balance only" },
              { label: "All-in annual cost", value: formatAmount(Math.round(result.annualCost)), color: "text-red-400", sub: result.commitmentFee > 0 ? `incl. ${fc(Math.round(result.commitmentFee))} commitment fee` : "no idle-fee" },
              { label: "Effective rate on drawn", value: `${result.effRateOnDrawn.toFixed(2)}%`, color: "text-yellow-400", sub: `nominal ${lr}%` },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
            <p className="text-sm font-bold text-green-400 flex items-center gap-2">
              <CheckCircle2 size={14} /> At {avgUtilPct}% utilisation a revolving line costs {formatAmount(Math.round(result.annualInterest))} interest/yr versus {formatAmount(Math.round(result.termLoanInterest))} for a fully-drawn term loan of the same size - saving ~{formatAmount(Math.round(result.saved))} by paying only for what you use. The lower your steady-state draw, the bigger the saving.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">CC/OD interest is charged on the daily drawn balance, so light users pay far less than on a term loan. Some lenders levy a commitment / non-utilisation fee on the idle limit and an annual renewal charge - include both for the true cost. Drawing power is also capped by your stock-and-debtor statements.</p>
    </div>
  );
}

// ── #103 Interest-Coverage (ICR) Trend & Rate-Shock ──────────────────────────────
// Interest-coverage ratio = pre-debt operating cash flow ÷ interest. Lenders watch
// it alongside DSCR. This shows headroom today and how it erodes if rates rise.
function InterestCoverageTrend({ loans }: { loans: ActiveLoanLike[] }) {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [shockBps, setShockBps] = useFeatureState<number>("debt-icr-shock-bps", 200);
  const fc = formatCurrency;

  const data = useMemo(() => {
    const ocf = snap.monthlyNet + snap.monthlyDebtService; // pre-debt operating cash flow (monthly)
    const annualOcf = ocf * 12;
    const monthlyInterest = snap.monthlyInterest;
    const baseAnnualInterest = monthlyInterest * 12;
    const icr = monthlyInterest > 0 ? ocf / monthlyInterest : null;
    const steps = [0, 100, 200, 300, 400, 500];
    const curve = steps.map(bps => {
      const shockedAnnualInterest = loans.reduce((s, l) => s + l.outstanding * ((l.rate + bps / 100) / 100), 0);
      return { bps, icr: shockedAnnualInterest > 0 ? annualOcf / shockedAnnualInterest : 0 };
    });
    const shockedAnnualInterest = loans.reduce((s, l) => s + l.outstanding * ((l.rate + shockBps / 100) / 100), 0);
    const shockedIcr = shockedAnnualInterest > 0 ? annualOcf / shockedAnnualInterest : null;
    const extraInterest = shockedAnnualInterest - baseAnnualInterest;
    return { ocf, annualOcf, icr, curve, shockedIcr, extraInterest, baseAnnualInterest };
  }, [snap, loans, shockBps]);

  if (loans.length === 0) return <NoLoansHint what="Your interest-coverage headroom and rate-shock test" />;

  const icrThin = data.icr !== null && data.icr < 3;
  const shockBreach = data.shockedIcr !== null && data.shockedIcr < 2;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Interest coverage (ICR)", value: data.icr !== null ? `${data.icr.toFixed(2)}x` : "-", color: icrThin ? "text-yellow-400" : "text-green-400", sub: "OCF ÷ interest; aim ≥ 3x" },
          { label: "Pre-debt cash flow", value: fc(Math.round(data.ocf)) + "/mo", color: "text-[var(--color-text)]", sub: "EMIs added back" },
          { label: "Annual interest", value: formatAmount(Math.round(data.baseAnnualInterest)), color: "text-red-400", sub: "at current rates" },
          { label: `ICR at +${shockBps}bps`, value: data.shockedIcr !== null ? `${data.shockedIcr.toFixed(2)}x` : "-", color: shockBreach ? "text-red-400" : "text-green-400", sub: `+${formatAmount(Math.round(data.extraInterest))} interest/yr` },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Coverage under rising rates</h3>
          <span className="text-xs text-[var(--color-muted)]">shock: +{shockBps}bps</span>
        </div>
        <input type="range" min={0} max={500} step={25} value={shockBps} onChange={e => setShockBps(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.curve}>
              <XAxis dataKey="bps" tickFormatter={v => `+${v}bps`} tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}x`, "ICR"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="icr" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`rounded-lg p-4 border ${shockBreach ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold flex items-center gap-2 ${shockBreach ? "text-red-400" : "text-green-400"}`}>
          {shockBreach ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {shockBreach
            ? `A +${shockBps}bps repo move would pull ICR to ${data.shockedIcr?.toFixed(2)}x - below the ~2x comfort bar - adding ${formatAmount(Math.round(data.extraInterest))}/yr of interest. Hedge or fix rates before your next reset.`
            : `Even after a +${shockBps}bps shock, interest is covered ${data.shockedIcr?.toFixed(2)}x by operating cash flow. Comfortable headroom.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">ICR = pre-debt operating cash flow ÷ interest expense. It isolates the interest burden (DSCR includes principal too). Floating-rate loans reprice at reset dates - stress-test before borrowing more.</p>
    </div>
  );
}

// ── #104 Debt-Maturity Profile ───────────────────────────────────────────────────
// Buckets every loan's payoff date into maturity windows so you can see refinancing
// "walls" - years where a lot of debt rolls off and may need replacing or repaying.
function DebtMaturityProfile({ loans }: { loans: ActiveLoanLike[] }) {
  const fc = formatCurrency;
  const buckets = useMemo(() => {
    const defs = [
      { key: "0-12m", label: "0-12m", lo: 0, hi: 12 },
      { key: "1-2y", label: "1-2y", lo: 12, hi: 24 },
      { key: "2-3y", label: "2-3y", lo: 24, hi: 36 },
      { key: "3-5y", label: "3-5y", lo: 36, hi: 60 },
      { key: "5y+", label: "5y+", lo: 60, hi: Infinity },
    ];
    const rows = defs.map(d => ({ label: d.label, outstanding: 0, count: 0 }));
    loans.forEach(l => {
      const m = remainingMonths(l);
      for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        if (m > d.lo && m <= d.hi) { rows[i].outstanding += l.outstanding; rows[i].count += 1; break; }
      }
    });
    const total = rows.reduce((s, r) => s + r.outstanding, 0);
    return rows.map(r => ({ ...r, sharePct: total > 0 ? (r.outstanding / total) * 100 : 0 }));
  }, [loans]);

  if (loans.length === 0) return <NoLoansHint what="Your debt-maturity profile" />;

  const wall = buckets.reduce((a, b) => (b.sharePct > a.sharePct ? b : a), buckets[0]);
  const nearTerm = buckets[0].sharePct;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={14} className="text-[var(--color-primary)]" /> Outstanding by time-to-maturity</h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
              <YAxis tickFormatter={v => formatAmount(v)} tick={{ fontSize: 10, fill: "var(--color-muted)" }} width={64} />
              <Tooltip formatter={(v: number) => [fc(Math.round(v)), "Outstanding"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="outstanding" radius={[4, 4, 0, 0]}>
                {buckets.map((b, i) => <Cell key={i} fill={b.sharePct > 40 ? "#f87171" : "var(--color-primary)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)]">
            <tr>{["Maturity window", "Loans", "Outstanding", "Share"].map(h =>
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {buckets.map(b => (
              <tr key={b.label} className="hover:bg-white/2">
                <td className="px-4 py-2.5 font-medium">{b.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{b.count}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(b.outstanding))}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{b.sharePct.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${wall.sharePct > 40 ? "border-yellow-800/40 bg-yellow-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold flex items-center gap-2 ${wall.sharePct > 40 ? "text-yellow-400" : "text-green-400"}`}>
          {wall.sharePct > 40 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {wall.sharePct > 40
            ? `${wall.sharePct.toFixed(0)}% of debt matures in the ${wall.label} window - a refinancing "wall". ${nearTerm > 30 ? `${nearTerm.toFixed(0)}% rolls off within a year, so line up replacement facilities early.` : "Plan replacement facilities ahead of that bunching."}`
            : `Maturities are well laddered across windows - no single year carries an outsized roll-off. Refinancing risk is low.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Time-to-maturity is estimated from each loan's outstanding, rate and EMI. Bunched maturities concentrate refinancing risk in one window - spreading them smooths cash flow and reduces dependence on any single credit cycle.</p>
    </div>
  );
}

// ── #105 Prepayment-Penalty vs Interest-Saved ────────────────────────────────────
// Foreclosing or part-paying a loan saves future interest but may trigger a penalty.
// This nets the two off across each loan so you prepay the one with the best payback.
function PrepaymentPenaltyVsSavings({ loans }: { loans: ActiveLoanLike[] }) {
  const [penaltyPct, setPenaltyPct] = useFeatureState<string>("debt-prepay-penalty-pct", "2");
  const [amountStr, setAmountStr] = useState("200000");
  const fc = formatCurrency;
  const pen = parseFloat(penaltyPct) || 0;
  const amount = parseFloat(amountStr) || 0;

  const rows = useMemo(() => {
    if (amount <= 0) return [];
    return loans.map(l => {
      const rem = remainingMonths(l);
      const applied = Math.min(amount, l.outstanding);
      const impact = prepaymentImpact(l.outstanding, l.rate, rem, applied);
      const penalty = applied * (pen / 100);
      const net = impact.interestSaved - penalty;
      return {
        id: l.id, lender: l.lender, rate: l.rate, applied,
        interestSaved: impact.interestSaved, penalty, net,
        worthIt: net > 0,
      };
    }).sort((a, b) => b.net - a.net);
  }, [loans, amount, pen]);

  if (loans.length === 0) return <NoLoansHint what="The prepay-penalty vs interest-saved trade-off" />;

  const best = rows[0] ?? null;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Prepayment penalty vs interest saved</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Lump-sum to deploy (₹)</label>
            <input type="number" value={amountStr} onChange={e => setAmountStr(e.target.value)} placeholder="200000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Foreclosure penalty (% of prepaid)</label>
            <input type="number" value={penaltyPct} onChange={e => setPenaltyPct(e.target.value)} placeholder="2" className={DINP} />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter a lump-sum amount to compare net savings across your loans.</p>
      ) : (
        <>
          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-sm min-w-[560px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Loan", "Rate", "Prepaid", "Interest saved", "Penalty", "Net benefit"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.rate}%</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(r.applied))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{formatAmount(Math.round(r.interestSaved))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">−{formatAmount(Math.round(r.penalty))}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.worthIt ? "text-green-400" : "text-red-400"}`}>{r.net >= 0 ? "" : "−"}{formatAmount(Math.round(Math.abs(r.net)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best && (
            <div className={`rounded-lg p-4 border ${best.worthIt ? "border-green-800/40 bg-green-950/20" : "border-yellow-800/40 bg-yellow-950/20"}`}>
              <p className={`text-sm font-bold flex items-center gap-2 ${best.worthIt ? "text-green-400" : "text-yellow-400"}`}>
                {best.worthIt ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {best.worthIt
                  ? `Prepay ${best.lender} first: ${formatAmount(Math.round(best.interestSaved))} interest saved beats the ${formatAmount(Math.round(best.penalty))} penalty - net ${fc(Math.round(best.net))} ahead. Target the highest-rate loan for the biggest payback.`
                  : `At a ${pen}% penalty, no loan clears its foreclosure cost on this lump-sum - interest saved is below the penalty. Hold the cash or wait for the penalty-free window.`}
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Floating-rate term loans to individuals are usually penalty-free under RBI rules; fixed-rate and business loans often carry 2-4% foreclosure charges. Confirm the penalty in your sanction letter and net it against the interest saved before prepaying.</p>
    </div>
  );
}

// ── #106 Debt-to-Equity Target Planner ───────────────────────────────────────────
// Sets a target D/E (gearing) ratio and shows how much debt to repay - or equity to
// inject - to hit it, so you stay inside covenant gearing caps before raising more.
function DebtToEquityPlanner({ loans }: { loans: ActiveLoanLike[] }) {
  const [equityStr, setEquityStr] = useFeatureState<string>("debt-de-equity", "");
  const [targetDE, setTargetDE] = useState(1.5);
  const fc = formatCurrency;

  const totalDebt = useMemo(() => loans.reduce((s, l) => s + l.outstanding, 0), [loans]);
  const equity = parseFloat(equityStr) || 0;

  const result = useMemo(() => {
    if (equity <= 0) return null;
    const currentDE = totalDebt / equity;
    const allowedDebt = targetDE * equity;
    const repayNeeded = Math.max(0, totalDebt - allowedDebt);
    const equityNeeded = totalDebt / targetDE - equity; // > 0 means inject equity
    const headroom = allowedDebt - totalDebt; // > 0 means room to borrow more
    return { currentDE, allowedDebt, repayNeeded, equityNeeded, headroom };
  }, [equity, totalDebt, targetDE]);

  if (loans.length === 0) return <NoLoansHint what="Your debt-to-equity gearing plan" />;

  const overGeared = result !== null && result.currentDE > targetDE;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Debt-to-equity target planner</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Net worth / equity (₹)</label>
            <input type="number" value={equityStr} onChange={e => setEquityStr(e.target.value)} placeholder="5000000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target D/E: <strong className="text-[var(--color-text)]">{targetDE.toFixed(1)}x</strong></label>
            <input type="range" min={0.5} max={3} step={0.1} value={targetDE} onChange={e => setTargetDE(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-primary)]" />
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Total debt tracked: {formatAmount(Math.round(totalDebt))} across {loans.length} loan(s).</p>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter your net worth to compute current gearing and the path to your target.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Current D/E", value: `${result.currentDE.toFixed(2)}x`, color: overGeared ? "text-red-400" : "text-green-400", sub: `target ${targetDE.toFixed(1)}x` },
              { label: "Debt allowed at target", value: formatAmount(Math.round(result.allowedDebt)), color: "text-[var(--color-text)]", sub: `${targetDE.toFixed(1)}x × equity` },
              { label: overGeared ? "Repay to hit target" : "Borrowing headroom", value: formatAmount(Math.round(overGeared ? result.repayNeeded : result.headroom)), color: overGeared ? "text-red-400" : "text-green-400", sub: overGeared ? "debt reduction needed" : "room before breach" },
              { label: "Or inject equity", value: result.equityNeeded > 0 ? formatAmount(Math.round(result.equityNeeded)) : "-", color: "text-yellow-400", sub: "alternative to repaying" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${overGeared ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
            <p className={`text-sm font-bold flex items-center gap-2 ${overGeared ? "text-red-400" : "text-green-400"}`}>
              {overGeared ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {overGeared
                ? `Geared at ${result.currentDE.toFixed(2)}x - above your ${targetDE.toFixed(1)}x target. Repay ${fc(Math.round(result.repayNeeded))} of debt or raise ${fc(Math.round(result.equityNeeded))} of equity to come back inside. Many term-loan covenants cap D/E at 2-3x.`
                : `Geared at ${result.currentDE.toFixed(2)}x, comfortably under your ${targetDE.toFixed(1)}x target. You have ${fc(Math.round(result.headroom))} of debt headroom before you'd breach it.`}
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">D/E (gearing) = total debt ÷ shareholders' equity. Lenders embed gearing caps in covenants and re-test at every drawdown. Enter equity from your latest balance sheet; this tool tracks only loans recorded here.</p>
    </div>
  );
}

// ── #107 EMI Due Calendar & Cash-Cover Check ─────────────────────────────────────
// Pulls every loan's nextPaymentDate into a forward 6-month due calendar, runs a
// rolling cash-cover test against current bank balance, and exports an .ics so the
// owner can drop EMI reminders straight into their calendar app.
function EmiDueCalendar({ loans }: { loans: ActiveLoanLike[] }) {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [months, setMonths] = useState(6);
  const fc = formatCurrency;

  // Build forward due events: each loan repeats monthly from its recorded next due date.
  const events = useMemo(() => {
    const out: { date: Date; loanId: string; lender: string; amount: number }[] = [];
    for (const l of store.activeLoans) {
      const base = l.nextPaymentDate ? parseISO(l.nextPaymentDate) : new Date();
      const amount = l.nextPaymentAmount > 0 ? l.nextPaymentAmount : l.monthlyEmi;
      for (let k = 0; k < months; k++) {
        out.push({ date: addMonths(base, k), loanId: l.id, lender: l.lender, amount });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [store.activeLoans, months]);

  // Group by month and run a rolling cash-cover test: starting balance less cumulative EMIs.
  const monthly = useMemo(() => {
    const map = new Map<string, { label: string; sortKey: number; total: number; rows: typeof events }>();
    for (const e of events) {
      const key = format(e.date, "yyyy-MM");
      const cur = map.get(key) ?? { label: format(e.date, "MMM yyyy"), sortKey: e.date.getTime(), total: 0, rows: [] };
      cur.total += e.amount;
      cur.rows.push(e);
      map.set(key, cur);
    }
    const arr = Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
    let running = snap.cash;
    return arr.map(m => {
      const before = running;
      running -= m.total;
      return { ...m, balanceBefore: before, balanceAfter: running, short: running < 0 };
    });
  }, [events, snap.cash]);

  const firstShort = monthly.find(m => m.short) ?? null;
  const totalDue = useMemo(() => events.reduce((s, e) => s + e.amount, 0), [events]);

  const exportIcs = () => {
    if (events.length === 0) { toast.error("No EMIs to export"); return; }
    const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
    const vevents = events.map((e, i) => {
      const d = format(e.date, "yyyyMMdd");
      return [
        "BEGIN:VEVENT",
        `UID:headroom-emi-${e.loanId}-${i}@headroom`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`,
        `SUMMARY:EMI ${Math.round(e.amount)} - ${e.lender}`,
        `DESCRIPTION:Loan EMI due to ${e.lender}. Ensure cash cover.`,
        "BEGIN:VALARM\nTRIGGER:-P2D\nACTION:DISPLAY\nDESCRIPTION:EMI due in 2 days\nEND:VALARM",
        "END:VEVENT",
      ].join("\n");
    });
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Headroom//Debt//EN", ...vevents, "END:VCALENDAR"].join("\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "headroom-emi-calendar.ics"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${events.length} EMI reminder(s)`);
  };

  if (loans.length === 0) return <NoLoansHint what="Your EMI due calendar" />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> EMI due calendar & cash-cover check</h3>
          <button onClick={exportIcs} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/25">
            <CalendarDays size={12} /> Export .ics
          </button>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-[var(--color-muted)]">Horizon: <strong className="text-[var(--color-text)]">{months} month(s)</strong></label>
          <input type="range" min={1} max={12} step={1} value={months} onChange={e => setMonths(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Current cash", value: formatAmount(Math.round(snap.cash)), color: "text-[var(--color-text)]" },
            { label: `Total EMIs (${months}m)`, value: formatAmount(Math.round(totalDue)), color: "text-red-400" },
            { label: "First short month", value: firstShort ? firstShort.label : "None", color: firstShort ? "text-red-400" : "text-green-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {firstShort && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2">
            <AlertTriangle size={14} /> On current balance, cumulative EMIs exhaust your cash in {firstShort.label}. Arrange a draw or stagger a payment before then.
          </p>
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Forward due schedule</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Month", "Loans due", "EMI total", "Cash after", "Cover"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {monthly.map(m => (
                <tr key={m.label} className={`hover:bg-white/2 ${m.short ? "bg-red-950/20" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{m.label}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">{m.rows.map(r => r.lender).join(", ")}</td>
                  <td className="px-4 py-2.5 tabular-nums text-red-400">{fc(Math.round(m.total))}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${m.short ? "text-red-400 font-semibold" : ""}`}>{fc(Math.round(m.balanceAfter))}</td>
                  <td className="px-4 py-2.5">
                    {m.short
                      ? <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><AlertTriangle size={12} /> Short</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={12} /> Covered</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Cover test assumes today's bank balance with no new inflows - a deliberately conservative floor. Each loan repeats its recorded EMI monthly from its next due date. The .ics file imports into Google/Apple/Outlook calendars with a 2-day reminder.</p>
    </div>
  );
}

// ── #108 Rate Benchmark vs Peer Band ─────────────────────────────────────────────
// Compares each loan's rate against a peer band you set (e.g. typical MSME term-loan
// pricing) and quantifies the rupee cost of any premium you're paying, so you know
// exactly which loans are worth a renegotiation or refinance push.
function RateBenchmark({ loans }: { loans: ActiveLoanLike[] }) {
  const [bandLow, setBandLow] = useState(11);
  const [bandHigh, setBandHigh] = useState(15);
  const fc = formatCurrency;

  const fair = (bandLow + bandHigh) / 2;

  const rows = useMemo(() => loans.map(l => {
    const rem = remainingMonths(l);
    const premium = l.rate - fair;             // ppt over the fair midpoint
    const curInt = totalInterest(l.outstanding, l.rate, rem);
    const fairInt = totalInterest(l.outstanding, Math.max(0.01, fair), rem);
    const overpay = Math.max(0, curInt - fairInt);
    const status: "below" | "in" | "above" = l.rate < bandLow ? "below" : l.rate > bandHigh ? "above" : "in";
    return { ...l, rem, premium, overpay, status };
  }), [loans, fair, bandLow, bandHigh]);

  const totalOverpay = useMemo(() => rows.reduce((s, r) => s + r.overpay, 0), [rows]);
  const aboveCount = rows.filter(r => r.status === "above").length;

  if (loans.length === 0) return <NoLoansHint what="Your rate benchmark" />;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Rate benchmark vs peer band</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Peer band low (% p.a.)</label>
            <input type="number" value={bandLow} onChange={e => setBandLow(Number(e.target.value) || 0)} className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Peer band high (% p.a.)</label>
            <input type="number" value={bandHigh} onChange={e => setBandHigh(Number(e.target.value) || 0)} className={DINP} />
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Comparing against a fair midpoint of <strong className="text-[var(--color-text)]">{fair.toFixed(1)}%</strong>. Set the band to what comparable MSME borrowers in your sector and ticket size pay.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Loans above band", value: `${aboveCount} / ${loans.length}`, color: aboveCount > 0 ? "text-red-400" : "text-green-400" },
          { label: "Est. lifetime overpay", value: formatAmount(Math.round(totalOverpay)), color: "text-red-400" },
          { label: "Fair midpoint", value: `${fair.toFixed(1)}%`, color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Per-loan pricing vs band</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Lender", "Rate", "vs fair", "Outstanding", "Overpay (life)", "Verdict"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className={`hover:bg-white/2 ${r.status === "above" ? "bg-red-950/20" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.rate}%</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.premium > 0 ? "text-red-400" : "text-green-400"}`}>{r.premium > 0 ? "+" : ""}{r.premium.toFixed(1)} ppt</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(r.outstanding))}</td>
                  <td className="px-4 py-2.5 tabular-nums text-red-400">{r.overpay > 0 ? fc(Math.round(r.overpay)) : "-"}</td>
                  <td className="px-4 py-2.5">
                    {r.status === "above" ? <span className="text-xs text-red-400 font-semibold">Above band - renegotiate</span>
                      : r.status === "below" ? <span className="text-xs text-green-400 font-semibold">Below band - keep</span>
                      : <span className="text-xs text-[var(--color-muted)]">In band</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Overpay = lifetime interest at your rate minus interest at the fair midpoint over each loan's remaining term. A clean repayment record is your strongest lever to negotiate any above-band loan down - or refinance it.</p>
    </div>
  );
}

// ── #109 Premium / Liability Financing Cost ──────────────────────────────────────
// Spreading a lump liability - annual insurance premium, an advance-tax instalment,
// a GST dues bridge - into monthly EMIs has a real carrying cost. This computes the
// EMI, total finance charge and effective APR so you can judge if instant cash is worth it.
function PremiumFinancingCalculator() {
  const [lumpStr, setLumpStr] = useFeatureState<string>("debt-premiumfin-lump", "");
  const [rateStr, setRateStr] = useFeatureState<string>("debt-premiumfin-rate", "16");
  const [procStr, setProcStr] = useState("1");
  const [tenure, setTenure] = useState(10);
  const [purpose, setPurpose] = useState<"insurance" | "tax" | "gst" | "other">("insurance");
  const fc = formatCurrency;

  const lump = parseFloat(lumpStr) || 0;
  const rate = parseFloat(rateStr) || 0;
  const procPct = parseFloat(procStr) || 0;

  const result = useMemo(() => {
    if (lump <= 0 || tenure <= 0) return null;
    const fees = lump * (procPct / 100);
    const financed = lump + fees;
    const monthlyEmi = emi(financed, rate, tenure);
    const interest = totalInterest(financed, rate, tenure);
    const totalCost = interest + fees;
    // Effective APR = IRR of receiving the liability paid net of fees vs the EMI stream.
    const cashflows = [lump - fees, ...Array(tenure).fill(-monthlyEmi)];
    const effRate = irr(cashflows);
    return { fees, financed, monthlyEmi, interest, totalCost, effRate };
  }, [lump, rate, procPct, tenure]);

  const label = purpose === "insurance" ? "annual insurance premium" : purpose === "tax" ? "advance-tax instalment" : purpose === "gst" ? "GST liability" : "lump liability";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> Premium / liability financing cost</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <select value={purpose} onChange={e => setPurpose(e.target.value as typeof purpose)} className={DINP}>
              <option value="insurance">Insurance premium</option>
              <option value="tax">Advance / income tax</option>
              <option value="gst">GST dues</option>
              <option value="other">Other lump liability</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={lumpStr} onChange={e => setLumpStr(e.target.value)} placeholder="300000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Finance rate (% p.a.)</label>
            <input type="number" value={rateStr} onChange={e => setRateStr(e.target.value)} placeholder="16" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Processing %</label>
            <input type="number" value={procStr} onChange={e => setProcStr(e.target.value)} placeholder="1" className={DINP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Spread over: <strong className="text-[var(--color-text)]">{tenure} month(s)</strong></label>
          <input type="range" min={2} max={12} step={1} value={tenure} onChange={e => setTenure(Number(e.target.value))} className="w-full mt-1 accent-[var(--color-primary)]" />
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the {label} amount and rate to see the EMI and the true cost of paying over time.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Monthly instalment", value: fc(Math.round(result.monthlyEmi)), color: "text-[var(--color-text)]" },
              { label: "Total finance charge", value: formatAmount(Math.round(result.totalCost)), color: "text-red-400" },
              { label: "Of which fees", value: fc(Math.round(result.fees)), color: "text-yellow-400" },
              { label: "Effective APR", value: result.effRate !== null ? `${result.effRate.toFixed(2)}%` : "-", color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)]">
            <p className="text-sm font-medium flex items-center gap-2">
              <HandCoins size={14} className="text-[var(--color-primary)]" />
              Spreading {fc(lump)} over {tenure} months costs you {formatAmount(Math.round(result.totalCost))} extra - about {((result.totalCost / Math.max(1, lump)) * 100).toFixed(1)}% of the amount. Pay upfront if you have idle cash earning less than {result.effRate !== null ? `${result.effRate.toFixed(1)}%` : "this APR"}.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Financing a one-off liability preserves working capital but the all-in cost (interest + fees) is real. Compare the effective APR to your next-best use of that cash - and to any penalty for paying the underlying liability late.</p>
    </div>
  );
}

// ── #110 Refund / ITC Bridge Advance Estimator ───────────────────────────────────
// Cash blocked in a pending GST input-credit refund or a TDS/income-tax refund can be
// bridge-financed today. This estimates net proceeds after advance-rate haircut and
// the carrying cost until the refund actually lands, with a cost-per-day view.
function RefundBridgeAdvance() {
  const [kind, setKind] = useState<"itc" | "tds" | "gst">("itc");
  const [refundStr, setRefundStr] = useFeatureState<string>("debt-refundbridge-amt", "");
  const [advancePct, setAdvancePct] = useState(85);
  const [rateStr, setRateStr] = useState("18");
  const [days, setDays] = useState(60);
  const [procStr, setProcStr] = useState("1");
  const fc = formatCurrency;

  const refund = parseFloat(refundStr) || 0;
  const rate = parseFloat(rateStr) || 0;
  const procPct = parseFloat(procStr) || 0;

  const result = useMemo(() => {
    if (refund <= 0 || days <= 0) return null;
    const advance = refund * (advancePct / 100);
    const fees = advance * (procPct / 100);
    const interest = advance * (rate / 100) * (days / 365);
    const totalCost = interest + fees;
    const netToday = advance - fees;            // cash you receive now
    const costPerDay = totalCost / days;
    const effCostPct = (totalCost / Math.max(1, advance)) * 100;
    return { advance, fees, interest, totalCost, netToday, costPerDay, effCostPct };
  }, [refund, advancePct, rate, days, procPct]);

  const kindLabel = kind === "itc" ? "blocked GST input-tax credit" : kind === "tds" ? "TDS / income-tax refund" : "GST refund";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Refund / ITC bridge advance estimator</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Receivable type</label>
            <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={DINP}>
              <option value="itc">GST input-tax credit</option>
              <option value="tds">TDS / tax refund</option>
              <option value="gst">GST refund claim</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Refund amount (₹)</label>
            <input type="number" value={refundStr} onChange={e => setRefundStr(e.target.value)} placeholder="500000" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Days till refund lands</label>
            <input type="number" value={days} onChange={e => setDays(Number(e.target.value) || 0)} placeholder="60" className={DINP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Advance rate: <strong className="text-[var(--color-text)]">{advancePct}%</strong></label>
            <input type="range" min={50} max={95} step={5} value={advancePct} onChange={e => setAdvancePct(Number(e.target.value))} className="w-full mt-2 accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Bridge rate (% p.a.)</label>
            <input type="number" value={rateStr} onChange={e => setRateStr(e.target.value)} placeholder="18" className={DINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Processing %</label>
            <input type="number" value={procStr} onChange={e => setProcStr(e.target.value)} placeholder="1" className={DINP} />
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the {kindLabel} amount and expected wait to see what bridging it costs.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Cash you get today", value: formatAmount(Math.round(result.netToday)), color: "text-green-400", sub: `${advancePct}% advance less fees` },
              { label: "Bridge cost", value: formatAmount(Math.round(result.totalCost)), color: "text-red-400", sub: `over ${days} days` },
              { label: "Cost per day", value: fc(Math.round(result.costPerDay)), color: "text-yellow-400", sub: "carrying cost" },
              { label: "Effective cost", value: `${result.effCostPct.toFixed(1)}%`, color: "text-[var(--color-primary)]", sub: "of advance drawn" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg)]">
            <p className="text-sm font-medium flex items-center gap-2">
              <Banknote size={14} className="text-[var(--color-primary)]" />
              Bridging {fc(refund)} of {kindLabel} frees {formatAmount(Math.round(result.netToday))} now and costs {formatAmount(Math.round(result.totalCost))} until it lands. Worth it if that cash earns or saves more than {fc(Math.round(result.costPerDay))} a day in your business.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Lenders advance a haircut (typically 80-90%) of a verified refund and settle on receipt. Interest accrues only for the days outstanding - so the faster the refund clears, the cheaper the bridge. GST ITC refunds can themselves earn statutory interest on delay; net that off before deciding.</p>
    </div>
  );
}
