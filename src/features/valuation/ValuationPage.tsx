import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { computeFinancialSnapshot, dcfValuation, dilution } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { Gem, Rocket, ArrowRight, Users, Building2, Sprout, SlidersHorizontal, FileSpreadsheet, Calculator, Dice5, Hourglass, Layers, PieChart, Repeat, Gift, CalendarClock, Activity, Scale, Receipt, TrendingDown, TrendingUp, GitBranch, Infinity as InfinityIcon, Timer } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const INDUSTRY_MULTIPLES: Record<string, number> = {
  "SaaS / Fintech": 8, "SaaS": 8, "Fintech": 6, "E-commerce": 2.5, "Manufacturing": 1.5,
  "Services": 2, "Retail": 1.2, "Healthcare": 4, "Logistics": 2,
};

export default function ValuationPage() {
  const { store } = useApp();
  const navigate = useNavigate();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);

  const annualRevenue = snap.monthlyRevenue * 12;
  const baseFcf = Math.max(snap.monthlyNet, 0) * 12;
  const defaultMultiple = INDUSTRY_MULTIPLES[store.firm.industry] ?? 3;

  const [multiple, setMultiple] = useState(defaultMultiple);
  const [growth, setGrowth] = useState(() => Math.round(Math.min(60, Math.max(5, (snap.revenueGrowthPct ?? 2) * 12))));
  const [discount, setDiscount] = useState(22);
  const [raiseAmount, setRaiseAmount] = useState(() => {
    const active = store.capitalRaises.find(r => r.status === "active" || r.status === "draft");
    return active?.targetAmount ?? 5_000_000;
  });

  const dcf = useMemo(
    () => dcfValuation({ baseAnnualFcf: baseFcf > 0 ? baseFcf : annualRevenue * 0.1, growthPct: growth, discountPct: discount }),
    [baseFcf, annualRevenue, growth, discount],
  );

  const multipleVal = annualRevenue * multiple;
  const midVal = (multipleVal + dcf.enterpriseValue) / 2;
  const range = {
    low: Math.min(multipleVal, dcf.enterpriseValue) * 0.85,
    mid: midVal,
    high: Math.max(multipleVal, dcf.enterpriseValue) * 1.15,
  };

  const dil = dilution(range.mid, raiseAmount);

  const raisedSoFar = store.capitalInvestments.filter(i => i.status === "confirmed").reduce((s, i) => s + i.amount, 0);

  const valuationBars = [
    { name: `Revenue × ${multiple}x`, value: Math.round(multipleVal), fill: "#3b82f6" },
    { name: "DCF (5-yr)", value: Math.round(dcf.enterpriseValue), fill: "#22c55e" },
    { name: "Blended mid-point", value: Math.round(range.mid), fill: "#8b5cf6" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Gem size={18} className="text-[var(--color-primary)]" /> Valuation</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Revenue-multiple and discounted-cash-flow valuation from your live financials, plus dilution maths for the active raise.
        </p>
      </div>

      {/* Section quick-nav */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([
          ["comparable-multiples", "Comparable Multiples", Building2],
          ["berkus-scorecard", "Berkus / Scorecard", Sprout],
          ["dcf-tornado", "DCF Sensitivity", SlidersHorizontal],
          ["esop-409a", "409A FMV (ESOP)", FileSpreadsheet],
          ["vc-method", "VC Method", Calculator],
          ["first-chicago", "First-Chicago", Dice5],
          ["runway-planner", "Runway → Raise", Hourglass],
          ["dilution-waterfall", "Dilution Waterfall", Layers],
          ["pool-shuffle", "Option-Pool Shuffle", PieChart],
          ["note-converter", "Note Cap/Discount", Repeat],
          ["esop-grant", "ESOP Grant Value", Gift],
          ["vesting-schedule", "Founder Vesting", CalendarClock],
          ["rule-of-40", "Rule of 40", Activity],
          ["liq-pref-stack", "Liq-Pref Stack", Scale],
          ["secondary-tax", "Secondary Tax", Receipt],
          ["down-round", "Down-Round Impact", TrendingDown],
          ["investor-moic", "Investor MOIC / IRR", TrendingUp],
          ["ev-ebitda-bridge", "EV → Equity Bridge", GitBranch],
          ["arr-multiple", "ARR-Multiple Value", InfinityIcon],
          ["discounted-payback", "Discounted Payback", Timer],
        ] as const).map(([id, label, Icon]) => (
          <a key={id} href={`#${id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)] transition-colors">
            <Icon size={11} />{label}
          </a>
        ))}
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual Revenue (run-rate)", value: formatAmount(annualRevenue), sub: "3-month average × 12", color: "text-[var(--color-text)]" },
          { label: "Indicative Valuation", value: formatAmount(range.mid), sub: `Range ${formatAmount(range.low)} – ${formatAmount(range.high)}`, color: "text-[var(--color-primary)]" },
          { label: "Implied Multiple", value: annualRevenue > 0 ? `${(range.mid / annualRevenue).toFixed(1)}x` : "—", sub: `Industry median ${defaultMultiple}x (${store.firm.industry || "general"})`, color: "text-blue-400" },
          { label: "Raised So Far", value: formatAmount(raisedSoFar), sub: `${store.capitalInvestments.length} investment(s) confirmed`, color: "text-green-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Assumptions */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-5">
          <p className="text-sm font-semibold">Assumptions</p>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--color-muted)]">Revenue multiple</span>
              <strong>{multiple.toFixed(1)}x</strong>
            </div>
            <input type="range" min={0.5} max={15} step={0.5} value={multiple} onChange={e => setMultiple(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--color-muted)]">Annual growth (DCF)</span>
              <strong>{growth}%</strong>
            </div>
            <input type="range" min={0} max={100} step={1} value={growth} onChange={e => setGrowth(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--color-muted)]">Discount rate (risk)</span>
              <strong>{discount}%</strong>
            </div>
            <input type="range" min={10} max={40} step={1} value={discount} onChange={e => setDiscount(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
            <p className="text-[10px] text-[var(--color-muted)] mt-1">Indian SMB equity typically 18–30%. Higher risk → lower valuation.</p>
          </div>
          {baseFcf <= 0 && (
            <p className="text-[10px] text-yellow-400 bg-yellow-950/30 border border-yellow-800/30 rounded-lg p-2">
              Not yet free-cash-flow positive — DCF uses 10% of revenue as a normalised FCF proxy.
            </p>
          )}
        </div>

        {/* Method comparison */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 lg:col-span-2">
          <p className="text-sm font-semibold mb-4">Valuation by Method</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={valuationBars} layout="vertical" barCategoryGap="28%">
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={(v: number) => [formatAmount(v), "Enterprise value"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {valuationBars.map((b, i) => <Cell key={i} fill={b.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Football-field range */}
          <div className="mt-3">
            <div className="relative h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className="absolute h-full bg-[var(--color-primary)]/30 rounded-full" style={{ left: "10%", width: "80%" }} />
              <div className="absolute h-full w-1 bg-[var(--color-primary)] rounded-full" style={{ left: "50%" }} />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
              <span>Low {formatAmount(range.low)}</span>
              <span className="text-[var(--color-primary)] font-semibold">Mid {formatAmount(range.mid)}</span>
              <span>High {formatAmount(range.high)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* DCF table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">5-Year DCF — projected free cash flow discounted at {discount}%</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Year", "Projected FCF", "Discount Factor", "Present Value"].map(h =>
                <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {dcf.years.map(y => (
                <tr key={y.year} className="hover:bg-white/2">
                  <td className="px-5 py-2.5">Year {y.year}</td>
                  <td className="px-5 py-2.5 tabular-nums">{formatAmount(y.fcf)}</td>
                  <td className="px-5 py-2.5 tabular-nums text-[var(--color-muted)]">{(y.pv / Math.max(1, y.fcf)).toFixed(3)}</td>
                  <td className="px-5 py-2.5 tabular-nums font-semibold">{formatAmount(y.pv)}</td>
                </tr>
              ))}
              <tr className="bg-[var(--color-bg)]/50">
                <td className="px-5 py-2.5 font-medium">Terminal value</td>
                <td className="px-5 py-2.5 tabular-nums">{formatAmount(dcf.terminalValue)}</td>
                <td className="px-5 py-2.5 text-[10px] text-[var(--color-muted)]">4% perpetual growth</td>
                <td className="px-5 py-2.5 tabular-nums font-semibold">{formatAmount(dcf.terminalPv)}</td>
              </tr>
              <tr className="border-t-2 border-[var(--color-border)]">
                <td className="px-5 py-3 font-bold" colSpan={3}>Enterprise value</td>
                <td className="px-5 py-3 tabular-nums font-bold text-[var(--color-primary)]">{formatAmount(dcf.enterpriseValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Dilution */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold flex items-center gap-2"><Users size={13} className="text-purple-400" /> Dilution at this Valuation</p>
          <button onClick={() => navigate("/capital")} className="text-[10px] text-[var(--color-primary)] hover:underline flex items-center gap-1">
            Manage raise <ArrowRight size={9} />
          </button>
        </div>
        <div className="flex flex-col md:flex-row gap-5 items-start">
          <div className="w-full md:w-64">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--color-muted)]">Amount to raise</span>
              <strong>{formatAmount(raiseAmount)}</strong>
            </div>
            <input type="range" min={500000} max={50000000} step={500000} value={raiseAmount} onChange={e => setRaiseAmount(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div className="grid grid-cols-3 gap-3 flex-1 w-full">
            {[
              { label: "Pre-money", value: formatAmount(range.mid), color: "text-[var(--color-text)]" },
              { label: "Post-money", value: formatAmount(dil.postMoney), color: "text-[var(--color-primary)]" },
              { label: "Investor stake", value: `${dil.investorPct.toFixed(1)}%`, color: dil.investorPct > 25 ? "text-red-400" : "text-green-400" },
            ].map(s => (
              <div key={s.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{s.label}</p>
                <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-3">
          You retain {dil.founderRetainedPct.toFixed(1)}% after the round.
          {dil.investorPct > 25 && " Giving up over 25% in one round is aggressive — consider a smaller raise or revenue-based financing via Credit."}
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => navigate("/capital")} className="text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/25 flex items-center gap-1.5">
            <Rocket size={11} /> Start / manage raise
          </button>
          <button onClick={() => navigate("/credit")} className="text-xs bg-[var(--color-accent)] text-[var(--color-muted)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)]">
            Compare with debt instead
          </button>
        </div>
      </div>

      {/* #109 Comparable-Company Multiples */}
      <section id="comparable-multiples" className="scroll-mt-4">
        <ComparableMultiples annualRevenue={annualRevenue} annualEbitda={baseFcf} industry={store.firm.industry} />
      </section>

      {/* #110 Berkus / Scorecard (pre-revenue) */}
      <section id="berkus-scorecard" className="scroll-mt-4">
        <BerkusScorecard />
      </section>

      {/* #111 Sensitivity / Tornado on DCF */}
      <section id="dcf-tornado" className="scroll-mt-4">
        <DcfTornado baseAnnualFcf={baseFcf > 0 ? baseFcf : annualRevenue * 0.1} growthPct={growth} discountPct={discount} />
      </section>

      {/* #112 409A-style FMV for ESOP */}
      <section id="esop-409a" className="scroll-mt-4">
        <Esop409aFmv enterpriseValue={range.mid} />
      </section>

      {/* VC method — exit value ÷ target return */}
      <section id="vc-method" className="scroll-mt-4">
        <VcMethod annualRevenue={annualRevenue} raiseAmount={raiseAmount} />
      </section>

      {/* First-Chicago probability-weighted valuation */}
      <section id="first-chicago" className="scroll-mt-4">
        <FirstChicago baseValuation={range.mid} />
      </section>

      {/* Runway → next-round planner */}
      <section id="runway-planner" className="scroll-mt-4">
        <RunwayPlanner cash={snap.cash} monthlyNet={snap.monthlyNet} />
      </section>

      {/* Dilution waterfall across rounds */}
      <section id="dilution-waterfall" className="scroll-mt-4">
        <DilutionWaterfall startValuation={range.mid} />
      </section>

      {/* Option-pool shuffle (pre vs post-money) */}
      <section id="pool-shuffle" className="scroll-mt-4">
        <PoolShuffle preMoney={range.mid} raiseAmount={raiseAmount} />
      </section>

      {/* Convertible-note cap / discount converter */}
      <section id="note-converter" className="scroll-mt-4">
        <NoteConverter nextRoundPreMoney={range.mid} />
      </section>

      {/* ESOP grant value calculator */}
      <section id="esop-grant" className="scroll-mt-4">
        <EsopGrantValue equityValue={range.mid} />
      </section>

      {/* Founder vesting schedule */}
      <section id="vesting-schedule" className="scroll-mt-4">
        <VestingSchedule />
      </section>

      {/* Rule-of-40 score */}
      <section id="rule-of-40" className="scroll-mt-4">
        <RuleOf40 annualRevenue={annualRevenue} growthPct={growth} monthlyNet={snap.monthlyNet} monthlyRevenue={snap.monthlyRevenue} />
      </section>

      {/* Liquidation-preference exit stack */}
      <section id="liq-pref-stack" className="scroll-mt-4">
        <LiqPrefStack exitValue={range.mid} />
      </section>

      {/* Secondary-sale capital-gains tax */}
      <section id="secondary-tax" className="scroll-mt-4">
        <SecondarySaleTax equityValue={range.mid} />
      </section>

      {/* Down-round / anti-dilution impact */}
      <section id="down-round" className="scroll-mt-4">
        <DownRoundImpact lastPreMoney={range.mid} />
      </section>

      {/* Investor MOIC / IRR backsolve */}
      <section id="investor-moic" className="scroll-mt-4">
        <InvestorMoic preMoney={range.mid} raiseAmount={raiseAmount} />
      </section>

      {/* EV → equity bridge */}
      <section id="ev-ebitda-bridge" className="scroll-mt-4">
        <EvEquityBridge enterpriseValue={dcf.enterpriseValue} cash={snap.cash} />
      </section>

      {/* ARR-multiple SaaS valuation */}
      <section id="arr-multiple" className="scroll-mt-4">
        <ArrMultiple annualRevenue={annualRevenue} growthPct={growth} />
      </section>

      {/* Discounted-payback period */}
      <section id="discounted-payback" className="scroll-mt-4">
        <DiscountedPayback baseAnnualFcf={baseFcf > 0 ? baseFcf : annualRevenue * 0.1} growthPct={growth} discountPct={discount} />
      </section>
    </div>
  );
}

// ── #109 COMPARABLE-COMPANY MULTIPLES ───────────────────────────────────────────
const SECTOR_MULTIPLES: Record<string, { revLow: number; revHigh: number; ebitdaLow: number; ebitdaHigh: number }> = {
  "SaaS / Fintech":  { revLow: 5,   revHigh: 12,  ebitdaLow: 18, ebitdaHigh: 35 },
  "SaaS":            { revLow: 5,   revHigh: 12,  ebitdaLow: 18, ebitdaHigh: 35 },
  "Fintech":         { revLow: 4,   revHigh: 9,   ebitdaLow: 15, ebitdaHigh: 28 },
  "E-commerce":      { revLow: 1.5, revHigh: 4,   ebitdaLow: 10, ebitdaHigh: 20 },
  "Manufacturing":   { revLow: 0.8, revHigh: 2,   ebitdaLow: 6,  ebitdaHigh: 12 },
  "Services":        { revLow: 1,   revHigh: 3,   ebitdaLow: 7,  ebitdaHigh: 14 },
  "Retail":          { revLow: 0.5, revHigh: 1.5, ebitdaLow: 6,  ebitdaHigh: 11 },
  "Healthcare":      { revLow: 2.5, revHigh: 6,   ebitdaLow: 12, ebitdaHigh: 22 },
  "Logistics":       { revLow: 1,   revHigh: 3,   ebitdaLow: 8,  ebitdaHigh: 15 },
};

function ComparableMultiples({ annualRevenue, annualEbitda, industry }: { annualRevenue: number; annualEbitda: number; industry: string }) {
  const sectors = Object.keys(SECTOR_MULTIPLES);
  const [sector, setSector] = useState(() => (industry && SECTOR_MULTIPLES[industry] ? industry : sectors[0]));
  const [revInput, setRevInput] = useState(() => (annualRevenue > 0 ? String(Math.round(annualRevenue)) : ""));
  const [ebitdaInput, setEbitdaInput] = useState(() => (annualEbitda > 0 ? String(Math.round(annualEbitda)) : ""));
  const [basis, setBasis] = useState<"revenue" | "ebitda">("revenue");

  const rev = parseFloat(revInput) || 0;
  const ebitda = parseFloat(ebitdaInput) || 0;
  const m = SECTOR_MULTIPLES[sector];

  const revMid = (m.revLow + m.revHigh) / 2;
  const ebitdaMid = (m.ebitdaLow + m.ebitdaHigh) / 2;

  const lowVal = basis === "revenue" ? rev * m.revLow : ebitda * m.ebitdaLow;
  const midVal = basis === "revenue" ? rev * revMid : ebitda * ebitdaMid;
  const highVal = basis === "revenue" ? rev * m.revHigh : ebitda * m.ebitdaHigh;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const bars = [
    { name: `${m.revLow}–${m.revHigh}x Revenue`, value: Math.round((m.revLow + m.revHigh) / 2 * rev), fill: "#3b82f6" },
    { name: `${m.ebitdaLow}–${m.ebitdaHigh}x EBITDA`, value: Math.round((m.ebitdaLow + m.ebitdaHigh) / 2 * ebitda), fill: "#22c55e" },
  ];

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Comparable-Company Multiples</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Value by sector revenue / EBITDA multiples observed for private SMB transactions. Auto-filled from your live run-rate.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Sector</label>
          <select value={sector} onChange={e => setSector(e.target.value)} className={inp}>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Annual Revenue (₹)</label>
          <input type="number" min={0} value={revInput} onChange={e => setRevInput(e.target.value)} placeholder="e.g. 50000000" className={inp} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Annual EBITDA (₹)</label>
          <input type="number" min={0} value={ebitdaInput} onChange={e => setEbitdaInput(e.target.value)} placeholder="e.g. 8000000" className={inp} />
        </div>
      </div>

      <div className="flex gap-2">
        {(["revenue", "ebitda"] as const).map(b => (
          <button key={b} onClick={() => setBasis(b)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all capitalize ${basis === b ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {b === "revenue" ? `Revenue basis (${m.revLow}–${m.revHigh}x)` : `EBITDA basis (${m.ebitdaLow}–${m.ebitdaHigh}x)`}
          </button>
        ))}
      </div>

      {(rev > 0 || ebitda > 0) && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Low", value: formatCurrency(Math.round(lowVal)), color: "text-[var(--color-text)]" },
              { label: "Mid-point", value: formatCurrency(Math.round(midVal)), color: "text-[var(--color-primary)]" },
              { label: "High", value: formatCurrency(Math.round(highVal)), color: "text-[var(--color-text)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label} ({basis})</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={bars} layout="vertical" barCategoryGap="28%">
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), "Implied value"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>{bars.map((b, i) => <Cell key={i} fill={b.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Private-company multiples carry a 20–35% liquidity/control discount vs listed comparables. Use as a sanity-check, not a quote.</p>
    </div>
  );
}

// ── #110 BERKUS / SCORECARD (PRE-REVENUE) ───────────────────────────────────────
const BERKUS_FACTORS = [
  { key: "idea",    label: "Sound idea (base value)",            max: 500000 },
  { key: "proto",   label: "Prototype (reduces tech risk)",      max: 500000 },
  { key: "team",    label: "Quality management team",            max: 500000 },
  { key: "rel",     label: "Strategic relationships",            max: 500000 },
  { key: "rollout", label: "Product rollout / early sales",      max: 500000 },
] as const;

const SCORECARD_FACTORS = [
  { key: "team",    label: "Strength of team",       weight: 0.30 },
  { key: "size",    label: "Size of opportunity",    weight: 0.25 },
  { key: "product", label: "Product / technology",   weight: 0.15 },
  { key: "comp",    label: "Competitive environment", weight: 0.10 },
  { key: "mkt",     label: "Marketing / sales / partnerships", weight: 0.10 },
  { key: "fund",    label: "Need for further investment", weight: 0.05 },
  { key: "other",   label: "Other factors",          weight: 0.05 },
] as const;

function BerkusScorecard() {
  const [method, setMethod] = useState<"berkus" | "scorecard">("berkus");
  // Berkus: per-factor value 0–max
  const [berkus, setBerkus] = useState<Record<string, number>>(() => Object.fromEntries(BERKUS_FACTORS.map(f => [f.key, f.max * 0.5])));
  // Scorecard: per-factor comparison vs median (50% = at par, 150% = strongly above)
  const [scoreInput, setScoreInput] = useState("4000000"); // regional median pre-money
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(SCORECARD_FACTORS.map(f => [f.key, 100])));

  const berkusTotal = BERKUS_FACTORS.reduce((s, f) => s + (berkus[f.key] || 0), 0);

  const median = parseFloat(scoreInput) || 0;
  const scorecardFactor = SCORECARD_FACTORS.reduce((s, f) => s + f.weight * ((scores[f.key] || 0) / 100), 0);
  const scorecardVal = Math.round(median * scorecardFactor);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Sprout size={14} className="text-green-400" /> Berkus / Scorecard (Pre-Revenue)</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Qualitative early-stage methods for ventures with little or no revenue, where multiples and DCF break down.</p>
      </div>

      <div className="flex gap-2">
        {(["berkus", "scorecard"] as const).map(mth => (
          <button key={mth} onClick={() => setMethod(mth)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all capitalize ${method === mth ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {mth === "berkus" ? "Berkus Method" : "Scorecard Method"}
          </button>
        ))}
      </div>

      {method === "berkus" && (
        <div className="space-y-3">
          <p className="text-[11px] text-[var(--color-muted)]">Assign up to ₹5,00,000 to each of five risk-reduction factors (cap ₹25,00,000 pre-money).</p>
          {BERKUS_FACTORS.map(f => (
            <div key={f.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--color-muted)]">{f.label}</span>
                <strong className="tabular-nums">{formatCurrency(berkus[f.key] || 0)}</strong>
              </div>
              <input type="range" min={0} max={f.max} step={25000} value={berkus[f.key] || 0}
                onChange={e => setBerkus(p => ({ ...p, [f.key]: Number(e.target.value) }))} className="w-full accent-[var(--color-primary)]" />
            </div>
          ))}
          <div className="bg-green-950/20 border border-green-800/40 rounded-lg p-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-green-400">Berkus pre-money valuation</p>
            <p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(berkusTotal)}</p>
          </div>
        </div>
      )}

      {method === "scorecard" && (
        <div className="space-y-3">
          <div className="max-w-xs">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Regional median pre-money (₹)</label>
            <input type="number" min={0} value={scoreInput} onChange={e => setScoreInput(e.target.value)} placeholder="e.g. 4000000" className={inp} />
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">Rate each factor vs the median deal: 100% = at par, &gt;100% = stronger, &lt;100% = weaker.</p>
          {SCORECARD_FACTORS.map(f => (
            <div key={f.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--color-muted)]">{f.label} <span className="opacity-60">· {Math.round(f.weight * 100)}% weight</span></span>
                <strong className="tabular-nums">{scores[f.key] || 0}%</strong>
              </div>
              <input type="range" min={0} max={200} step={5} value={scores[f.key] || 0}
                onChange={e => setScores(p => ({ ...p, [f.key]: Number(e.target.value) }))} className="w-full accent-[var(--color-primary)]" />
            </div>
          ))}
          <div className="bg-green-950/20 border border-green-800/40 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-400">Scorecard pre-money valuation</p>
              <p className="text-[10px] text-[var(--color-muted)]">Weighted factor {(scorecardFactor * 100).toFixed(0)}% × median</p>
            </div>
            <p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(scorecardVal)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── #111 SENSITIVITY / TORNADO ON DCF ───────────────────────────────────────────
function DcfTornado({ baseAnnualFcf, growthPct, discountPct }: { baseAnnualFcf: number; growthPct: number; discountPct: number }) {
  const [swing, setSwing] = useState(20); // +/- % swing on each assumption

  const base = useMemo(
    () => dcfValuation({ baseAnnualFcf, growthPct, discountPct }).enterpriseValue,
    [baseAnnualFcf, growthPct, discountPct],
  );

  const tornado = useMemo(() => {
    const f = swing / 100;
    const drivers = [
      {
        name: "FCF growth rate",
        low: dcfValuation({ baseAnnualFcf, growthPct: growthPct * (1 - f), discountPct }).enterpriseValue,
        high: dcfValuation({ baseAnnualFcf, growthPct: growthPct * (1 + f), discountPct }).enterpriseValue,
      },
      {
        name: "Discount rate",
        // discount and value move inversely → low rate = high value
        low: dcfValuation({ baseAnnualFcf, growthPct, discountPct: discountPct * (1 + f) }).enterpriseValue,
        high: dcfValuation({ baseAnnualFcf, growthPct, discountPct: discountPct * (1 - f) }).enterpriseValue,
      },
      {
        name: "Base year FCF",
        low: dcfValuation({ baseAnnualFcf: baseAnnualFcf * (1 - f), growthPct, discountPct }).enterpriseValue,
        high: dcfValuation({ baseAnnualFcf: baseAnnualFcf * (1 + f), growthPct, discountPct }).enterpriseValue,
      },
    ].map(d => ({ ...d, range: Math.abs(d.high - d.low) }));
    return drivers.sort((a, b) => b.range - a.range);
  }, [baseAnnualFcf, growthPct, discountPct, swing]);

  const maxRange = Math.max(1, ...tornado.map(t => t.range));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><SlidersHorizontal size={14} className="text-blue-400" /> DCF Sensitivity / Tornado</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Which assumption moves enterprise value the most? Each bar flexes one driver +/- the swing while holding others at base.</p>
      </div>

      <div className="max-w-sm">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--color-muted)]">Assumption swing</span>
          <strong>±{swing}%</strong>
        </div>
        <input type="range" min={5} max={50} step={5} value={swing} onChange={e => setSwing(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>

      <p className="text-xs text-[var(--color-muted)]">Base enterprise value: <strong className="text-[var(--color-primary)] tabular-nums">{formatCurrency(Math.round(base))}</strong></p>

      <div className="space-y-3">
        {tornado.map(t => {
          const lowPct = (Math.abs(base - t.low) / maxRange) * 50;
          const highPct = (Math.abs(t.high - base) / maxRange) * 50;
          return (
            <div key={t.name}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-medium">{t.name}</span>
                <span className="text-[var(--color-muted)] tabular-nums">{formatCurrency(Math.round(t.low))} – {formatCurrency(Math.round(t.high))}</span>
              </div>
              <div className="relative h-5 bg-[var(--color-bg)] rounded">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--color-border)]" />
                <div className="absolute top-0 bottom-0 bg-red-500/60 rounded-l" style={{ right: "50%", width: `${lowPct}%` }} />
                <div className="absolute top-0 bottom-0 bg-green-500/60 rounded-r" style={{ left: "50%", width: `${highPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 text-[10px] text-[var(--color-muted)]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 inline-block" /> Downside</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/60 inline-block" /> Upside</span>
        <span className="ml-auto">Sorted by impact — top driver matters most.</span>
      </div>
    </div>
  );
}

// ── #112 409A-STYLE FMV FOR ESOP ────────────────────────────────────────────────
function Esop409aFmv({ enterpriseValue }: { enterpriseValue: number }) {
  const [equityValueInput, setEquityValueInput] = useState(() => (enterpriseValue > 0 ? String(Math.round(enterpriseValue)) : ""));
  const [sharesInput, setSharesInput] = useState("1000000");      // fully-diluted shares
  const [prefStackInput, setPrefStackInput] = useState("0");      // liquidation preference (debt-like)
  const [dlomPct, setDlomPct] = useState(30);                     // discount for lack of marketability

  const equityValue = parseFloat(equityValueInput) || 0;
  const shares = parseFloat(sharesInput) || 0;
  const prefStack = parseFloat(prefStackInput) || 0;

  // common equity = equity value less senior preference stack, then DLOM applied
  const commonEquity = Math.max(0, equityValue - prefStack);
  const dlomFactor = 1 - dlomPct / 100;
  const adjustedCommon = commonEquity * dlomFactor;
  const fmvPerShare = shares > 0 ? adjustedCommon / shares : 0;
  const rawPerShare = shares > 0 ? equityValue / shares : 0;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet size={14} className="text-purple-400" /> 409A-style FMV for ESOP</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Defensible fair-market value per share for option grants — equity value less the preference stack, marked down for illiquidity (DLOM).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Equity value (₹)</label>
          <input type="number" min={0} value={equityValueInput} onChange={e => setEquityValueInput(e.target.value)} placeholder="from blended mid-point" className={inp} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Fully-diluted shares</label>
          <input type="number" min={0} value={sharesInput} onChange={e => setSharesInput(e.target.value)} placeholder="e.g. 1000000" className={inp} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Liquidation preference (₹)</label>
          <input type="number" min={0} value={prefStackInput} onChange={e => setPrefStackInput(e.target.value)} placeholder="senior pref. stack" className={inp} />
        </div>
      </div>

      <div className="max-w-sm">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--color-muted)]">Discount for lack of marketability (DLOM)</span>
          <strong>{dlomPct}%</strong>
        </div>
        <input type="range" min={0} max={50} step={1} value={dlomPct} onChange={e => setDlomPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        <p className="text-[10px] text-[var(--color-muted)] mt-1">Private companies typically apply 20–40% DLOM. Higher for early-stage / illiquid stock.</p>
      </div>

      {shares > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Common equity (post-pref)", value: formatCurrency(Math.round(commonEquity)), color: "text-[var(--color-text)]" },
            { label: "After DLOM", value: formatCurrency(Math.round(adjustedCommon)), color: "text-[var(--color-text)]" },
            { label: "FMV / share (409A)", value: formatCurrency(Number(fmvPerShare.toFixed(2))), color: "text-purple-400" },
            { label: "Undiscounted / share", value: formatCurrency(Number(rawPerShare.toFixed(2))), color: "text-[var(--color-muted)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        A US 409A valuation must be done by an independent appraiser; this is an indicative strike-price guide. Set option exercise price at or above FMV to avoid deemed-perquisite / tax issues.
      </div>
    </div>
  );
}

const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// ── VC METHOD (EXIT-VALUE ÷ TARGET RETURN) ──────────────────────────────────────
function VcMethod({ annualRevenue, raiseAmount }: { annualRevenue: number; raiseAmount: number }) {
  const [exitYears, setExitYears] = useState(5);
  const [exitGrowth, setExitGrowth] = useState(40);      // annual revenue CAGR to exit
  const [exitMultiple, setExitMultiple] = useState(4);   // EV/Revenue at exit
  const [targetReturn, setTargetReturn] = useState(10);  // investor wants 10x
  const [raiseInput, setRaiseInput] = useState(() => String(Math.round(raiseAmount)));

  const baseRev = annualRevenue > 0 ? annualRevenue : 10_000_000;
  const exitRevenue = baseRev * Math.pow(1 + exitGrowth / 100, exitYears);
  const exitValue = exitRevenue * exitMultiple;
  const postMoneyToday = targetReturn > 0 ? exitValue / targetReturn : 0;        // what the round must be worth today
  const raise = parseFloat(raiseInput) || 0;
  const investorOwnership = postMoneyToday > 0 ? (raise / postMoneyToday) * 100 : 0;
  const preMoney = Math.max(0, postMoneyToday - raise);
  const impliedIrr = postMoneyToday > 0 && exitYears > 0 ? (Math.pow(exitValue / postMoneyToday, 1 / exitYears) - 1) * 100 : 0;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> VC Method — Exit-Value Backsolve</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Works backward from a projected exit value and the investor's required return multiple to today's post-money and the stake they need.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Round size (₹)</label>
          <input type="number" min={0} value={raiseInput} onChange={e => setRaiseInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Exit EV/Revenue multiple</label>
          <input type="number" min={0} step={0.5} value={exitMultiple} onChange={e => setExitMultiple(Number(e.target.value))} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Investor target return (x)</label>
          <input type="number" min={1} step={1} value={targetReturn} onChange={e => setTargetReturn(Number(e.target.value))} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Years to exit</span><strong>{exitYears}y</strong></div>
          <input type="range" min={2} max={10} step={1} value={exitYears} onChange={e => setExitYears(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Revenue CAGR to exit</span><strong>{exitGrowth}%</strong></div>
          <input type="range" min={0} max={120} step={5} value={exitGrowth} onChange={e => setExitGrowth(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Exit value", value: formatCurrency(Math.round(exitValue)), color: "text-[var(--color-text)]" },
          { label: "Post-money today", value: formatCurrency(Math.round(postMoneyToday)), color: "text-[var(--color-primary)]" },
          { label: "Pre-money today", value: formatCurrency(Math.round(preMoney)), color: "text-[var(--color-text)]" },
          { label: "Investor stake", value: `${investorOwnership.toFixed(1)}%`, color: investorOwnership > 30 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Implied IRR on the investor's money: <strong className="tabular-nums">{impliedIrr.toFixed(0)}%</strong> per year. A {targetReturn}x over {exitYears} years is what the classic VC method requires to back this entry price.</p>
    </div>
  );
}

// ── FIRST-CHICAGO PROBABILITY-WEIGHTED VALUATION ────────────────────────────────
function FirstChicago({ baseValuation }: { baseValuation: number }) {
  const round = (n: number) => Math.max(0, Math.round(n));
  const [best, setBest] = useState(() => String(round(baseValuation * 2.5)));
  const [base, setBase] = useState(() => String(round(baseValuation)));
  const [worst, setWorst] = useState(() => String(round(baseValuation * 0.3)));
  const [pBest, setPBest] = useState(20);
  const [pBase, setPBase] = useState(55);
  // worst probability is the remainder
  const pWorst = Math.max(0, 100 - pBest - pBase);

  const bestV = parseFloat(best) || 0;
  const baseV = parseFloat(base) || 0;
  const worstV = parseFloat(worst) || 0;
  const expected = (bestV * pBest + baseV * pBase + worstV * pWorst) / 100;

  const rows = [
    { name: "Best case", value: bestV, prob: pBest, color: "text-green-400" },
    { name: "Base case", value: baseV, prob: pBase, color: "text-[var(--color-primary)]" },
    { name: "Worst case", value: worstV, prob: pWorst, color: "text-red-400" },
  ];

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Dice5 size={14} className="text-blue-400" /> First-Chicago Method</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Blends best / base / worst-case valuations by probability into one expected figure — honest about uncertainty instead of a single false-precision number.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {([["Best case (₹)", best, setBest], ["Base case (₹)", base, setBase], ["Worst case (₹)", worst, setWorst]] as const).map(([label, val, setter]) => (
          <div key={label}>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
            <input type="number" min={0} value={val} onChange={e => setter(e.target.value)} className={INP} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Best-case probability</span><strong>{pBest}%</strong></div>
          <input type="range" min={0} max={100} step={5} value={pBest} onChange={e => setPBest(Math.min(Number(e.target.value), 100 - pBase))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Base-case probability</span><strong>{pBase}%</strong></div>
          <input type="range" min={0} max={100} step={5} value={pBase} onChange={e => setPBase(Math.min(Number(e.target.value), 100 - pBest))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="space-y-1">
        {rows.map(r => (
          <div key={r.name} className="flex items-center justify-between text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
            <span className={`font-medium ${r.color}`}>{r.name}</span>
            <span className="text-[var(--color-muted)] tabular-nums">{r.prob}% × {formatCurrency(Math.round(r.value))}</span>
            <span className="tabular-nums font-semibold">{formatCurrency(Math.round(r.value * r.prob / 100))}</span>
          </div>
        ))}
      </div>

      <div className="bg-blue-950/20 border border-blue-800/40 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-300">Expected valuation</p>
          <p className="text-[10px] text-[var(--color-muted)]">Probabilities sum to {pBest + pBase + pWorst}% (worst = {pWorst}%)</p>
        </div>
        <p className="text-xl font-bold tabular-nums text-blue-300">{formatCurrency(Math.round(expected))}</p>
      </div>
    </div>
  );
}

// ── RUNWAY → NEXT-ROUND PLANNER ─────────────────────────────────────────────────
function RunwayPlanner({ cash, monthlyNet }: { cash: number; monthlyNet: number }) {
  const liveBurn = monthlyNet < 0 ? Math.round(-monthlyNet) : 0;
  const [cashInput, setCashInput] = useState(() => String(Math.max(0, Math.round(cash))));
  const [burnInput, setBurnInput] = useState(() => String(liveBurn > 0 ? liveBurn : 500_000));
  const [raiseProcessMonths, setRaiseProcessMonths] = useState(5); // how long a raise takes to close
  const [bufferMonths, setBufferMonths] = useState(3);              // safety cushion after close

  const cashNow = parseFloat(cashInput) || 0;
  const burn = parseFloat(burnInput) || 0;
  const runwayMonths = burn > 0 ? cashNow / burn : Infinity;
  const startInMonths = burn > 0 ? Math.max(0, runwayMonths - raiseProcessMonths - bufferMonths) : Infinity;
  const cashAtClose = burn > 0 ? cashNow - burn * (startInMonths + raiseProcessMonths) : cashNow;
  const status: "ok" | "soon" | "urgent" =
    !isFinite(startInMonths) ? "ok" : startInMonths <= 0 ? "urgent" : startInMonths <= 2 ? "soon" : "ok";

  const statusStyle = {
    ok: "bg-green-950/20 border-green-800/40 text-green-400",
    soon: "bg-yellow-950/20 border-yellow-800/40 text-yellow-400",
    urgent: "bg-red-950/20 border-red-800/40 text-red-400",
  }[status];

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Hourglass size={14} className="text-[var(--color-primary)]" /> Runway → Next-Round Planner</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">When to start raising so you close before cash runs out. Pre-filled from your live cash balance and monthly burn.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Cash in bank (₹)</label>
          <input type="number" min={0} value={cashInput} onChange={e => setCashInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Net monthly burn (₹)</label>
          <input type="number" min={0} value={burnInput} onChange={e => setBurnInput(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Time to close a raise</span><strong>{raiseProcessMonths} mo</strong></div>
          <input type="range" min={2} max={9} step={1} value={raiseProcessMonths} onChange={e => setRaiseProcessMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Safety buffer</span><strong>{bufferMonths} mo</strong></div>
          <input type="range" min={0} max={6} step={1} value={bufferMonths} onChange={e => setBufferMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Current runway", value: isFinite(runwayMonths) ? `${runwayMonths.toFixed(1)} mo` : "∞ (profitable)" },
          { label: "Start raising in", value: isFinite(startInMonths) ? `${startInMonths.toFixed(1)} mo` : "No urgency" },
          { label: "Cash at close", value: formatCurrency(Math.round(cashAtClose)) },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className="text-base font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg border p-3 text-xs font-medium ${statusStyle}`}>
        {status === "ok" && (isFinite(startInMonths) ? "On track — you have comfortable headroom before you must start raising." : "Cash-flow positive — raise opportunistically, not out of necessity.")}
        {status === "soon" && "Start preparing the raise now — you cross the buffer line within two months."}
        {status === "urgent" && "Begin raising immediately — current runway is already inside the time it takes to close plus your buffer."}
      </div>
    </div>
  );
}

// ── DILUTION WATERFALL ACROSS ROUNDS ────────────────────────────────────────────
interface WaterfallRound { id: string; name: string; raise: number; preMoney: number }

function DilutionWaterfall({ startValuation }: { startValuation: number }) {
  const seed = Math.max(5_000_000, Math.round(startValuation || 50_000_000));
  const [rounds, setRounds] = useFeatureState<WaterfallRound[]>("val-dilution-waterfall", [
    { id: "r1", name: "Seed", raise: Math.round(seed * 0.15), preMoney: seed },
    { id: "r2", name: "Series A", raise: Math.round(seed * 0.6), preMoney: Math.round(seed * 3) },
  ]);

  // Walk the rounds: founders + earlier holders dilute by investor% each round
  let founderPct = 100;
  const walk = rounds.map(r => {
    const post = r.preMoney + r.raise;
    const newInvestorPct = post > 0 ? (r.raise / post) * 100 : 0;
    founderPct = founderPct * (1 - newInvestorPct / 100);
    return { ...r, post, newInvestorPct, founderPctAfter: founderPct };
  });
  const finalFounder = walk.length ? walk[walk.length - 1].founderPctAfter : 100;

  const update = (id: string, patch: Partial<WaterfallRound>) =>
    setRounds(p => p.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const addRound = () =>
    setRounds(p => [...p, { id: `r${Date.now()}`, name: `Round ${p.length + 1}`, raise: 10_000_000, preMoney: 100_000_000 }]);
  const removeRound = (id: string) => setRounds(p => p.filter(r => r.id !== id));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-purple-400" /> Dilution Waterfall</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Stack multiple rounds and watch your founder ownership compound down. Saved to your workspace.</p>
        </div>
        <button onClick={addRound} className="text-[11px] bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2.5 py-1 rounded-lg hover:bg-[var(--color-primary)]/25 whitespace-nowrap">+ Add round</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)]">
            <tr>{["Round", "Pre-money (₹)", "Raise (₹)", "Post-money", "New stake", "Founder after", ""].map(h =>
              <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {walk.map(r => (
              <tr key={r.id}>
                <td className="px-2 py-2">
                  <input value={r.name} onChange={e => update(r.id, { name: e.target.value })}
                    className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} value={r.preMoney} onChange={e => update(r.id, { preMoney: Number(e.target.value) })}
                    className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs tabular-nums outline-none focus:border-[var(--color-primary)]" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} value={r.raise} onChange={e => update(r.id, { raise: Number(e.target.value) })}
                    className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs tabular-nums outline-none focus:border-[var(--color-primary)]" />
                </td>
                <td className="px-2 py-2 tabular-nums text-[var(--color-muted)]">{formatAmount(r.post)}</td>
                <td className="px-2 py-2 tabular-nums">{r.newInvestorPct.toFixed(1)}%</td>
                <td className={`px-2 py-2 tabular-nums font-semibold ${r.founderPctAfter < 50 ? "text-red-400" : "text-[var(--color-text)]"}`}>{r.founderPctAfter.toFixed(1)}%</td>
                <td className="px-2 py-2">
                  <button onClick={() => removeRound(r.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-purple-950/20 border border-purple-800/40 rounded-lg p-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-purple-300">Founder ownership after {walk.length} round{walk.length === 1 ? "" : "s"}</p>
        <p className={`text-xl font-bold tabular-nums ${finalFounder < 50 ? "text-red-400" : "text-purple-300"}`}>{finalFounder.toFixed(1)}%</p>
      </div>
      {finalFounder < 50 && <p className="text-[10px] text-red-400">You drop below 50% — plan board control and protective provisions before the round that crosses this line.</p>}
    </div>
  );
}

// ── OPTION-POOL SHUFFLE (PRE VS POST-MONEY) ─────────────────────────────────────
function PoolShuffle({ preMoney, raiseAmount }: { preMoney: number; raiseAmount: number }) {
  const [preInput, setPreInput] = useState(() => String(Math.round(preMoney || 50_000_000)));
  const [raiseInput, setRaiseInput] = useState(() => String(Math.round(raiseAmount || 10_000_000)));
  const [poolPct, setPoolPct] = useState(10);          // target pool as % of post-money cap table
  const [timing, setTiming] = useState<"pre" | "post">("pre");

  const pre = parseFloat(preInput) || 0;
  const raise = parseFloat(raiseInput) || 0;
  const post = pre + raise;
  const investorPct = post > 0 ? (raise / post) * 100 : 0;

  // Pre-money pool: the new pool comes out of the pre-money (founders bear it).
  // Post-money pool: the pool dilutes everyone proportionally (investors share it).
  const poolFromFounders = timing === "pre" ? poolPct : poolPct * (1 - investorPct / 100);
  const founderPct = Math.max(0, 100 - investorPct - poolFromFounders);
  const investorEff = timing === "pre" ? investorPct : Math.max(0, investorPct - poolPct * (investorPct / 100));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Option-Pool Shuffle</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">The "pool shuffle": creating the ESOP pool <em>pre</em>-money dilutes only founders; <em>post</em>-money spreads it across everyone. See who pays for the pool.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Pre-money (₹)</label>
          <input type="number" min={0} value={preInput} onChange={e => setPreInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Round size (₹)</label>
          <input type="number" min={0} value={raiseInput} onChange={e => setRaiseInput(e.target.value)} className={INP} />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Target option pool (% of post-money)</span><strong>{poolPct}%</strong></div>
        <input type="range" min={0} max={25} step={1} value={poolPct} onChange={e => setPoolPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>

      <div className="flex gap-2">
        {(["pre", "post"] as const).map(t => (
          <button key={t} onClick={() => setTiming(t)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${timing === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {t === "pre" ? "Pre-money pool (founders pay)" : "Post-money pool (shared)"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Founder stake", value: `${founderPct.toFixed(1)}%`, color: "text-[var(--color-text)]" },
          { label: "Investor stake", value: `${investorEff.toFixed(1)}%`, color: "text-[var(--color-primary)]" },
          { label: "Option pool", value: `${poolPct.toFixed(1)}%`, color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">
        Founders give up <strong className="tabular-nums">{poolFromFounders.toFixed(1)}%</strong> to the pool in the {timing}-money structure.
        {timing === "pre" && " Investors usually push for a pre-money pool because it dilutes you, not them — negotiate the pool size down."}
      </p>
    </div>
  );
}

// ── CONVERTIBLE-NOTE CAP / DISCOUNT CONVERTER ───────────────────────────────────
function NoteConverter({ nextRoundPreMoney }: { nextRoundPreMoney: number }) {
  const [investment, setInvestment] = useState("2500000");
  const [cap, setCap] = useState(() => String(Math.round(nextRoundPreMoney || 60_000_000)));
  const [discountPct, setDiscountPct] = useState(20);
  const [interestPct, setInterestPct] = useState(8);
  const [months, setMonths] = useState(18);
  const [roundPre, setRoundPre] = useState(() => String(Math.round((nextRoundPreMoney || 60_000_000) * 1.5)));
  const [sharesPreRound, setSharesPreRound] = useState("1000000");

  const inv = parseFloat(investment) || 0;
  const capV = parseFloat(cap) || 0;
  const pre = parseFloat(roundPre) || 0;
  const shares = parseFloat(sharesPreRound) || 0;

  const accruedInterest = inv * (interestPct / 100) * (months / 12);
  const principalPlusInterest = inv + accruedInterest;

  // Price per share in the priced round (pre-money basis)
  const roundPrice = shares > 0 ? pre / shares : 0;
  const discountPrice = roundPrice * (1 - discountPct / 100);
  const capPrice = shares > 0 && capV > 0 ? capV / shares : 0;
  // Note converts at the lower of cap price and discount price (better for noteholder)
  const conversionPrice = Math.min(
    discountPrice || Infinity,
    capPrice || Infinity,
  );
  const finalPrice = isFinite(conversionPrice) ? conversionPrice : roundPrice;
  const sharesIssued = finalPrice > 0 ? principalPlusInterest / finalPrice : 0;
  const usedCap = capPrice > 0 && capPrice <= (discountPrice || Infinity);
  const postRound = pre + principalPlusInterest;
  const noteOwnership = postRound > 0 ? (principalPlusInterest / (finalPrice * (shares + sharesIssued) || 1)) * 100 : 0;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Convertible-Note Cap / Discount Converter</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Works out where a note converts at the next priced round — the noteholder takes the lower of the valuation-cap price and the discount price.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Note principal (₹)</label>
          <input type="number" min={0} value={investment} onChange={e => setInvestment(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Valuation cap (₹)</label>
          <input type="number" min={0} value={cap} onChange={e => setCap(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Next-round pre-money (₹)</label>
          <input type="number" min={0} value={roundPre} onChange={e => setRoundPre(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Shares before round</label>
          <input type="number" min={0} value={sharesPreRound} onChange={e => setSharesPreRound(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Discount %</label>
          <input type="number" min={0} max={50} value={discountPct} onChange={e => setDiscountPct(Number(e.target.value))} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Interest % p.a. · months</label>
          <div className="flex gap-2">
            <input type="number" min={0} value={interestPct} onChange={e => setInterestPct(Number(e.target.value))} className={INP} />
            <input type="number" min={0} value={months} onChange={e => setMonths(Number(e.target.value))} className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Principal + interest", value: formatCurrency(Math.round(principalPlusInterest)), color: "text-[var(--color-text)]" },
          { label: "Round price / share", value: formatCurrency(Number(roundPrice.toFixed(2))), color: "text-[var(--color-muted)]" },
          { label: "Conversion price / share", value: formatCurrency(Number(finalPrice.toFixed(2))), color: "text-[var(--color-primary)]" },
          { label: "Shares to noteholder", value: formatAmount(Math.round(sharesIssued)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">
        Converts on the <strong>{usedCap ? "valuation cap" : "discount"}</strong> (the cheaper price for the noteholder), giving roughly <strong className="tabular-nums">{noteOwnership.toFixed(1)}%</strong> post-conversion ownership. A lower cap or higher discount means more shares for the same cheque.
      </p>
    </div>
  );
}

// ── ESOP GRANT VALUE CALCULATOR ─────────────────────────────────────────────────
function EsopGrantValue({ equityValue }: { equityValue: number }) {
  const [optionsGranted, setOptionsGranted] = useState("5000");
  const [totalShares, setTotalShares] = useState("1000000");
  const [strikeInput, setStrikeInput] = useState("10");
  const [equityInput, setEquityInput] = useState(() => String(Math.round(equityValue || 50_000_000)));
  const [exitGrowthX, setExitGrowthX] = useState(3); // company grows Nx by exit

  const options = parseFloat(optionsGranted) || 0;
  const total = parseFloat(totalShares) || 0;
  const strike = parseFloat(strikeInput) || 0;
  const equity = parseFloat(equityInput) || 0;

  const pricePerShare = total > 0 ? equity / total : 0;
  const grossNow = options * pricePerShare;
  const exerciseCost = options * strike;
  const netNow = Math.max(0, grossNow - exerciseCost);
  const ownershipPct = total > 0 ? (options / total) * 100 : 0;
  const exitPrice = pricePerShare * exitGrowthX;
  const netAtExit = Math.max(0, options * exitPrice - exerciseCost);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Gift size={14} className="text-green-400" /> ESOP Grant Value Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">What a grant is worth today and at exit — the number to put in an offer letter so candidates understand the equity, net of exercise cost.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Options granted</label>
          <input type="number" min={0} value={optionsGranted} onChange={e => setOptionsGranted(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Total fully-diluted shares</label>
          <input type="number" min={0} value={totalShares} onChange={e => setTotalShares(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Strike price / share (₹)</label>
          <input type="number" min={0} value={strikeInput} onChange={e => setStrikeInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Equity value (₹)</label>
          <input type="number" min={0} value={equityInput} onChange={e => setEquityInput(e.target.value)} className={INP} />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Company value at exit</span><strong>{exitGrowthX}x today</strong></div>
        <input type="range" min={1} max={20} step={1} value={exitGrowthX} onChange={e => setExitGrowthX(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ownership", value: `${ownershipPct.toFixed(3)}%`, color: "text-[var(--color-text)]" },
          { label: "Gross value (today)", value: formatCurrency(Math.round(grossNow)), color: "text-[var(--color-text)]" },
          { label: "Net of exercise", value: formatCurrency(Math.round(netNow)), color: "text-green-400" },
          { label: `Net at ${exitGrowthX}x exit`, value: formatCurrency(Math.round(netAtExit)), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Exercise cost on the full grant is {formatCurrency(Math.round(exerciseCost))}. Perquisite tax applies at exercise on (FMV − strike); plan with the ESOP Tax tools before the candidate exercises.</p>
    </div>
  );
}

// ── FOUNDER VESTING SCHEDULE ────────────────────────────────────────────────────
function VestingSchedule() {
  const [totalShares, setTotalShares] = useState("400000");
  const [totalMonths, setTotalMonths] = useState(48);
  const [cliffMonths, setCliffMonths] = useState(12);
  const [elapsed, setElapsed] = useState(18);

  const total = parseFloat(totalShares) || 0;
  const vestedNow = elapsed < cliffMonths ? 0 : Math.min(total, Math.round((total * elapsed) / totalMonths));
  const vestedPct = total > 0 ? (vestedNow / total) * 100 : 0;
  const unvested = total - vestedNow;

  // Milestone schedule: cliff, then yearly checkpoints
  const milestones = useMemo(() => {
    const pts: { label: string; month: number; vested: number }[] = [];
    pts.push({ label: `Cliff (${cliffMonths}m)`, month: cliffMonths, vested: Math.round((total * cliffMonths) / totalMonths) });
    for (let y = 1; y * 12 <= totalMonths; y++) {
      const m = y * 12;
      if (m <= cliffMonths) continue;
      pts.push({ label: `Year ${y}`, month: m, vested: Math.round((total * m) / totalMonths) });
    }
    if (totalMonths % 12 !== 0) pts.push({ label: "Full vest", month: totalMonths, vested: total });
    return pts;
  }, [total, totalMonths, cliffMonths]);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-purple-400" /> Founder Vesting Schedule</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Standard four-year vest with a one-year cliff. See exactly how many founder shares are vested today and at each milestone.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Founder shares under vesting</label>
          <input type="number" min={0} value={totalShares} onChange={e => setTotalShares(e.target.value)} className={INP} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Vest length (mo)</label>
            <input type="number" min={1} value={totalMonths} onChange={e => setTotalMonths(Number(e.target.value))} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cliff (mo)</label>
            <input type="number" min={0} value={cliffMonths} onChange={e => setCliffMonths(Number(e.target.value))} className={INP} />
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Months elapsed since grant</span><strong>{elapsed} mo</strong></div>
        <input type="range" min={0} max={totalMonths} step={1} value={Math.min(elapsed, totalMonths)} onChange={e => setElapsed(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        <div className="relative h-3 bg-[var(--color-bg)] rounded-full overflow-hidden mt-2">
          <div className="absolute h-full bg-purple-500/50" style={{ left: 0, width: `${totalMonths > 0 ? (cliffMonths / totalMonths) * 100 : 0}%` }} title="cliff" />
          <div className="absolute h-full bg-purple-400 rounded-full" style={{ width: `${Math.min(100, vestedPct)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Vested now", value: formatAmount(vestedNow), color: "text-purple-300" },
          { label: "Vested %", value: `${vestedPct.toFixed(1)}%`, color: "text-purple-300" },
          { label: "Still unvested", value: formatAmount(unvested), color: "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)]">
            <tr>{["Milestone", "Month", "Cumulative vested", "% vested"].map(h =>
              <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {milestones.map(m => (
              <tr key={m.label} className={elapsed >= m.month ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}>
                <td className="px-3 py-2">{m.label}{elapsed >= m.month && " ✓"}</td>
                <td className="px-3 py-2 tabular-nums">{m.month}</td>
                <td className="px-3 py-2 tabular-nums">{formatAmount(m.vested)}</td>
                <td className="px-3 py-2 tabular-nums">{total > 0 ? ((m.vested / total) * 100).toFixed(0) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {elapsed < cliffMonths && <p className="text-[10px] text-yellow-400">Before the cliff nothing is vested — leaving now forfeits the entire grant.</p>}
    </div>
  );
}

// ── RULE OF 40 SCORE ────────────────────────────────────────────────────────────
function RuleOf40({ annualRevenue, growthPct, monthlyNet, monthlyRevenue }: { annualRevenue: number; growthPct: number; monthlyNet: number; monthlyRevenue: number }) {
  const liveMargin = monthlyRevenue > 0 ? Math.round((monthlyNet / monthlyRevenue) * 100) : 0;
  const [growthInput, setGrowthInput] = useState(() => String(Math.round(growthPct)));
  const [marginInput, setMarginInput] = useState(() => String(Math.max(-50, Math.min(60, liveMargin))));

  const growth = parseFloat(growthInput) || 0;
  const margin = parseFloat(marginInput) || 0;
  const score = growth + margin;
  const passes = score >= 40;

  // Software firms trade richer when the rule holds; rough multiple guide
  const impliedMultiple = annualRevenue > 0 ? Math.max(0.5, Math.min(14, 2 + score * 0.18)) : 0;
  const impliedVal = annualRevenue * impliedMultiple;

  const tone = passes ? "text-green-400" : score >= 25 ? "text-yellow-400" : "text-red-400";
  const band = passes ? "bg-green-950/20 border-green-800/40" : score >= 25 ? "bg-yellow-950/20 border-yellow-800/40" : "bg-red-950/20 border-red-800/40";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Rule of 40 Score</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">The investor shorthand for healthy scaling: revenue growth % plus profit margin % should clear 40. Pre-filled from your live growth and net margin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Revenue growth (% YoY)</label>
          <input type="number" value={growthInput} onChange={e => setGrowthInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Profit / EBITDA margin (%)</label>
          <input type="number" value={marginInput} onChange={e => setMarginInput(e.target.value)} className={INP} />
        </div>
      </div>

      <div className={`rounded-lg border p-4 flex items-center justify-between ${band}`}>
        <div>
          <p className={`text-sm font-semibold ${tone}`}>Rule-of-40 score: {score.toFixed(0)}</p>
          <p className="text-[10px] text-[var(--color-muted)]">{growth.toFixed(0)}% growth + {margin.toFixed(0)}% margin · target ≥ 40</p>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${tone}`}>{passes ? "PASS" : "BELOW"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Implied EV/Revenue", value: annualRevenue > 0 ? `${impliedMultiple.toFixed(1)}x` : "—", color: "text-[var(--color-primary)]" },
          { label: "Implied valuation", value: annualRevenue > 0 ? formatCurrency(Math.round(impliedVal)) : "—", color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Below 40, investors expect you to trade growth for efficiency (or vice-versa). The implied multiple is an indicative guide, not a quote.</p>
    </div>
  );
}

// ── LIQUIDATION-PREFERENCE EXIT STACK ───────────────────────────────────────────
function LiqPrefStack({ exitValue }: { exitValue: number }) {
  const [exitInput, setExitInput] = useState(() => String(Math.round(exitValue || 100_000_000)));
  const [invested, setInvested] = useState("30000000");      // preferred capital invested
  const [investorPct, setInvestorPct] = useState(30);        // investor as-converted ownership %
  const [prefMultiple, setPrefMultiple] = useState(1);       // 1x / 2x preference
  const [participating, setParticipating] = useState(false); // participating vs non-participating

  const exit = parseFloat(exitInput) || 0;
  const inv = parseFloat(invested) || 0;
  const pref = inv * prefMultiple;
  const ownership = investorPct / 100;

  // Non-participating: investor takes MAX(preference, as-converted share).
  // Participating: investor takes preference PLUS pro-rata share of the remainder.
  let investorProceeds: number;
  if (participating) {
    investorProceeds = Math.min(exit, pref + Math.max(0, exit - pref) * ownership);
  } else {
    const asConverted = exit * ownership;
    investorProceeds = Math.min(exit, Math.max(pref, asConverted));
  }
  const founderProceeds = Math.max(0, exit - investorProceeds);
  const investorReturnX = inv > 0 ? investorProceeds / inv : 0;
  // Break-even: exit where as-converted equals the preference (non-participating only)
  const breakeven = ownership > 0 ? pref / ownership : 0;
  const tookPref = !participating && pref >= exit * ownership;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-purple-400" /> Liquidation-Preference Stack</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">At an exit, preferred investors are paid before common. See how a 1x/2x preference and participation rights split the proceeds between you and your investors.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Exit / sale value (₹)</label>
          <input type="number" min={0} value={exitInput} onChange={e => setExitInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Preferred capital invested (₹)</label>
          <input type="number" min={0} value={invested} onChange={e => setInvested(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Investor ownership (%)</label>
          <input type="number" min={0} max={100} value={investorPct} onChange={e => setInvestorPct(Number(e.target.value))} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Preference multiple</span><strong>{prefMultiple}x</strong></div>
          <input type="range" min={1} max={3} step={0.5} value={prefMultiple} onChange={e => setPrefMultiple(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div className="flex items-end">
          <button onClick={() => setParticipating(p => !p)}
            className={`w-full py-2 text-xs font-semibold rounded-lg border transition-all ${participating ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {participating ? "Participating (pref + share)" : "Non-participating (greater of)"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Preference amount", value: formatCurrency(Math.round(pref)), color: "text-[var(--color-muted)]" },
          { label: "Investor proceeds", value: formatCurrency(Math.round(investorProceeds)), color: "text-[var(--color-primary)]" },
          { label: "Founder / common", value: formatCurrency(Math.round(founderProceeds)), color: "text-green-400" },
          { label: "Investor return", value: `${investorReturnX.toFixed(2)}x`, color: investorReturnX < 1 ? "text-red-400" : "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="relative h-4 bg-[var(--color-bg)] rounded-full overflow-hidden flex">
        <div className="h-full bg-[var(--color-primary)]/70" style={{ width: `${exit > 0 ? (investorProceeds / exit) * 100 : 0}%` }} title="Investor" />
        <div className="h-full bg-green-500/60" style={{ width: `${exit > 0 ? (founderProceeds / exit) * 100 : 0}%` }} title="Common" />
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        {participating
          ? "Participating preferred double-dips: the preference comes off the top, then they share the rest pro-rata — heavily founder-unfriendly at low exits."
          : tookPref
            ? `Below an exit of ~${formatCurrency(Math.round(breakeven))} the investor takes the preference, not their equity share — push for 1x non-participating.`
            : `At this exit the investor converts to common (their equity share beats the ${prefMultiple}x preference).`}
      </p>
    </div>
  );
}

// ── SECONDARY-SALE CAPITAL-GAINS TAX ────────────────────────────────────────────
function SecondarySaleTax({ equityValue }: { equityValue: number }) {
  const [shares, setShares] = useState("10000");
  const [costPerShare, setCostPerShare] = useState("10");
  const [salePerShare, setSalePerShare] = useState(() => {
    const ps = equityValue > 0 ? equityValue / 1_000_000 : 100;
    return String(Math.max(10, Math.round(ps)));
  });
  const [holdingMonths, setHoldingMonths] = useState(30);
  const [surchargePct, setSurchargePct] = useState(0); // 0 / 10 / 15 / 25 high-income surcharge

  const n = parseFloat(shares) || 0;
  const cost = parseFloat(costPerShare) || 0;
  const sale = parseFloat(salePerShare) || 0;
  const proceeds = n * sale;
  const costBasis = n * cost;
  const gain = Math.max(0, proceeds - costBasis);
  // Unlisted shares: long-term if held > 24 months → 20% (post-2024 finance act simplified to 12.5% on unlisted LTCG)
  const isLong = holdingMonths > 24;
  const baseRate = isLong ? 12.5 : 30;             // LTCG 12.5% (unlisted, post Jul-2024) vs STCG at slab (assume 30%)
  const cessAndSurcharge = (1 + surchargePct / 100) * 1.04; // 4% health & education cess
  const effectiveRate = baseRate * cessAndSurcharge;
  const tax = gain * (effectiveRate / 100);
  const netProceeds = proceeds - tax;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Secondary-Sale Capital-Gains Tax</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Estimate the Indian capital-gains tax when an employee or early investor sells unlisted shares in a secondary. Long-term (held &gt; 24 months) is taxed far lighter.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Shares sold</label>
          <input type="number" min={0} value={shares} onChange={e => setShares(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Cost / share (₹)</label>
          <input type="number" min={0} value={costPerShare} onChange={e => setCostPerShare(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Sale price / share (₹)</label>
          <input type="number" min={0} value={salePerShare} onChange={e => setSalePerShare(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Holding period</span><strong>{holdingMonths} mo · {isLong ? "long-term" : "short-term"}</strong></div>
          <input type="range" min={1} max={60} step={1} value={holdingMonths} onChange={e => setHoldingMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">High-income surcharge (%)</label>
          <select value={surchargePct} onChange={e => setSurchargePct(Number(e.target.value))} className={INP}>
            {[0, 10, 15, 25].map(s => <option key={s} value={s}>{s}% surcharge</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Gross gain", value: formatCurrency(Math.round(gain)), color: "text-[var(--color-text)]" },
          { label: `Effective rate (${isLong ? "LTCG" : "STCG"})`, value: `${effectiveRate.toFixed(1)}%`, color: "text-yellow-400" },
          { label: "Tax payable", value: formatCurrency(Math.round(tax)), color: "text-red-400" },
          { label: "Net in hand", value: formatCurrency(Math.round(netProceeds)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Indicative only. Unlisted-share LTCG (held &gt; 24 months) is taxed at 12.5% plus cess/surcharge post Jul-2024; short-term gains are taxed at slab rate (assumed 30% here). Confirm with your CA.</p>
    </div>
  );
}

// ── DOWN-ROUND / ANTI-DILUTION IMPACT ───────────────────────────────────────────
function DownRoundImpact({ lastPreMoney }: { lastPreMoney: number }) {
  const [lastPost, setLastPost] = useState(() => String(Math.round((lastPreMoney || 80_000_000) * 1.2)));
  const [investorPctPrev, setInvestorPctPrev] = useState(25);     // prior-round investor ownership
  const [newPre, setNewPre] = useState(() => String(Math.round((lastPreMoney || 80_000_000) * 0.6)));
  const [newRaise, setNewRaise] = useState("15000000");
  const [protection, setProtection] = useState<"none" | "weighted" | "ratchet">("weighted");

  const prevPost = parseFloat(lastPost) || 0;
  const pre = parseFloat(newPre) || 0;
  const raise = parseFloat(newRaise) || 0;
  const newPost = pre + raise;
  const isDown = pre < prevPost;
  const drop = prevPost > 0 ? (1 - pre / prevPost) * 100 : 0;
  const newInvestorPct = newPost > 0 ? (raise / newPost) * 100 : 0;

  // Old investor dilution under each anti-dilution regime (relative effect)
  const prevOwn = investorPctPrev / 100;
  // Naive dilution: old % shrinks by the new investor%
  const naive = prevOwn * (1 - newInvestorPct / 100) * 100;
  // Weighted-average softens the drop ~half-way back toward prior %; full-ratchet restores most of it
  const protectedPct =
    protection === "none" ? naive
      : protection === "weighted" ? naive + (investorPctPrev - naive) * 0.5
      : investorPctPrev * 0.95; // ratchet: near-fully reset
  const extraToOldInvestor = Math.max(0, protectedPct - naive);
  const founderShare = Math.max(0, 100 - protectedPct - newInvestorPct);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><TrendingDown size={14} className="text-red-400" /> Down-Round &amp; Anti-Dilution Impact</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">If the next round prices below the last, anti-dilution clauses re-issue shares to earlier investors — at the founders' expense. Compare full-ratchet vs broad weighted-average.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Last-round post-money (₹)</label>
          <input type="number" min={0} value={lastPost} onChange={e => setLastPost(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Prior investor ownership (%)</label>
          <input type="number" min={0} max={100} value={investorPctPrev} onChange={e => setInvestorPctPrev(Number(e.target.value))} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">New-round pre-money (₹)</label>
          <input type="number" min={0} value={newPre} onChange={e => setNewPre(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">New round size (₹)</label>
          <input type="number" min={0} value={newRaise} onChange={e => setNewRaise(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="flex gap-2">
        {([["none", "No protection"], ["weighted", "Weighted-average"], ["ratchet", "Full-ratchet"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setProtection(k)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${protection === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div className={`rounded-lg border p-3 text-xs font-medium ${isDown ? "bg-red-950/20 border-red-800/40 text-red-400" : "bg-green-950/20 border-green-800/40 text-green-400"}`}>
        {isDown ? `Down round — pricing ${drop.toFixed(0)}% below the last post-money. Anti-dilution kicks in.` : "Up round — anti-dilution protection does not trigger."}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "New investor stake", value: `${newInvestorPct.toFixed(1)}%`, color: "text-[var(--color-primary)]" },
          { label: "Old investor (no protection)", value: `${naive.toFixed(1)}%`, color: "text-[var(--color-muted)]" },
          { label: "Old investor (after clause)", value: `${protectedPct.toFixed(1)}%`, color: "text-yellow-400" },
          { label: "Founder / common left", value: `${founderShare.toFixed(1)}%`, color: founderShare < 40 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">
        {isDown
          ? `Anti-dilution claws back ~${extraToOldInvestor.toFixed(1)} extra points to the old investor, taken from founders. Full-ratchet is punitive — broad weighted-average is the founder-friendly market norm.`
          : "Negotiate broad weighted-average (not full-ratchet) up-front so a future down round doesn't wipe you out."}
      </p>
    </div>
  );
}

// ── INVESTOR MOIC / IRR BACKSOLVE ───────────────────────────────────────────────
function InvestorMoic({ preMoney, raiseAmount }: { preMoney: number; raiseAmount: number }) {
  const [invest, setInvest] = useState(() => String(Math.round(raiseAmount || 10_000_000)));
  const [postInput, setPostInput] = useState(() => String(Math.round((preMoney || 50_000_000) + (raiseAmount || 10_000_000))));
  const [exitValue, setExitValue] = useState(() => String(Math.round(((preMoney || 50_000_000) + (raiseAmount || 10_000_000)) * 6)));
  const [years, setYears] = useState(5);
  const [futureDilution, setFutureDilution] = useState(30); // % stake lost to later rounds

  const inv = parseFloat(invest) || 0;
  const post = parseFloat(postInput) || 0;
  const exit = parseFloat(exitValue) || 0;

  const entryPct = post > 0 ? (inv / post) * 100 : 0;
  const exitPct = entryPct * (1 - futureDilution / 100);
  const exitProceeds = exit * (exitPct / 100);
  const moic = inv > 0 ? exitProceeds / inv : 0;
  const irr = inv > 0 && years > 0 && moic > 0 ? (Math.pow(moic, 1 / years) - 1) * 100 : 0;
  const paybackYears = moic > 0 && years > 0 ? years / moic : 0; // simplistic value-doubling proxy

  const moicTone = moic >= 3 ? "text-green-400" : moic >= 1 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Investor MOIC / IRR</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">What this round returns the investor — multiple-on-invested-capital and annualised IRR at exit, after future-round dilution erodes their stake. The lens your investor uses.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Amount invested (₹)</label>
          <input type="number" min={0} value={invest} onChange={e => setInvest(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Post-money this round (₹)</label>
          <input type="number" min={0} value={postInput} onChange={e => setPostInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Exit / sale value (₹)</label>
          <input type="number" min={0} value={exitValue} onChange={e => setExitValue(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Years to exit</span><strong>{years}y</strong></div>
          <input type="range" min={1} max={12} step={1} value={years} onChange={e => setYears(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Dilution from later rounds</span><strong>{futureDilution}%</strong></div>
          <input type="range" min={0} max={70} step={5} value={futureDilution} onChange={e => setFutureDilution(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Entry stake", value: `${entryPct.toFixed(1)}%`, color: "text-[var(--color-text)]" },
          { label: "Stake at exit", value: `${exitPct.toFixed(1)}%`, color: "text-[var(--color-muted)]" },
          { label: "MOIC", value: `${moic.toFixed(2)}x`, color: moicTone },
          { label: "Gross IRR", value: `${irr.toFixed(0)}%`, color: irr >= 25 ? "text-green-400" : "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">
        Exit proceeds to the investor: <strong className="tabular-nums">{formatCurrency(Math.round(exitProceeds))}</strong> (~{paybackYears > 0 && isFinite(paybackYears) ? `${paybackYears.toFixed(1)}y` : "—"} to recover cost at this growth rate). VCs typically want a fund-returning 3x+ at ~25%+ IRR; show them how this entry price gets there.
      </p>
    </div>
  );
}

// ── EV → EQUITY BRIDGE ──────────────────────────────────────────────────────────
function EvEquityBridge({ enterpriseValue, cash }: { enterpriseValue: number; cash: number }) {
  const [evInput, setEvInput] = useState(() => String(Math.max(0, Math.round(enterpriseValue))));
  const [cashInput, setCashInput] = useState(() => String(Math.max(0, Math.round(cash))));
  const [debtInput, setDebtInput] = useState("0");
  const [minorityInput, setMinorityInput] = useState("0");

  const ev = parseFloat(evInput) || 0;
  const cashOnHand = parseFloat(cashInput) || 0;
  const debt = parseFloat(debtInput) || 0;
  const minority = parseFloat(minorityInput) || 0;

  const netDebt = debt - cashOnHand;
  const equityValue = ev - netDebt - minority;

  const steps = [
    { name: "Enterprise value", value: ev, sign: "+", color: "text-[var(--color-text)]" },
    { name: "Less: total debt", value: -debt, sign: "−", color: "text-red-400" },
    { name: "Plus: cash & equivalents", value: cashOnHand, sign: "+", color: "text-green-400" },
    { name: "Less: minority interest", value: -minority, sign: "−", color: "text-red-400" },
  ] as const;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><GitBranch size={14} className="text-[var(--color-primary)]" /> EV → Equity Value Bridge</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">DCF and multiples give enterprise value; founders care about equity value. Net out debt, add back cash, and subtract minority interests to bridge the two.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Enterprise value (₹)</label>
          <input type="number" min={0} value={evInput} onChange={e => setEvInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Total debt (₹)</label>
          <input type="number" min={0} value={debtInput} onChange={e => setDebtInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Cash & equivalents (₹)</label>
          <input type="number" min={0} value={cashInput} onChange={e => setCashInput(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Minority interest (₹)</label>
          <input type="number" min={0} value={minorityInput} onChange={e => setMinorityInput(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="space-y-1">
        {steps.map(s => (
          <div key={s.name} className="flex items-center justify-between text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
            <span className="font-medium">{s.name}</span>
            <span className={`tabular-nums font-semibold ${s.color}`}>{s.sign} {formatCurrency(Math.abs(Math.round(s.value)))}</span>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary)]">Equity value to shareholders</p>
          <p className="text-[10px] text-[var(--color-muted)]">Net {netDebt >= 0 ? "debt" : "cash"} position {formatCurrency(Math.abs(Math.round(netDebt)))}</p>
        </div>
        <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(equityValue))}</p>
      </div>
    </div>
  );
}

// ── ARR-MULTIPLE SAAS VALUATION ─────────────────────────────────────────────────
function ArrMultiple({ annualRevenue, growthPct }: { annualRevenue: number; growthPct: number }) {
  const [arrInput, setArrInput] = useState(() => (annualRevenue > 0 ? String(Math.round(annualRevenue)) : ""));
  const [grossMargin, setGrossMargin] = useState(75);
  const [nrr, setNrr] = useState(110);            // net revenue retention %
  const [grossGrowth, setGrossGrowth] = useState(() => Math.round(Math.max(0, growthPct)));

  const arr = parseFloat(arrInput) || 0;

  // Base SaaS multiple anchored at 6x, flexed by growth, retention and margin quality.
  const baseMultiple = 6;
  const growthAdj = (grossGrowth - 30) / 30 * 2;       // ±2x per 30pts off a 30% baseline
  const nrrAdj = (nrr - 100) / 10 * 0.6;               // 0.6x per 10pts of NRR over 100
  const marginAdj = (grossMargin - 70) / 10 * 0.4;     // 0.4x per 10pts of margin over 70
  const multiple = Math.max(0.5, baseMultiple + growthAdj + nrrAdj + marginAdj);
  const valuation = arr * multiple;

  const tiers = [
    { name: "Conservative", m: Math.max(0.5, multiple * 0.75), fill: "#64748b" },
    { name: "Base", m: multiple, fill: "#8b5cf6" },
    { name: "Premium", m: multiple * 1.25, fill: "#22c55e" },
  ];
  const bars = tiers.map(t => ({ name: `${t.name} (${t.m.toFixed(1)}x)`, value: Math.round(arr * t.m), fill: t.fill }));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><InfinityIcon size={14} className="text-purple-400" /> ARR-Multiple Valuation</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Forward ARR × a quality-adjusted multiple — the dominant lens for recurring-revenue SaaS. Growth, net retention and gross margin pull the multiple up or down from a 6x anchor.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Annual recurring revenue (₹)</label>
          <input type="number" min={0} value={arrInput} onChange={e => setArrInput(e.target.value)} placeholder="e.g. 60000000" className={INP} />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">YoY growth</span><strong>{grossGrowth}%</strong></div>
          <input type="range" min={0} max={150} step={5} value={grossGrowth} onChange={e => setGrossGrowth(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Net retention (NRR)</span><strong>{nrr}%</strong></div>
          <input type="range" min={70} max={150} step={1} value={nrr} onChange={e => setNrr(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Gross margin</span><strong>{grossMargin}%</strong></div>
          <input type="range" min={30} max={95} step={1} value={grossMargin} onChange={e => setGrossMargin(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      {arr > 0 && (
        <>
          <div className="bg-purple-950/20 border border-purple-800/40 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-300">ARR-multiple valuation</p>
              <p className="text-[10px] text-[var(--color-muted)]">Quality-adjusted multiple {multiple.toFixed(1)}x (anchor 6.0x)</p>
            </div>
            <p className="text-xl font-bold tabular-nums text-purple-300">{formatCurrency(Math.round(valuation))}</p>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={bars} layout="vertical" barCategoryGap="28%">
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), "Valuation"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>{bars.map((b, i) => <Cell key={i} fill={b.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Public SaaS multiples compressed sharply post-2022 — private rounds now skew toward profitable-growth (Rule-of-40) names. Treat above 10x as exceptional.</p>
    </div>
  );
}

// ── DISCOUNTED-PAYBACK PERIOD ───────────────────────────────────────────────────
function DiscountedPayback({ baseAnnualFcf, growthPct, discountPct }: { baseAnnualFcf: number; growthPct: number; discountPct: number }) {
  const [investInput, setInvestInput] = useState(() => String(Math.max(0, Math.round(baseAnnualFcf * 2))));
  const [rate, setRate] = useState(() => Math.round(Math.max(1, discountPct)));
  const [horizon, setHorizon] = useState(8);

  const invest = parseFloat(investInput) || 0;

  const rows = useMemo(() => {
    const g = growthPct / 100;
    const d = rate / 100;
    let cumDisc = 0;
    let cumUndisc = 0;
    const out: { year: number; cf: number; pv: number; cumPv: number; cumCf: number }[] = [];
    for (let y = 1; y <= horizon; y++) {
      const cf = baseAnnualFcf * Math.pow(1 + g, y - 1);
      const pv = cf / Math.pow(1 + d, y);
      cumDisc += pv;
      cumUndisc += cf;
      out.push({ year: y, cf, pv, cumPv: cumDisc, cumCf: cumUndisc });
    }
    return out;
  }, [baseAnnualFcf, growthPct, rate, horizon]);

  const findPayback = (key: "cumPv" | "cumCf") => {
    let prev = 0;
    for (const r of rows) {
      const cum = r[key];
      if (cum >= invest) {
        const inYearFlow = cum - prev;
        const frac = inYearFlow > 0 ? (invest - prev) / inYearFlow : 0;
        return r.year - 1 + frac;
      }
      prev = cum;
    }
    return Infinity;
  };

  const discPayback = invest > 0 ? findPayback("cumPv") : 0;
  const simplePayback = invest > 0 ? findPayback("cumCf") : 0;
  const recovered = isFinite(discPayback);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> Discounted-Payback Period</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">How many years of discounted cash flow it takes to recover an investment — a risk lens DCF's single NPV hides. Uses your live FCF base, growth and discount rate.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Up-front investment (₹)</label>
          <input type="number" min={0} value={investInput} onChange={e => setInvestInput(e.target.value)} className={INP} />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Discount rate</span><strong>{rate}%</strong></div>
          <input type="range" min={1} max={40} step={1} value={rate} onChange={e => setRate(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Horizon</span><strong>{horizon}y</strong></div>
          <input type="range" min={3} max={15} step={1} value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Discounted payback", value: recovered ? `${discPayback.toFixed(1)} yrs` : `> ${horizon} yrs`, color: recovered ? "text-[var(--color-primary)]" : "text-red-400" },
          { label: "Simple payback", value: isFinite(simplePayback) ? `${simplePayback.toFixed(1)} yrs` : `> ${horizon} yrs`, color: "text-[var(--color-muted)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)]">
            <tr>{["Year", "Cash flow", "PV @ rate", "Cumulative PV"].map(h =>
              <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(r => {
              const crossed = r.cumPv >= invest;
              return (
                <tr key={r.year} className={crossed ? "bg-[var(--color-primary)]/5" : ""}>
                  <td className="px-3 py-2">Year {r.year}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(Math.round(r.cf))}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.pv))}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{formatCurrency(Math.round(r.cumPv))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Discounted payback is always longer than simple payback because later rupees are worth less. If it exceeds your horizon, the investment never fully recovers on a present-value basis.</p>
    </div>
  );
}
