import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { termSheetMath, type RoundType } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { ScrollText, Printer, Info, GitCompare, TrendingDown, Users, BookOpen, Percent, Layers, Scale, CalendarClock, ListChecks, Sparkles, Network, Landmark, Milestone, Clock, LineChart } from "lucide-react";

type TermTab = "generator" | "comparator" | "liq-pref" | "esop-topup" | "clause-explainer" | "anti-dilution" | "pro-rata" | "safe-vs-priced" | "vesting" | "checklist" | "multi-class-waterfall" | "board-modeler" | "tranche-planner" | "note-maturity" | "dilution-rounds";

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

  const [tab, setTab] = useState<TermTab>("generator");

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
        {tab === "generator" && (
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
            <Printer size={13} /> Print / PDF
          </button>
        )}
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {([["generator", "Generator", ScrollText], ["comparator", "Offer Comparator", GitCompare], ["liq-pref", "Liquidation Pref", TrendingDown], ["esop-topup", "ESOP Top-up Impact", Users], ["clause-explainer", "Clause Explainer", BookOpen], ["anti-dilution", "Anti-Dilution", Layers], ["pro-rata", "Pro-Rata Rights", Percent], ["safe-vs-priced", "SAFE vs Priced", Scale], ["vesting", "Vesting Schedule", CalendarClock], ["checklist", "Term-Sheet Checklist", ListChecks], ["multi-class-waterfall", "Multi-Class Waterfall", Network], ["board-modeler", "Board Composition", Landmark], ["tranche-planner", "Tranche Planner", Milestone], ["note-maturity", "Note Maturity", Clock], ["dilution-rounds", "Dilution Over Rounds", LineChart]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {tab === "comparator"      && <TermSheetComparator />}
      {tab === "liq-pref"        && <LiquidationPrefModeller />}
      {tab === "esop-topup"      && <EsopTopupImpact />}
      {tab === "clause-explainer" && <ClauseExplainer />}
      {tab === "anti-dilution"   && <AntiDilutionCalc />}
      {tab === "pro-rata"        && <ProRataCalc />}
      {tab === "safe-vs-priced"  && <SafeVsPriced />}
      {tab === "vesting"         && <VestingSchedule />}
      {tab === "checklist"       && <TermSheetChecklist />}
      {tab === "multi-class-waterfall" && <MultiClassWaterfall />}
      {tab === "board-modeler"   && <BoardCompositionModeler />}
      {tab === "tranche-planner" && <TranchePlanner />}
      {tab === "note-maturity"   && <NoteMaturityScenarios />}
      {tab === "dilution-rounds" && <DilutionOverRounds />}

      {tab === "generator" && <>
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
      </>}
    </div>
  );
}

const tsInp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// ── #120 Term-Sheet Comparator — compare 2-3 offers on valuation / liquidation / control ──
interface Offer {
  id: string;
  investor: string;
  investment: number;
  preMoney: number;
  liqPrefX: number;
  participating: boolean;
  optionPoolPct: number;   // new pool created pre-money
  boardSeats: number;
  proRata: boolean;
}

function blankOffer(n: number): Offer {
  return {
    id: Math.random().toString(36).slice(2),
    investor: `Offer ${String.fromCharCode(64 + n)}`,
    investment: 2_500_000,
    preMoney: 25_000_000,
    liqPrefX: 1,
    participating: false,
    optionPoolPct: 10,
    boardSeats: 1,
    proRata: true,
  };
}

function TermSheetComparator() {
  const [offers, setOffers] = useState<Offer[]>([blankOffer(1), blankOffer(2)]);

  const patch = (id: string, key: keyof Offer, value: Offer[keyof Offer]) =>
    setOffers(prev => prev.map(o => (o.id === id ? { ...o, [key]: value } : o)));

  const computed = offers.map(o => {
    const postMoney = o.preMoney + o.investment;
    const investorPct = postMoney > 0 ? (o.investment / postMoney) * 100 : 0;
    // Pool is created pre-money → dilutes founders, not the new investor
    const founderPct = Math.max(0, 100 - investorPct - o.optionPoolPct);
    return { ...o, postMoney, investorPct, founderPct };
  });

  // "Best" heuristics: highest pre-money, highest founder ownership, lightest liq pref / control
  const best = {
    preMoney: Math.max(...computed.map(o => o.preMoney)),
    founderPct: Math.max(...computed.map(o => o.founderPct)),
    liqPrefX: Math.min(...computed.map(o => o.liqPrefX)),
    boardSeats: Math.min(...computed.map(o => o.boardSeats)),
  };
  const fc = formatCurrency;

  const rows: { key: string; label: string; render: (o: typeof computed[number]) => React.ReactNode; highlight?: (o: typeof computed[number]) => boolean }[] = [
    { key: "investment", label: "Investment", render: o => fc(o.investment) },
    { key: "preMoney", label: "Pre-money valuation", render: o => formatAmount(o.preMoney), highlight: o => o.preMoney === best.preMoney },
    { key: "postMoney", label: "Post-money valuation", render: o => formatAmount(o.postMoney) },
    { key: "investorPct", label: "Investor stake", render: o => `${o.investorPct.toFixed(1)}%` },
    { key: "optionPoolPct", label: "New option pool (pre-money)", render: o => `${o.optionPoolPct}%` },
    { key: "founderPct", label: "Founder ownership (after)", render: o => `${o.founderPct.toFixed(1)}%`, highlight: o => o.founderPct === best.founderPct },
    { key: "liqPref", label: "Liquidation preference", render: o => `${o.liqPrefX}× ${o.participating ? "participating" : "non-part."}`, highlight: o => o.liqPrefX === best.liqPrefX && !o.participating },
    { key: "boardSeats", label: "Investor board seats", render: o => `${o.boardSeats}`, highlight: o => o.boardSeats === best.boardSeats },
    { key: "proRata", label: "Pro-rata rights", render: o => (o.proRata ? "Yes" : "No") },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><GitCompare size={14} className="text-[var(--color-primary)]" /> Term-Sheet Comparator</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Lay 2-3 offers side-by-side on valuation, liquidation and control. Best value per row is highlighted.</p>
          </div>
          {offers.length < 3 && (
            <button onClick={() => setOffers(prev => [...prev, blankOffer(prev.length + 1)])}
              className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">+ Add offer</button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {offers.map((o, i) => (
            <div key={o.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <input value={o.investor} onChange={e => patch(o.id, "investor", e.target.value)}
                  className="bg-transparent text-sm font-semibold outline-none w-full" />
                {offers.length > 1 && (
                  <button onClick={() => setOffers(prev => prev.filter(x => x.id !== o.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs shrink-0">✕</button>
                )}
              </div>
              <label className="text-[10px] text-[var(--color-muted)] block">Investment (₹)
                <input type="number" value={o.investment} onChange={e => patch(o.id, "investment", +e.target.value)} className={tsInp} />
              </label>
              <label className="text-[10px] text-[var(--color-muted)] block">Pre-money (₹)
                <input type="number" value={o.preMoney} onChange={e => patch(o.id, "preMoney", +e.target.value)} className={tsInp} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-[var(--color-muted)] block">Liq. pref (×)
                  <input type="number" step="0.5" min={0} value={o.liqPrefX} onChange={e => patch(o.id, "liqPrefX", +e.target.value)} className={tsInp} />
                </label>
                <label className="text-[10px] text-[var(--color-muted)] block">New pool %
                  <input type="number" min={0} value={o.optionPoolPct} onChange={e => patch(o.id, "optionPoolPct", +e.target.value)} className={tsInp} />
                </label>
              </div>
              <label className="text-[10px] text-[var(--color-muted)] block">Investor board seats
                <input type="number" min={0} value={o.boardSeats} onChange={e => patch(o.id, "boardSeats", +e.target.value)} className={tsInp} />
              </label>
              <div className="flex gap-3 pt-0.5">
                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input type="checkbox" checked={o.participating} onChange={e => patch(o.id, "participating", e.target.checked)} className="accent-[var(--color-primary)]" /> Participating
                </label>
                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input type="checkbox" checked={o.proRata} onChange={e => patch(o.id, "proRata", e.target.checked)} className="accent-[var(--color-primary)]" /> Pro-rata
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">Term</th>
              {computed.map(o => (
                <th key={o.id} className="text-left text-xs font-semibold px-4 py-2.5">{o.investor}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.label}</td>
                {computed.map(o => {
                  const win = r.highlight?.(o) ?? false;
                  return (
                    <td key={o.id} className={`px-4 py-2.5 tabular-nums text-xs ${win ? "text-green-400 font-semibold" : ""}`}>
                      {r.render(o)}{win && " ✓"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Option pool is assumed created pre-money, so it dilutes founders not the incoming investor. A higher liquidation multiple or participating preference reduces founder/common payout at exit — model it in the Liquidation Pref tab.
      </div>
    </div>
  );
}

// ── #121 Liquidation-Preference Modeller — 1x/2x participating vs non-participating at exit ──
function LiquidationPrefModeller() {
  const [exitValue, setExitValue]       = useState(50_000_000);
  const [investment, setInvestment]     = useState(10_000_000);
  const [investorPct, setInvestorPct]   = useState(20);
  const [prefX, setPrefX]               = useState(1);
  const [participating, setParticipating] = useState(false);
  const [capX, setCapX]                 = useState(0); // 0 = uncapped participating

  const exit = Math.max(0, exitValue);
  const ownership = Math.min(100, Math.max(0, investorPct)) / 100;
  const prefAmount = investment * prefX;

  // Non-participating: investor takes the GREATER of pref or as-converted equity
  // Participating: pref + pro-rata share of the remainder (optionally capped at capX × investment)
  let investorPayout: number;
  let mode: string;
  if (!participating) {
    const asConverted = exit * ownership;
    if (asConverted >= prefAmount) {
      investorPayout = asConverted;
      mode = "Converts to common (as-converted ≥ preference)";
    } else {
      investorPayout = Math.min(prefAmount, exit);
      mode = "Takes preference (greater than as-converted)";
    }
  } else {
    const pref = Math.min(prefAmount, exit);
    const remainder = Math.max(0, exit - pref);
    let participation = pref + remainder * ownership;
    mode = "Preference + pro-rata participation";
    if (capX > 0) {
      const cap = investment * capX;
      if (participation > cap) {
        participation = cap;
        mode = `Capped at ${capX}× (${formatAmount(cap)})`;
      }
    }
    investorPayout = Math.min(participation, exit);
  }
  const commonPayout = Math.max(0, exit - investorPayout);
  const investorMultiple = investment > 0 ? investorPayout / investment : 0;
  const investorSharePct = exit > 0 ? (investorPayout / exit) * 100 : 0;
  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingDown size={14} className="text-[var(--color-primary)]" /> Liquidation-Preference Modeller</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">See how a 1×/2× participating vs non-participating preference splits exit proceeds between the investor and common (founders/ESOP).</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Exit / sale value (₹)
            <input type="number" value={exitValue} onChange={e => setExitValue(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Investor capital (₹)
            <input type="number" value={investment} onChange={e => setInvestment(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Investor ownership %
            <input type="number" value={investorPct} onChange={e => setInvestorPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Preference multiple (×)
            <input type="number" step="0.5" min={0} value={prefX} onChange={e => setPrefX(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Participation cap (×, 0 = none)
            <input type="number" step="0.5" min={0} disabled={!participating} value={capX} onChange={e => setCapX(+e.target.value)} className={`${tsInp} ${!participating ? "opacity-40" : ""}`} />
          </label>
          <label className="flex items-end gap-2 text-xs cursor-pointer pb-2">
            <input type="checkbox" checked={participating} onChange={e => setParticipating(e.target.checked)} className="accent-[var(--color-primary)]" /> Participating
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Investor payout", value: fc(investorPayout), color: "text-[var(--color-primary)]" },
          { label: "Investor return", value: `${investorMultiple.toFixed(2)}×`, color: investorMultiple >= prefX ? "text-green-400" : "text-orange-400" },
          { label: "Investor share of exit", value: `${investorSharePct.toFixed(1)}%`, color: "text-blue-400" },
          { label: "Common payout (founders/ESOP)", value: fc(commonPayout), color: commonPayout > 0 ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-2">Waterfall — {mode}</p>
        <div className="space-y-2">
          {[
            { label: "Investor (preferred)", value: investorPayout, color: "#6366f1" },
            { label: "Common (founders + ESOP)", value: commonPayout, color: "#22c55e" },
          ].map(b => {
            const pct = exit > 0 ? (b.value / exit) * 100 : 0;
            return (
              <div key={b.label}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="font-medium">{b.label}</span>
                  <span className="tabular-nums" style={{ color: b.color }}>{fc(b.value)} · {pct.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: b.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Non-participating preferred takes the greater of its preference or its as-converted equity (it does not double-dip). Participating preferred takes its preference and then shares the remainder pro-rata, unless capped. Single class assumed; real stacks have seniority/pari-passu ordering.
      </div>
    </div>
  );
}

// ── #122 ESOP-Pool Top-up Impact — dilution from expanding the pool pre-round ──
function EsopTopupImpact() {
  const [founderPct, setFounderPct]       = useState(70);
  const [investorPct, setInvestorPct]     = useState(20);
  const [currentPoolPct, setCurrentPoolPct] = useState(10);
  const [targetPoolPct, setTargetPoolPct] = useState(15);
  const [postMoney, setPostMoney]         = useState(100_000_000);

  // Pool top-up created pre-money: the increment dilutes everyone EXCEPT the new pool itself.
  // Existing holders (founders, prior investors, existing pool) are scaled down to make room
  // for the additional pool so the new total pool reaches targetPoolPct.
  const topUpPct = Math.max(0, targetPoolPct - currentPoolPct);
  // Existing pool keeps its shares; founders + prior investors absorb the top-up dilution
  // so that founders + prior investors + currentPool + topUp = 100.
  const nonPoolBase = founderPct + investorPct;
  const scaleNonPool = nonPoolBase > 0 ? Math.max(0, (100 - targetPoolPct - currentPoolPct) / nonPoolBase) : 1;

  const after = {
    founder: Math.max(0, founderPct * scaleNonPool),
    investor: Math.max(0, investorPct * scaleNonPool),
    pool: targetPoolPct,
  };
  const founderDilution = founderPct - after.founder;
  const founderValueLost = postMoney * (founderDilution / 100);
  const valid = Math.abs((founderPct + investorPct + currentPoolPct) - 100) < 0.5;
  const fc = formatCurrency;

  const rows = [
    { label: "Founders / common", before: founderPct, afterV: after.founder },
    { label: "Prior investors", before: investorPct, afterV: after.investor },
    { label: "ESOP pool", before: currentPoolPct, afterV: after.pool },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> ESOP-Pool Top-up Impact</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Investors often demand a bigger option pool created pre-round — the increment comes out of founders' shares. See the dilution before you sign.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Founder / common %
            <input type="number" value={founderPct} onChange={e => setFounderPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Prior investor %
            <input type="number" value={investorPct} onChange={e => setInvestorPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Current pool %
            <input type="number" value={currentPoolPct} onChange={e => setCurrentPoolPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Target pool % (post top-up)
            <input type="number" value={targetPoolPct} onChange={e => setTargetPoolPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Post-money valuation (₹)
            <input type="number" value={postMoney} onChange={e => setPostMoney(+e.target.value)} className={tsInp} />
          </label>
        </div>
        {!valid && (
          <p className="text-[11px] text-orange-400">Founders + prior investors + current pool should total 100% (currently {(founderPct + investorPct + currentPoolPct).toFixed(1)}%).</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pool top-up", value: `+${topUpPct.toFixed(1)}%`, color: "text-[var(--color-primary)]" },
          { label: "Founder stake after", value: `${after.founder.toFixed(1)}%`, color: "text-[var(--color-text)]" },
          { label: "Founder dilution", value: `−${founderDilution.toFixed(1)}%`, color: founderDilution > 0 ? "text-red-400" : "text-green-400" },
          { label: "Founder value diluted", value: fc(Math.round(founderValueLost)), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Stakeholder", "Before", "After top-up", "Change"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const delta = r.afterV - r.before;
              return (
                <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.label}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.before.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.afterV.toFixed(1)}%</td>
                  <td className={`px-4 py-2.5 tabular-nums ${delta < -0.05 ? "text-red-400" : delta > 0.05 ? "text-green-400" : "text-[var(--color-muted)]"}`}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        A pre-money pool top-up effectively lowers the founders' real pre-money price — the &quot;option pool shuffle.&quot; Negotiating the pool post-money, or sizing it to the actual hiring plan, preserves founder ownership. Single-round model; convert existing pool too if it carries over.
      </div>
    </div>
  );
}

// ── #123 Term-Sheet Clause Explainer — plain-language clause library with founder/investor impact ──
interface ClauseInfo {
  id: string;
  name: string;
  founderFriendly: "good" | "neutral" | "watch";
  what: string;
  impact: string;
  negotiate: string;
}

const CLAUSES: ClauseInfo[] = [
  { id: "liq-pref", name: "Liquidation Preference", founderFriendly: "watch",
    what: "Defines how sale/wind-up proceeds are split. A 1× preference returns the investor's money first; participating preferred then also shares the remainder.",
    impact: "Higher multiples (2×, 3×) or 'participating' terms cut founder/common payout sharply on modest exits.",
    negotiate: "Hold to 1× non-participating. Resist participation, or cap it at 2-3×." },
  { id: "anti-dilution", name: "Anti-Dilution Protection", founderFriendly: "watch",
    what: "Re-prices investor shares if you raise a later round at a lower price (a down round).",
    impact: "Full-ratchet repriced everything to the new low price — brutal dilution for founders. Weighted-average is gentler.",
    negotiate: "Always push for broad-based weighted-average, never full-ratchet." },
  { id: "drag-tag", name: "Drag-Along / Tag-Along", founderFriendly: "neutral",
    what: "Drag-along lets a majority force minority holders to join a sale; tag-along lets minorities join a majority's sale on the same terms.",
    impact: "Drag can force a sale founders dislike; tag protects small holders from being left behind.",
    negotiate: "Set a sensible drag threshold (e.g. majority of preferred + founders) and a minimum price floor." },
  { id: "rofr", name: "Right of First Refusal (ROFR)", founderFriendly: "neutral",
    what: "Before selling shares to an outsider, you must first offer them to existing investors/company on the same terms.",
    impact: "Slows secondary sales and can deter outside buyers, but keeps the cap table clean.",
    negotiate: "Agree a clear notice window and exemptions for estate/affiliate transfers." },
  { id: "board", name: "Board Composition", founderFriendly: "watch",
    what: "Sets how many board seats the investor gets and who controls votes.",
    impact: "Loss of board majority means founders can be overruled on hiring, budgets, even removal.",
    negotiate: "Keep founder/independent majority at seed; offer one investor seat, not control." },
  { id: "protective", name: "Protective Provisions / Veto Rights", founderFriendly: "neutral",
    what: "Lists corporate actions (new debt, new shares, sale, budget) that need investor consent.",
    impact: "Broad vetoes let a minority investor block ordinary operating decisions.",
    negotiate: "Narrow the list to genuinely major events; add materiality thresholds." },
  { id: "prorata", name: "Pro-Rata Rights", founderFriendly: "good",
    what: "Lets the investor invest enough in future rounds to keep their ownership percentage.",
    impact: "Standard and usually fine, but heavy pro-rata can crowd out new lead investors later.",
    negotiate: "Grant to major investors; consider a super-pro-rata cap." },
  { id: "founder-vest", name: "Founder Vesting / Reverse Vesting", founderFriendly: "neutral",
    what: "Founders' own shares re-vest over time, so a departing founder forfeits unvested equity.",
    impact: "Protects the cap table if a co-founder leaves, but resets your earned ownership clock.",
    negotiate: "Credit time already served and seek acceleration on involuntary exit/acquisition." },
];

function ClauseExplainer() {
  const [openId, setOpenId] = useState<string | null>(CLAUSES[0].id);
  const tone: Record<ClauseInfo["founderFriendly"], { label: string; cls: string }> = {
    good:    { label: "Founder-friendly", cls: "text-green-400" },
    neutral: { label: "Standard / neutral", cls: "text-blue-400" },
    watch:   { label: "Watch closely", cls: "text-orange-400" },
  };
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><BookOpen size={14} className="text-[var(--color-primary)]" /> Term-Sheet Clause Explainer</h3>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Plain-language guide to the clauses that decide control and payout. Tap any clause to see what it means, why it matters, and how to negotiate it.</p>
      </div>
      <div className="space-y-2">
        {CLAUSES.map(c => {
          const open = openId === c.id;
          return (
            <div key={c.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <button onClick={() => setOpenId(open ? null : c.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold ${tone[c.founderFriendly].cls}`}>{tone[c.founderFriendly].label}</span>
                  <span className="text-[var(--color-muted)] text-xs">{open ? "−" : "+"}</span>
                </span>
              </button>
              {open && (
                <div className="px-4 pb-4 space-y-2.5 border-t border-[var(--color-border)] pt-3">
                  <div><p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-0.5">What it is</p><p className="text-xs leading-relaxed">{c.what}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-0.5">Why it matters</p><p className="text-xs leading-relaxed">{c.impact}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-0.5">How to negotiate</p><p className="text-xs leading-relaxed text-green-400">{c.negotiate}</p></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Educational summary only — not legal advice. Always have a lawyer review your definitive documents before signing.
      </div>
    </div>
  );
}

// ── #124 Anti-Dilution Calculator — full-ratchet vs broad-based weighted-average on a down round ──
function AntiDilutionCalc() {
  const [origPrice, setOrigPrice]   = useState(100);     // ₹ per share investor paid
  const [origShares, setOrigShares] = useState(100_000); // preferred shares held by investor
  const [newPrice, setNewPrice]     = useState(60);      // ₹ per share in down round
  const [newMoney, setNewMoney]     = useState(20_000_000);
  const [preShares, setPreShares]   = useState(1_000_000); // total shares outstanding before new round (fully diluted)

  const np = Math.max(0.0001, newPrice);
  const newSharesIssued = newMoney / np;

  // Full ratchet: conversion price drops to the new round price
  const ratchetPrice = np;
  // Broad-based weighted average: CP2 = CP1 × (A + B) / (A + C)
  // A = shares outstanding before new issue, B = money raised / old price, C = actual new shares issued
  const A = Math.max(1, preShares);
  const B = origPrice > 0 ? newMoney / origPrice : 0;
  const C = newSharesIssued;
  const waPrice = origPrice * ((A + B) / (A + C));

  const conv = (cp: number) => {
    const price = Math.max(0.0001, cp);
    const asConvertedShares = (origShares * origPrice) / price; // shares investor gets after adjustment
    const bonus = asConvertedShares - origShares;
    return { asConvertedShares, bonus };
  };
  const noneCase    = { asConvertedShares: origShares, bonus: 0 };
  const ratchetCase = conv(ratchetPrice);
  const waCase      = conv(waPrice);

  const rows = [
    { label: "No protection", cp: origPrice, ...noneCase, color: "text-[var(--color-muted)]" },
    { label: "Weighted-average (broad-based)", cp: waPrice, ...waCase, color: "text-blue-400" },
    { label: "Full ratchet", cp: ratchetPrice, ...ratchetCase, color: "text-orange-400" },
  ];
  const down = newPrice < origPrice;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Anti-Dilution Calculator</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">When you raise a down round, anti-dilution gives earlier investors bonus shares. Compare the brutal full-ratchet against the standard broad-based weighted-average.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Original price / share (₹)
            <input type="number" value={origPrice} onChange={e => setOrigPrice(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Investor preferred shares
            <input type="number" value={origShares} onChange={e => setOrigShares(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Shares outstanding (pre, fully diluted)
            <input type="number" value={preShares} onChange={e => setPreShares(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">New round price / share (₹)
            <input type="number" value={newPrice} onChange={e => setNewPrice(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">New money raised (₹)
            <input type="number" value={newMoney} onChange={e => setNewMoney(+e.target.value)} className={tsInp} />
          </label>
        </div>
        {!down && <p className="text-[11px] text-green-400">New price ≥ original — no down round, so anti-dilution does not trigger.</p>}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Mechanism", "Adjusted conv. price", "Shares after adj.", "Bonus shares"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                <td className={`px-4 py-2.5 font-medium ${r.color}`}>{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.cp))}</td>
                <td className="px-4 py-2.5 tabular-nums">{Math.round(r.asConvertedShares).toLocaleString("en-IN")}</td>
                <td className="px-4 py-2.5 tabular-nums text-orange-400">{r.bonus > 0.5 ? `+${Math.round(r.bonus).toLocaleString("en-IN")}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Full ratchet resets the investor's conversion price to the new low price regardless of how few shares are sold — maximal founder dilution. Broad-based weighted-average blends old and new prices by volume, so a small down round causes only a small adjustment. Always negotiate for weighted-average.
      </div>
    </div>
  );
}

// ── #125 Pro-Rata Rights Calculator — what an investor must invest to hold their % in the next round ──
function ProRataCalc() {
  const [currentPct, setCurrentPct] = useState(15);
  const [roundSize, setRoundSize]   = useState(50_000_000);
  const [preMoney, setPreMoney]     = useState(150_000_000);

  const postMoney = preMoney + roundSize;
  const ownership = Math.min(100, Math.max(0, currentPct)) / 100;
  // To maintain ownership the investor must buy `ownership` of the NEW round
  const proRataInvestment = roundSize * ownership;
  // If they skip it, their stake is diluted by the round
  const dilutedPct = postMoney > 0 ? (ownership * preMoney) / postMoney * 100 : 0;
  const dilutionLost = currentPct - dilutedPct;
  const fc = formatCurrency;

  const cards = [
    { label: "Pro-rata cheque to hold %", value: fc(Math.round(proRataInvestment)), color: "text-[var(--color-primary)]" },
    { label: "Ownership if maintained", value: `${currentPct.toFixed(1)}%`, color: "text-green-400" },
    { label: "Ownership if they skip", value: `${dilutedPct.toFixed(1)}%`, color: "text-orange-400" },
    { label: "Dilution from skipping", value: `−${dilutionLost.toFixed(1)}%`, color: "text-red-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Pro-Rata Rights Calculator</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">An investor with pro-rata rights can buy enough of the next round to keep their ownership %. See the cheque size required — and the dilution if they pass.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Current ownership %
            <input type="number" value={currentPct} onChange={e => setCurrentPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">New round size (₹)
            <input type="number" value={roundSize} onChange={e => setRoundSize(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Pre-money of new round (₹)
            <input type="number" value={preMoney} onChange={e => setPreMoney(+e.target.value)} className={tsInp} />
          </label>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">Post-money: <span className="tabular-nums text-[var(--color-text)]">{formatAmount(postMoney)}</span></p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Pro-rata simply means buying your ownership share of the new round. Exercising keeps your % flat; skipping dilutes you by the round's own dilution. Founders: heavy pro-rata commitments from earlier investors can leave little room for a new lead — manage the allocation.
      </div>
    </div>
  );
}

// ── #126 SAFE vs Priced-Round Comparator — dilution & ownership of a SAFE (post-money cap) vs a priced round ──
function SafeVsPriced() {
  const [raise, setRaise]       = useState(5_000_000);
  const [cap, setCap]           = useState(50_000_000);   // SAFE post-money cap
  const [discount, setDiscount] = useState(20);           // SAFE discount %
  const [preMoney, setPreMoney] = useState(45_000_000);   // priced-round pre-money
  const [nextPre, setNextPre]   = useState(80_000_000);   // priced round at which SAFE converts

  // SAFE (post-money cap): ownership = raise / cap, but if discounted price on next round is lower, use that.
  const safeByCap = cap > 0 ? raise / cap : 0;
  const discountPrice = nextPre * (1 - Math.min(99, Math.max(0, discount)) / 100);
  const safeByDiscount = discountPrice > 0 ? raise / (discountPrice + raise) : 0;
  const safePct = Math.max(safeByCap, safeByDiscount) * 100;
  const safeBasis = safeByCap >= safeByDiscount ? "valuation cap" : "discount";

  // Priced round: ownership = raise / (pre + raise)
  const pricedPct = (preMoney + raise) > 0 ? raise / (preMoney + raise) * 100 : 0;

  const fc = formatCurrency;
  const cards = [
    { label: "SAFE investor ownership", value: `${safePct.toFixed(1)}%`, sub: `converts on ${safeBasis}`, color: "text-blue-400" },
    { label: "Priced-round ownership", value: `${pricedPct.toFixed(1)}%`, sub: `at ${formatAmount(preMoney)} pre`, color: "text-[var(--color-primary)]" },
    { label: "Founder dilution — SAFE", value: `−${safePct.toFixed(1)}%`, sub: "deferred to conversion", color: "text-orange-400" },
    { label: "Founder dilution — Priced", value: `−${pricedPct.toFixed(1)}%`, sub: "immediate", color: "text-orange-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> SAFE vs Priced-Round Comparator</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Raising the same money on a post-money SAFE versus a priced round gives different dilution. SAFE converts on the better of its cap or discount at the next round.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Amount to raise (₹)
            <input type="number" value={raise} onChange={e => setRaise(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">SAFE post-money cap (₹)
            <input type="number" value={cap} onChange={e => setCap(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">SAFE discount %
            <input type="number" value={discount} onChange={e => setDiscount(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Priced-round pre-money (₹)
            <input type="number" value={preMoney} onChange={e => setPreMoney(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Next round pre (SAFE converts) (₹)
            <input type="number" value={nextPre} onChange={e => setNextPre(+e.target.value)} className={tsInp} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold mb-2">Verdict</p>
        <p className="text-xs leading-relaxed text-[var(--color-muted)]">
          {safePct < pricedPct
            ? <>The <span className="text-blue-400 font-medium">SAFE</span> dilutes you less here ({safePct.toFixed(1)}% vs {pricedPct.toFixed(1)}%) and is faster/cheaper to close — but note India's FEMA rules make priced rounds / CCPS the compliant default for many situations.</>
            : <>The <span className="text-[var(--color-primary)] font-medium">priced round</span> dilutes you less here ({pricedPct.toFixed(1)}% vs {safePct.toFixed(1)}%) and gives a firm valuation today, at the cost of slower, more expensive legals.</>}
          {" "}Raise: {fc(raise)}.
        </p>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Post-money SAFE ownership is fixed at raise ÷ cap (the founder bears all subsequent dilution), unless the discounted next-round price beats the cap. Estimate only — actual conversion depends on the priced round's final terms and pool.
      </div>
    </div>
  );
}

// ── #127 Vesting / Cliff Schedule — month-by-month equity accrual with cliff ──
function VestingSchedule() {
  const [totalShares, setTotalShares] = useState(400_000);
  const [years, setYears]             = useState(4);
  const [cliffMonths, setCliffMonths] = useState(12);
  const [elapsed, setElapsed]         = useState(18);

  const totalMonths = Math.max(1, Math.round(years * 12));
  const cliff = Math.min(cliffMonths, totalMonths);
  const monthsServed = Math.min(Math.max(0, elapsed), totalMonths);

  const vestedAt = (m: number) => {
    if (m < cliff) return 0;
    return Math.round(totalShares * (Math.min(m, totalMonths) / totalMonths));
  };
  const vestedNow = vestedAt(monthsServed);
  const vestedPct = totalShares > 0 ? (vestedNow / totalShares) * 100 : 0;
  const perMonth = totalShares / totalMonths;

  // Build a sparse milestone table: cliff, then yearly + current
  const milestones = Array.from(new Set([cliff, ...Array.from({ length: years }, (_, i) => (i + 1) * 12), monthsServed, totalMonths]))
    .filter(m => m >= 0 && m <= totalMonths)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Vesting / Cliff Schedule</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Model founder or employee vesting: nothing vests before the cliff, then it accrues monthly to the full grant. Standard is 4 years with a 1-year cliff.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Total grant (shares)
            <input type="number" value={totalShares} onChange={e => setTotalShares(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Vesting period (years)
            <input type="number" value={years} onChange={e => setYears(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Cliff (months)
            <input type="number" value={cliffMonths} onChange={e => setCliffMonths(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Months served
            <input type="number" value={elapsed} onChange={e => setElapsed(+e.target.value)} className={tsInp} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Vested now", value: vestedNow.toLocaleString("en-IN"), color: "text-green-400" },
          { label: "Vested %", value: `${vestedPct.toFixed(1)}%`, color: "text-[var(--color-primary)]" },
          { label: "Unvested", value: (totalShares - vestedNow).toLocaleString("en-IN"), color: "text-orange-400" },
          { label: "Monthly accrual", value: `${Math.round(perMonth).toLocaleString("en-IN")}/mo`, color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-medium">Vesting progress</span>
          <span className="tabular-nums text-[var(--color-muted)]">{monthsServed} / {totalMonths} months</span>
        </div>
        <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500" style={{ width: `${vestedPct}%` }} />
        </div>
        {monthsServed < cliff && <p className="text-[11px] text-orange-400 mt-2">Still in the cliff — 0 vested until month {cliff}.</p>}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[360px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Milestone", "Vested shares", "Vested %"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {milestones.map(m => {
              const v = vestedAt(m);
              const isNow = m === monthsServed;
              const label = m === cliff ? `Month ${m} (cliff)` : m === totalMonths ? `Month ${m} (fully vested)` : `Month ${m}`;
              return (
                <tr key={m} className={`border-b border-[var(--color-border)] last:border-0 ${isNow ? "bg-[var(--color-accent)]/30" : ""}`}>
                  <td className="px-4 py-2 font-medium">{label}{isNow ? " · now" : ""}</td>
                  <td className="px-4 py-2 tabular-nums">{v.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2 tabular-nums">{totalShares > 0 ? ((v / totalShares) * 100).toFixed(1) : "0.0"}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── #128 Term-Sheet Readiness Checklist — durable, persisted across devices ──
interface CheckItem { id: string; label: string; done: boolean; }

const DEFAULT_CHECKLIST: CheckItem[] = [
  { id: "valuation", label: "Agreed pre-money valuation and round size", done: false },
  { id: "liqpref", label: "Liquidation preference capped at 1× non-participating", done: false },
  { id: "antidilution", label: "Anti-dilution is broad-based weighted-average (not full-ratchet)", done: false },
  { id: "board", label: "Board composition keeps founder/independent majority", done: false },
  { id: "pool", label: "Option pool sized to hiring plan and pool-shuffle understood", done: false },
  { id: "vetoes", label: "Protective provisions narrowed to genuinely major events", done: false },
  { id: "vesting", label: "Founder reverse-vesting terms reviewed (credit time served)", done: false },
  { id: "drag", label: "Drag-along threshold and price floor acceptable", done: false },
  { id: "fema", label: "FEMA / instrument type (CCPS vs SAFE) confirmed for India", done: false },
  { id: "angeltax", label: "Section 56(2)(viib) angel-tax exposure checked", done: false },
  { id: "lawyer", label: "Definitive agreements reviewed by a lawyer", done: false },
];

function TermSheetChecklist() {
  const [items, setItems] = useFeatureState<CheckItem[]>("ts-readiness-checklist", DEFAULT_CHECKLIST);

  const toggle = (id: string) => setItems(prev => prev.map(i => (i.id === id ? { ...i, done: !i.done } : i)));
  const reset  = () => setItems(DEFAULT_CHECKLIST.map(i => ({ ...i, done: false })));

  const doneCount = items.filter(i => i.done).length;
  const pct = items.length > 0 ? (doneCount / items.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Term-Sheet Readiness Checklist</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Tick off each negotiation point before you sign. Your progress is saved and synced across devices.</p>
          </div>
          <button onClick={reset} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 shrink-0">Reset</button>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{doneCount} of {items.length} reviewed</span>
          <span className="tabular-nums text-[var(--color-muted)]">{pct.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-green-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {items.map(i => (
          <label key={i.id} className="flex items-start gap-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 cursor-pointer hover:border-[var(--color-primary)] transition-colors">
            <input type="checkbox" checked={i.done} onChange={() => toggle(i.id)} className="accent-[var(--color-primary)] mt-0.5" />
            <span className={`text-sm leading-snug ${i.done ? "line-through text-[var(--color-muted)]" : ""}`}>{i.label}</span>
          </label>
        ))}
      </div>

      {pct === 100 && (
        <div className="bg-green-500/10 border border-green-500/40 rounded-lg px-4 py-2.5 text-[11px] text-green-400 flex items-start gap-2">
          <Sparkles size={12} className="shrink-0 mt-px" /> All points reviewed — you are ready to sign with eyes open. Keep your lawyer in the loop on the definitive docs.
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        A general founder checklist, not legal advice. Add your own deal-specific items in discussion with your advisor and lawyer.
      </div>
    </div>
  );
}

// ── #129 Multi-Class Liquidation Waterfall — seniority-ordered payout across preferred classes ──
interface PrefClass {
  id: string;
  name: string;
  invested: number;
  prefX: number;
  participating: boolean;
  seniority: number; // lower = paid first
}

function blankClass(n: number): PrefClass {
  const names = ["Series A", "Series B", "Series C", "Series D"];
  return {
    id: Math.random().toString(36).slice(2),
    name: names[Math.min(n - 1, names.length - 1)] ?? `Class ${n}`,
    invested: 10_000_000 * n,
    prefX: 1,
    participating: false,
    seniority: n,
  };
}

function MultiClassWaterfall() {
  const [exitValue, setExitValue] = useState(120_000_000);
  const [commonShares, setCommonShares] = useState(70); // common ownership % (founders + ESOP)
  const [classes, setClasses] = useState<PrefClass[]>([blankClass(1), blankClass(2)]);

  const patch = (id: string, key: keyof PrefClass, value: PrefClass[keyof PrefClass]) =>
    setClasses(prev => prev.map(c => (c.id === id ? { ...c, [key]: value } : c)));

  const exit = Math.max(0, exitValue);
  // Each preferred class owns (invested / exit-implied) is not derivable; instead model ownership
  // as residual: preferred classes together own (100 - common)% pro-rata to invested capital.
  const totalPref = classes.reduce((s, c) => s + c.invested, 0);
  const prefOwnPct = Math.max(0, 100 - Math.min(100, Math.max(0, commonShares)));

  // Step 1: pay preferences in seniority order (lower seniority first). Non-participating preferred
  // will later take the GREATER of pref vs as-converted; we compute both and choose per class.
  const ordered = [...classes].sort((a, b) => a.seniority - b.seniority);
  let remaining = exit;
  const prefPaid: Record<string, number> = {};
  for (const c of ordered) {
    const pref = c.invested * c.prefX;
    const pay = Math.min(pref, remaining);
    prefPaid[c.id] = pay;
    remaining -= pay;
  }
  // Step 2: distribute the remainder. Participating preferred + common share pro-rata by ownership.
  // Each class's as-converted ownership = prefOwnPct × (invested / totalPref).
  const classOwn = (c: PrefClass) => (totalPref > 0 ? prefOwnPct * (c.invested / totalPref) : 0) / 100;
  const commonOwn = Math.min(100, Math.max(0, commonShares)) / 100;
  const participatingOwn = classes.filter(c => c.participating).reduce((s, c) => s + classOwn(c), 0);
  const residualBase = participatingOwn + commonOwn;
  const afterPref = remaining;

  // Final payout per class: non-participating chooses max(pref, as-converted of whole exit)
  const payouts = classes.map(c => {
    const own = classOwn(c);
    if (c.participating) {
      const share = residualBase > 0 ? afterPref * (own / residualBase) : 0;
      return { ...c, payout: prefPaid[c.id] + share, basis: "pref + participation" };
    }
    const asConverted = exit * own;
    if (asConverted >= prefPaid[c.id]) {
      return { ...c, payout: asConverted, basis: "as-converted (converts)" };
    }
    return { ...c, payout: prefPaid[c.id], basis: "preference" };
  });

  const prefTotalPaid = payouts.reduce((s, p) => s + p.payout, 0);
  const commonPayout = Math.max(0, exit - prefTotalPaid);
  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Network size={14} className="text-[var(--color-primary)]" /> Multi-Class Liquidation Waterfall</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Stack several preferred classes with their own seniority and preference, then see who gets paid in what order at exit.</p>
          </div>
          {classes.length < 4 && (
            <button onClick={() => setClasses(prev => [...prev, blankClass(prev.length + 1)])}
              className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">+ Add class</button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Exit / sale value (₹)
            <input type="number" value={exitValue} onChange={e => setExitValue(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Common ownership % (founders + ESOP)
            <input type="number" value={commonShares} onChange={e => setCommonShares(+e.target.value)} className={tsInp} />
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {classes.map(c => (
            <div key={c.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <input value={c.name} onChange={e => patch(c.id, "name", e.target.value)} className="bg-transparent text-sm font-semibold outline-none w-full" />
                {classes.length > 1 && (
                  <button onClick={() => setClasses(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs shrink-0">✕</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-[var(--color-muted)] block">Invested (₹)
                  <input type="number" value={c.invested} onChange={e => patch(c.id, "invested", +e.target.value)} className={tsInp} />
                </label>
                <label className="text-[10px] text-[var(--color-muted)] block">Pref (×)
                  <input type="number" step="0.5" min={0} value={c.prefX} onChange={e => patch(c.id, "prefX", +e.target.value)} className={tsInp} />
                </label>
                <label className="text-[10px] text-[var(--color-muted)] block">Seniority (1 = first)
                  <input type="number" min={1} value={c.seniority} onChange={e => patch(c.id, "seniority", +e.target.value)} className={tsInp} />
                </label>
                <label className="flex items-end gap-1.5 text-[11px] cursor-pointer pb-2">
                  <input type="checkbox" checked={c.participating} onChange={e => patch(c.id, "participating", e.target.checked)} className="accent-[var(--color-primary)]" /> Participating
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Class", "Seniority", "Preference", "Payout", "Basis", "% of exit"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...payouts].sort((a, b) => a.seniority - b.seniority).map(p => (
              <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{p.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.seniority}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.prefX}× ({fc(p.invested * p.prefX)})</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{fc(Math.round(p.payout))}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{p.basis}</td>
                <td className="px-4 py-2.5 tabular-nums">{exit > 0 ? ((p.payout / exit) * 100).toFixed(1) : "0.0"}%</td>
              </tr>
            ))}
            <tr className="bg-[var(--color-accent)]/30">
              <td className="px-4 py-2.5 font-semibold">Common (founders + ESOP)</td>
              <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">last</td>
              <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">—</td>
              <td className={`px-4 py-2.5 tabular-nums font-semibold ${commonPayout > 0 ? "text-green-400" : "text-red-400"}`}>{fc(Math.round(commonPayout))}</td>
              <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">residual</td>
              <td className="px-4 py-2.5 tabular-nums">{exit > 0 ? ((commonPayout / exit) * 100).toFixed(1) : "0.0"}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Preferences pay in seniority order (lowest number first); later money is usually senior in real stacks. Non-participating classes take the greater of their preference or as-converted equity; participating classes also share the leftover. Ownership is approximated pro-rata to invested capital — a simplification of an actual share ledger.
      </div>
    </div>
  );
}

// ── #130 Board-Composition Modeler — seats by group and who holds control ──
function BoardCompositionModeler() {
  const [founderSeats, setFounderSeats]   = useState(2);
  const [investorSeats, setInvestorSeats] = useState(1);
  const [independentSeats, setIndependentSeats] = useState(0);
  const [indLeansFounder, setIndLeansFounder] = useState(true);

  const total = Math.max(0, founderSeats) + Math.max(0, investorSeats) + Math.max(0, independentSeats);
  const majority = Math.floor(total / 2) + 1;
  const founderBloc = Math.max(0, founderSeats) + (indLeansFounder ? Math.max(0, independentSeats) : 0);
  const investorBloc = Math.max(0, investorSeats) + (indLeansFounder ? 0 : Math.max(0, independentSeats));

  const founderControls = total > 0 && founderBloc >= majority;
  const investorControls = total > 0 && investorBloc >= majority;
  const deadlock = total > 0 && !founderControls && !investorControls;

  const groups = [
    { label: "Founder seats", value: founderSeats, set: setFounderSeats, color: "#22c55e" },
    { label: "Investor seats", value: investorSeats, set: setInvestorSeats, color: "#6366f1" },
    { label: "Independent seats", value: independentSeats, set: setIndependentSeats, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Board-Composition Modeler</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Board control decides hiring, budgets and even founder removal. Model the seat split and see who holds a voting majority.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {groups.map(g => (
            <label key={g.label} className="text-xs text-[var(--color-muted)] block">{g.label}
              <input type="number" min={0} value={g.value} onChange={e => g.set(Math.max(0, +e.target.value))} className={tsInp} />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={indLeansFounder} onChange={e => setIndLeansFounder(e.target.checked)} className="accent-[var(--color-primary)]" />
          Assume independents side with founders (untick to side with investors)
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total seats", value: `${total}`, color: "text-[var(--color-text)]" },
          { label: "Seats for majority", value: `${total > 0 ? majority : 0}`, color: "text-[var(--color-primary)]" },
          { label: "Founder bloc", value: `${founderBloc}`, color: founderControls ? "text-green-400" : "text-[var(--color-muted)]" },
          { label: "Investor bloc", value: `${investorBloc}`, color: investorControls ? "text-orange-400" : "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
        <p className="text-xs font-semibold mb-1">Seat composition</p>
        <div className="flex h-6 rounded-lg overflow-hidden border border-[var(--color-border)]">
          {groups.filter(g => g.value > 0).map(g => (
            <div key={g.label} className="h-full flex items-center justify-center text-[10px] font-semibold text-white"
              style={{ width: `${total > 0 ? (g.value / total) * 100 : 0}%`, background: g.color }}>
              {g.value}
            </div>
          ))}
        </div>
      </div>

      <div className={`rounded-lg px-4 py-3 text-xs flex items-start gap-2 border ${
        founderControls ? "bg-green-500/10 border-green-500/40 text-green-400"
        : investorControls ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
        : "bg-[var(--color-accent)]/40 border-[var(--color-border)] text-[var(--color-muted)]"}`}>
        <Info size={13} className="shrink-0 mt-px" />
        {total === 0 ? "Add at least one seat to model control."
          : founderControls ? `Founders hold ${founderBloc}/${total} — a controlling majority. Investors get a voice, not control. This is the founder-friendly seed-stage default.`
          : investorControls ? `Investors hold ${investorBloc}/${total} — they can outvote founders. Push for an independent seat or one investor seat only to keep founder/independent majority.`
          : "No single bloc holds a majority — decisions need cross-group agreement. A neutral independent can be the swing vote; define how the chair/casting vote works."}
        {deadlock && total % 2 === 0 && " An even board can deadlock — consider an odd number of seats."}
      </div>
    </div>
  );
}

// ── #131 Milestone / Tranche Funding Planner — split a raise into milestone-gated tranches ──
interface Tranche { id: string; label: string; amount: number; milestone: string; }

function blankTranche(n: number): Tranche {
  return {
    id: Math.random().toString(36).slice(2),
    label: `Tranche ${n}`,
    amount: 5_000_000,
    milestone: n === 1 ? "On signing / first close" : "On hitting agreed milestone",
  };
}

function TranchePlanner() {
  const [preMoney, setPreMoney]   = useState(50_000_000);
  const [tranches, setTranches]   = useState<Tranche[]>([blankTranche(1), blankTranche(2)]);

  const patch = (id: string, key: keyof Tranche, value: Tranche[keyof Tranche]) =>
    setTranches(prev => prev.map(t => (t.id === id ? { ...t, [key]: value } : t)));

  const total = tranches.reduce((s, t) => s + Math.max(0, t.amount), 0);
  const postMoney = preMoney + total;
  const fullDilution = postMoney > 0 ? (total / postMoney) * 100 : 0;
  const fc = formatCurrency;

  // Cumulative dilution as each tranche lands (priced at the same pre-money for simplicity)
  let cumInvested = 0;
  const rows = tranches.map(t => {
    cumInvested += Math.max(0, t.amount);
    const cumPost = preMoney + cumInvested;
    const cumPct = cumPost > 0 ? (cumInvested / cumPost) * 100 : 0;
    return { ...t, cumInvested, cumPct };
  });

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Milestone size={14} className="text-[var(--color-primary)]" /> Milestone / Tranche Planner</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Investors often release capital in milestone-gated tranches instead of one cheque. Plan the schedule and see dilution build as each tranche lands.</p>
          </div>
          {tranches.length < 5 && (
            <button onClick={() => setTranches(prev => [...prev, blankTranche(prev.length + 1)])}
              className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">+ Add tranche</button>
          )}
        </div>
        <label className="text-xs text-[var(--color-muted)] block md:w-1/3">Pre-money valuation (₹)
          <input type="number" value={preMoney} onChange={e => setPreMoney(+e.target.value)} className={tsInp} />
        </label>
        <div className="space-y-2.5">
          {tranches.map(t => (
            <div key={t.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <label className="text-[10px] text-[var(--color-muted)] block md:col-span-3">Label
                <input value={t.label} onChange={e => patch(t.id, "label", e.target.value)} className={tsInp} />
              </label>
              <label className="text-[10px] text-[var(--color-muted)] block md:col-span-3">Amount (₹)
                <input type="number" value={t.amount} onChange={e => patch(t.id, "amount", +e.target.value)} className={tsInp} />
              </label>
              <label className="text-[10px] text-[var(--color-muted)] block md:col-span-5">Milestone / trigger
                <input value={t.milestone} onChange={e => patch(t.id, "milestone", e.target.value)} className={tsInp} />
              </label>
              <div className="md:col-span-1 flex md:justify-end">
                {tranches.length > 1 && (
                  <button onClick={() => setTranches(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total raise (all tranches)", value: fc(total), color: "text-[var(--color-primary)]" },
          { label: "Post-money (fully drawn)", value: formatAmount(postMoney), color: "text-[var(--color-text)]" },
          { label: "Dilution if fully drawn", value: `−${fullDilution.toFixed(1)}%`, color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Tranche", "Amount", "Milestone", "Cumulative in", "Cumulative dilution"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.milestone}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.cumInvested)}</td>
                <td className="px-4 py-2.5 tabular-nums text-orange-400">−{r.cumPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Tranching protects investors and stretches your runway, but missed milestones can stall the next tranche when you most need it. Negotiate objective, achievable triggers and a fixed price for all tranches so later money is not re-priced down. All tranches here are modeled at one pre-money — a real deal may re-price.
      </div>
    </div>
  );
}

// ── #132 Convertible-Note Maturity Scenarios — what happens at maturity if no priced round ──
function NoteMaturityScenarios() {
  const [principal, setPrincipal]   = useState(10_000_000);
  const [interestPct, setInterestPct] = useState(8);
  const [termMonths, setTermMonths] = useState(24);
  const [cap, setCap]               = useState(60_000_000);
  const [discount, setDiscount]     = useState(20);
  const [maturityPre, setMaturityPre] = useState(50_000_000); // negotiated pre-money if converting at maturity

  const years = Math.max(0, termMonths) / 12;
  const accruedInterest = principal * (Math.max(0, interestPct) / 100) * years;
  const balance = principal + accruedInterest;

  // Scenario 1: repay in cash (principal + accrued interest)
  // Scenario 2: convert at the lower of cap or (maturity pre × (1 - discount))
  const discPrice = maturityPre * (1 - Math.min(99, Math.max(0, discount)) / 100);
  const convVal = Math.min(cap > 0 ? cap : discPrice, discPrice > 0 ? discPrice : (cap || 0));
  const convPostMoney = convVal + balance;
  const convPct = convPostMoney > 0 ? (balance / convPostMoney) * 100 : 0;
  const convBasis = (cap > 0 && cap <= discPrice) ? "valuation cap" : "discounted price";
  // Scenario 3: extend (no change today, interest keeps accruing) — illustrate +12 months
  const extYears = (termMonths + 12) / 12;
  const extBalance = principal + principal * (Math.max(0, interestPct) / 100) * extYears;
  const fc = formatCurrency;

  const scenarios = [
    { name: "Repay in cash", detail: `Principal ${fc(principal)} + interest ${fc(Math.round(accruedInterest))}`, headline: fc(Math.round(balance)), note: "Needs cash you may not have — most startups can't repay.", color: "text-orange-400" },
    { name: "Convert to equity", detail: `Converts on ${convBasis} at ${formatAmount(convVal)} → ≈${convPct.toFixed(1)}% stake`, headline: `${convPct.toFixed(1)}%`, note: "Most common outcome — note becomes equity at maturity.", color: "text-[var(--color-primary)]" },
    { name: "Extend maturity", detail: `+12 months; balance grows to ${fc(Math.round(extBalance))}`, headline: fc(Math.round(extBalance)), note: "Buys time but more interest accrues; needs investor consent.", color: "text-blue-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Clock size={14} className="text-[var(--color-primary)]" /> Convertible-Note Maturity Scenarios</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">If no priced round happens before the note matures, three things can occur: repay, convert, or extend. Model the balance and the conversion outcome.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Principal (₹)
            <input type="number" value={principal} onChange={e => setPrincipal(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Interest % p.a.
            <input type="number" value={interestPct} onChange={e => setInterestPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Term (months)
            <input type="number" value={termMonths} onChange={e => setTermMonths(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Valuation cap (₹)
            <input type="number" value={cap} onChange={e => setCap(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Discount %
            <input type="number" value={discount} onChange={e => setDiscount(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Maturity pre-money (₹)
            <input type="number" value={maturityPre} onChange={e => setMaturityPre(+e.target.value)} className={tsInp} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Accrued interest", value: fc(Math.round(accruedInterest)), color: "text-orange-400" },
          { label: "Balance at maturity", value: fc(Math.round(balance)), color: "text-[var(--color-primary)]" },
          { label: "Equity if converted", value: `${convPct.toFixed(1)}%`, color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {scenarios.map(s => (
          <div key={s.name} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-start justify-between gap-4">
            <div>
              <p className={`text-sm font-semibold ${s.color}`}>{s.name}</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{s.detail}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1">{s.note}</p>
            </div>
            <p className={`text-lg font-bold tabular-nums shrink-0 ${s.color}`}>{s.headline}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        At maturity a note typically converts on the better of its cap or discount, or — failing a priced round — may be repaid or extended by negotiation. Interest is shown as simple (not compounded). In India, instrument choice (CCPS vs note) and FEMA rules affect what is actually permitted.
      </div>
    </div>
  );
}

// ── #133 Founder Dilution Over Rounds — cumulative ownership across a sequence of raises ──
interface RaiseRound { id: string; name: string; investorPct: number; poolPct: number; }

function blankRound(n: number): RaiseRound {
  const names = ["Seed", "Series A", "Series B", "Series C", "Series D"];
  return {
    id: Math.random().toString(36).slice(2),
    name: names[Math.min(n - 1, names.length - 1)] ?? `Round ${n}`,
    investorPct: n === 1 ? 15 : 18,
    poolPct: n === 1 ? 10 : 3,
  };
}

function DilutionOverRounds() {
  const [startFounderPct, setStartFounderPct] = useState(100);
  const [exitValue, setExitValue]   = useState(2_000_000_000);
  const [rounds, setRounds]         = useState<RaiseRound[]>([blankRound(1), blankRound(2), blankRound(3)]);

  const patch = (id: string, key: keyof RaiseRound, value: RaiseRound[keyof RaiseRound]) =>
    setRounds(prev => prev.map(r => (r.id === id ? { ...r, [key]: value } : r)));

  // Each round: new investor takes investorPct of post; a new pool takes poolPct.
  // Existing holders (incl. founders) are scaled by (1 - investorPct/100 - poolPct/100).
  let founderPct = Math.min(100, Math.max(0, startFounderPct));
  const steps = rounds.map(r => {
    const dilFactor = Math.max(0, 1 - Math.max(0, r.investorPct) / 100 - Math.max(0, r.poolPct) / 100);
    const before = founderPct;
    founderPct = founderPct * dilFactor;
    return { ...r, before, after: founderPct, dilFactor };
  });
  const finalFounderPct = founderPct;
  const founderExitValue = exitValue * (finalFounderPct / 100);
  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><LineChart size={14} className="text-[var(--color-primary)]" /> Founder Dilution Over Rounds</h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Stack several future rounds and watch founder ownership compound down. Each round's investor stake and new pool dilute everyone before it.</p>
          </div>
          {rounds.length < 5 && (
            <button onClick={() => setRounds(prev => [...prev, blankRound(prev.length + 1)])}
              className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">+ Add round</button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--color-muted)] block">Starting founder ownership %
            <input type="number" value={startFounderPct} onChange={e => setStartFounderPct(+e.target.value)} className={tsInp} />
          </label>
          <label className="text-xs text-[var(--color-muted)] block">Eventual exit value (₹)
            <input type="number" value={exitValue} onChange={e => setExitValue(+e.target.value)} className={tsInp} />
          </label>
        </div>
        <div className="space-y-2.5">
          {rounds.map(r => (
            <div key={r.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <label className="text-[10px] text-[var(--color-muted)] block md:col-span-4">Round
                <input value={r.name} onChange={e => patch(r.id, "name", e.target.value)} className={tsInp} />
              </label>
              <label className="text-[10px] text-[var(--color-muted)] block md:col-span-3">New investor %
                <input type="number" value={r.investorPct} onChange={e => patch(r.id, "investorPct", +e.target.value)} className={tsInp} />
              </label>
              <label className="text-[10px] text-[var(--color-muted)] block md:col-span-4">New pool %
                <input type="number" value={r.poolPct} onChange={e => patch(r.id, "poolPct", +e.target.value)} className={tsInp} />
              </label>
              <div className="md:col-span-1 flex md:justify-end">
                {rounds.length > 1 && (
                  <button onClick={() => setRounds(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Founder % after all rounds", value: `${finalFounderPct.toFixed(1)}%`, color: finalFounderPct >= 50 ? "text-green-400" : finalFounderPct >= 25 ? "text-orange-400" : "text-red-400" },
          { label: "Total founder dilution", value: `−${(startFounderPct - finalFounderPct).toFixed(1)}%`, color: "text-orange-400" },
          { label: "Founder value at exit", value: fc(Math.round(founderExitValue)), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Round", "Founder before", "Investor + pool", "Founder after", "Bar"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {steps.map(s => (
              <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{s.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{s.before.toFixed(1)}%</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.investorPct}% + {s.poolPct}%</td>
                <td className="px-4 py-2.5 tabular-nums text-orange-400">{s.after.toFixed(1)}%</td>
                <td className="px-4 py-2.5 w-1/4">
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, s.after)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <Info size={12} className="shrink-0 mt-px" />
        Dilution compounds: a 20% round on top of a 20% round leaves you with 64%, not 60%. New option pools dilute founders too. This is a planning estimate (each round's investor + pool are taken from post-money); model your real cap table for exact numbers.
      </div>
    </div>
  );
}
