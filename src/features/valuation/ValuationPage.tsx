import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { computeFinancialSnapshot, dcfValuation, dilution } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { Gem, Rocket, ArrowRight, Users, Building2, Sprout, SlidersHorizontal, FileSpreadsheet } from "lucide-react";
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
