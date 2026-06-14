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
} from "lucide-react";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const loans = store.activeLoans;

  const [tab, setTab] = useState<"overview" | "amortise" | "dscr" | "refinance" | "moratorium">("overview");
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
          <h1 className="text-xl font-bold flex items-center gap-2"><Scale size={18} className="text-[var(--color-primary)]" /> Debt Manager</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Consolidated view of every loan — amortisation, prepayment savings, refinance maths, lender covenants.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", Scale],
            ["amortise", "Amortise & Prepay", Calculator],
            ["dscr", "DSCR / Coverage", ShieldAlert],
            ["refinance", "Refinance Compare", GitCompareArrows],
            ["moratorium", "Moratorium Re-cast", PauseCircle],
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

      {tab === "overview" && <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Outstanding", value: formatAmount(snap.debtOutstanding), color: "text-[var(--color-text)]", sub: `${loans.length} active loan(s)` },
          { label: "Monthly Debt Service", value: formatAmount(snap.monthlyDebtService), color: "text-red-400", sub: `${formatAmount(snap.monthlyInterest)}/mo is pure interest` },
          { label: "Weighted Avg Rate", value: snap.weightedAvgRatePct !== null ? `${snap.weightedAvgRatePct.toFixed(1)}%` : "—", color: "text-yellow-400", sub: "Across all loans" },
          { label: "DSCR", value: snap.dscr !== null ? `${snap.dscr.toFixed(2)}x` : "No debt", color: dscrOk ? "text-green-400" : "text-red-400", sub: dscrOk ? "Above 1.25x lender bar" : "Below 1.25x — refinance risk" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {loans.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
          <Landmark size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">No active loans</p>
          <p className="text-xs text-[var(--color-muted)] mb-4">When you accept a credit offer it appears here with its full amortisation schedule.</p>
          <button onClick={() => navigate("/credit")} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg font-medium">
            Explore credit options →
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
                <p className="text-sm font-semibold mb-1">Amortisation — {selected.lender}</p>
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
                  <p className="text-xs text-[var(--color-muted)] mb-4">One-time lump sum, same EMI — see how much interest disappears.</p>
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
                  <p className="text-sm font-semibold">Repayment Schedule — next 12 months</p>
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
              { label: "Interest Saved", value: result.withPrepay ? formatAmount(Math.max(0, Math.round(result.base.totalInterest - result.withPrepay.totalInterest))) : "—", color: "text-green-400" },
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
              <p className="text-sm font-semibold">Amortisation Schedule {result.withPrepay ? "(with prepayment)" : ""} — first 24 months</p>
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
                      <td className="px-4 py-2 tabular-nums text-[var(--color-primary)]">{r.prepay > 0 ? fc(Math.round(r.prepay)) : "—"}</td>
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
          { label: "Interest Coverage", value: icr !== null ? `${icr.toFixed(2)}x` : "—", color: icr === null || icr >= 2 ? "text-green-400" : "text-red-400", sub: "EBIT-proxy ÷ interest" },
          { label: "Debt / NOI (leverage)", value: leverage !== null ? `${leverage.toFixed(2)}x` : "—", color: leverage === null || leverage <= 3 ? "text-green-400" : "text-yellow-400", sub: "Outstanding ÷ annual NOI" },
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
                      <td className="px-3 py-2.5 tabular-nums">{v !== null ? `${v.toFixed(2)}x` : "—"}</td>
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
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> One or more covenants are in breach. Lenders can recall the facility or reprice — engage proactively before the next reporting date.</p>
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
                    <td className="px-3 py-2.5 tabular-nums text-[var(--color-primary)]">{o.effRate !== null ? `${o.effRate.toFixed(2)}%` : "—"}</td>
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
            <TrendingDown size={14} /> {best.lender} at {best.rate}% has the lowest all-in cost ({formatAmount(Math.round(best.totalCost))} incl. {fc(Math.round(best.fees))} fees){best.totalCost < existing.totalInterest ? ` — ~${formatAmount(Math.round(existing.totalInterest - best.totalCost))} cheaper than staying put.` : " — but your current loans are still cheaper; consolidating may not pay off."}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">All-in cost = lifetime interest + processing & other upfront fees. Effective APR is the IRR of the net disbursal vs the EMI stream — the true comparable cost. Factor in any foreclosure charges on the loans being closed.</p>
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
              {loans.map(l => <option key={l.id} value={l.id}>{l.lender} — {fc(Math.round(l.outstanding))} @ {l.rate}%</option>)}
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
          Capitalise interest during moratorium (add to principal) — uncheck if the lender waives it
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
