import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { termSheetMath, type RoundType } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { ScrollText, Printer, Info } from "lucide-react";

const ROUND_LABELS: Record<RoundType, string> = {
  priced:      "Priced Equity Round",
  safe:        "SAFE (Simple Agreement for Future Equity)",
  convertible: "Convertible Note",
  rev_share:   "Revenue-Share Agreement",
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[var(--color-muted)] mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

export default function TermSheetPage() {
  const { store } = useApp();
  const { firm } = store;

  const [roundType, setRoundType]   = useState<RoundType>("priced");
  const [company, setCompany]       = useState(firm.legalName || firm.name || "");
  const [investor, setInvestor]     = useState("");
  const [investment, setInvestment] = useState(2_500_000);
  const [preMoney, setPreMoney]     = useState(25_000_000);
  const [valuationCap, setCap]      = useState(40_000_000);
  const [discountPct, setDiscount]  = useState(20);
  const [interestPct, setInterest]  = useState(8);
  const [termMonths, setTermMonths] = useState(24);
  const [optionPoolPct, setPool]    = useState(10);
  const [revShareMultiple, setRev]  = useState(1.5);
  const [liqPref, setLiqPref]       = useState("1x non-participating");
  const [boardSeat, setBoardSeat]   = useState(false);
  const [proRata, setProRata]       = useState(true);

  const result = useMemo(() => termSheetMath({
    roundType, investment, preMoney, valuationCap, discountPct, interestPct, termMonths, optionPoolPct, revShareMultiple,
  }), [roundType, investment, preMoney, valuationCap, discountPct, interestPct, termMonths, optionPoolPct, revShareMultiple]);

  const isEquity = roundType === "priced" || roundType === "safe" || roundType === "convertible";
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const validity = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ScrollText size={18} className="text-[var(--color-primary)]" /> Term Sheet Generator</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Model a fundraise and produce a ready-to-share, non-binding term sheet.</p>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
          <Printer size={13} /> Print / PDF
        </button>
      </div>

      {/* Round type selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {(Object.keys(ROUND_LABELS) as RoundType[]).map(rt => (
          <button key={rt} onClick={() => setRoundType(rt)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${roundType === rt ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {rt === "priced" ? "Priced Round" : rt === "safe" ? "SAFE" : rt === "convertible" ? "Convertible Note" : "Revenue Share"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Inputs ── */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
          <p className="text-sm font-semibold">Deal terms</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Company"><input value={company} onChange={e => setCompany(e.target.value)} className={inputCls} /></Field>
            <Field label="Investor / Lead"><input value={investor} onChange={e => setInvestor(e.target.value)} placeholder="e.g. Acme Ventures" className={inputCls} /></Field>
            <Field label="Investment amount (₹)"><input type="number" value={investment} onChange={e => setInvestment(+e.target.value)} className={inputCls} /></Field>

            {roundType === "priced" && (
              <Field label="Pre-money valuation (₹)"><input type="number" value={preMoney} onChange={e => setPreMoney(+e.target.value)} className={inputCls} /></Field>
            )}
            {(roundType === "safe" || roundType === "convertible") && (
              <>
                <Field label="Valuation cap (₹)"><input type="number" value={valuationCap} onChange={e => setCap(+e.target.value)} className={inputCls} /></Field>
                <Field label="Discount %" hint="Discount to next round's price"><input type="number" value={discountPct} onChange={e => setDiscount(+e.target.value)} className={inputCls} /></Field>
              </>
            )}
            {roundType === "convertible" && (
              <>
                <Field label="Interest % p.a."><input type="number" value={interestPct} onChange={e => setInterest(+e.target.value)} className={inputCls} /></Field>
                <Field label="Maturity (months)"><input type="number" value={termMonths} onChange={e => setTermMonths(+e.target.value)} className={inputCls} /></Field>
              </>
            )}
            {roundType === "priced" && (
              <Field label="New option pool %" hint="Created pre-money for hires"><input type="number" value={optionPoolPct} onChange={e => setPool(+e.target.value)} className={inputCls} /></Field>
            )}
            {roundType === "rev_share" && (
              <>
                <Field label="Repayment cap (×)" hint="e.g. 1.5× the investment"><input type="number" step="0.1" value={revShareMultiple} onChange={e => setRev(+e.target.value)} className={inputCls} /></Field>
                <Field label="Term (months)"><input type="number" value={termMonths} onChange={e => setTermMonths(+e.target.value)} className={inputCls} /></Field>
              </>
            )}
          </div>

          {isEquity && (
            <div className="space-y-3 pt-2 border-t border-[var(--color-border)]">
              <Field label="Liquidation preference">
                <select value={liqPref} onChange={e => setLiqPref(e.target.value)} className={inputCls}>
                  <option>1x non-participating</option>
                  <option>1x participating</option>
                  <option>1.5x non-participating</option>
                  <option>None</option>
                </select>
              </Field>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={boardSeat} onChange={e => setBoardSeat(e.target.checked)} className="accent-[var(--color-primary)]" /> Board seat
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={proRata} onChange={e => setProRata(e.target.checked)} className="accent-[var(--color-primary)]" /> Pro-rata rights
                </label>
              </div>
            </div>
          )}

          {/* Computed economics */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--color-border)]">
            {isEquity ? (
              <>
                <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-muted)]">Post-money</p>
                  <p className="text-base font-bold text-[var(--color-primary)] tabular-nums">{formatAmount(result.postMoney)}</p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-muted)]">Investor stake</p>
                  <p className="text-base font-bold text-green-400 tabular-nums">{result.investorPct}%</p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-muted)]">Founders after</p>
                  <p className="text-base font-bold tabular-nums">{result.founderPctAfter}%</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-muted)]">Total repayment</p>
                  <p className="text-base font-bold text-[var(--color-primary)] tabular-nums">{formatAmount(result.repaymentTotal)}</p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)] col-span-2">
                  <p className="text-[10px] text-[var(--color-muted)]">Structure</p>
                  <p className="text-xs font-medium mt-0.5">No equity — repaid from revenue</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Generated term sheet document ── */}
        <div className="bg-white text-gray-900 rounded-lg p-6 shadow-lg overflow-hidden" id="termsheet-doc">
          <div className="text-center border-b-2 border-gray-200 pb-3 mb-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-400">Non-binding term sheet</p>
            <h2 className="text-lg font-bold mt-1">{company || "Your Company"}</h2>
            <p className="text-xs text-gray-500">{ROUND_LABELS[roundType]} · {today}</p>
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-100">
              {[
                ["Investor", investor || "—"],
                ["Investment amount", formatCurrency(investment)],
                ...(roundType === "priced" ? [
                  ["Pre-money valuation", formatCurrency(preMoney)],
                  ["Post-money valuation", formatCurrency(result.postMoney)],
                  ["Investor ownership", `${result.investorPct}%`],
                  ["New option pool", `${optionPoolPct}% (pre-money)`],
                  ["Founder ownership (after)", `${result.founderPctAfter}%`],
                ] : []),
                ...(roundType === "safe" ? [
                  ["Valuation cap", formatCurrency(valuationCap)],
                  ["Discount", `${discountPct}%`],
                  ["Ownership at conversion (est.)", `${result.investorPct}%`],
                ] : []),
                ...(roundType === "convertible" ? [
                  ["Valuation cap", formatCurrency(valuationCap)],
                  ["Discount", `${discountPct}%`],
                  ["Interest", `${interestPct}% p.a.`],
                  ["Maturity", `${termMonths} months`],
                  ["Repayment at maturity", formatCurrency(result.repaymentTotal)],
                ] : []),
                ...(roundType === "rev_share" ? [
                  ["Repayment cap", `${revShareMultiple}× (${formatCurrency(result.repaymentTotal)})`],
                  ["Term", `${termMonths} months`],
                  ["Security", "None — revenue-linked"],
                ] : []),
                ...(isEquity ? [
                  ["Liquidation preference", liqPref],
                  ["Board seat", boardSeat ? "Yes — 1 investor seat" : "No"],
                  ["Pro-rata rights", proRata ? "Yes" : "No"],
                ] : []),
                ["Conversion / structure", result.conversionNote],
                ["Valid until", validity],
              ].map(([k, v], i) => (
                <tr key={i}>
                  <td className="py-2 pr-3 font-medium text-gray-600 align-top w-2/5">{k}</td>
                  <td className="py-2 text-gray-900">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[9px] text-gray-400 mt-4 leading-relaxed border-t border-gray-200 pt-3">
            This term sheet is a non-binding summary of proposed terms for discussion only and does not constitute an offer,
            commitment or legal advice. Binding terms are subject to definitive agreements, due diligence and board approval.
            Generated by Headroom.
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-3 flex gap-2">
        <Info size={13} className="text-[var(--color-muted)] shrink-0 mt-px" />
        <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
          {result.pricePerShareNote} SAFE/convertible ownership is an estimate using the valuation cap; final ownership is set at the next priced round.
        </p>
      </div>
    </div>
  );
}
