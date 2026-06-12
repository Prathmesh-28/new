import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { computeFinancialSnapshot, dcfValuation, dilution } from "@/lib/finance";
import { formatAmount } from "@/lib/utils";
import { Gem, Rocket, ArrowRight, Users } from "lucide-react";
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
    </div>
  );
}
