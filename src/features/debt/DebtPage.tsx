import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import {
  computeFinancialSnapshot, amortizationSchedule, totalInterest, prepaymentImpact, emi,
} from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { Scale, Landmark, ArrowRight, Zap } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Scale size={18} className="text-[var(--color-primary)]" /> Debt Manager</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Consolidated view of every loan — amortisation, prepayment savings, refinance maths, lender covenants.
        </p>
      </div>

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
    </div>
  );
}
