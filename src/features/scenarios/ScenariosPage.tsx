import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Sliders, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Zap, Copy, Tag, Users, PieChart, Target, ShieldAlert, Scissors, Rocket, Factory, Clock, Megaphone, Building2 } from "lucide-react";
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { runForecast } from "@/lib/forecastEngine";
import type { Scenario } from "@/data/types";

const HORIZON = 180; // 6-month planning window, driven by the real Monte-Carlo engine

type ScenarioEvent = {
  id: string;
  label: string;
  type: "revenue" | "expense" | "hire" | "loan" | "deal";
  monthlyImpact: number;
  startMonth: number;
  durationMonths: number;
};

const PRESETS: { label: string; icon: string; events: Omit<ScenarioEvent, "id">[] }[] = [
  {
    label: "Hire 2 people",
    icon: "👥",
    events: [{ label: "2 new salaries", type: "expense", monthlyImpact: -80000, startMonth: 1, durationMonths: 12 }],
  },
  {
    label: "Land a ₹20L deal",
    icon: "🤝",
    events: [
      { label: "₹20L project", type: "deal", monthlyImpact: 200000, startMonth: 1, durationMonths: 2 },
      { label: "Project expenses", type: "expense", monthlyImpact: -40000, startMonth: 1, durationMonths: 2 },
    ],
  },
  {
    label: "Take a ₹10L loan",
    icon: "🏦",
    events: [
      { label: "Loan disbursement", type: "loan", monthlyImpact: 1000000, startMonth: 0, durationMonths: 1 },
      { label: "EMI repayment", type: "expense", monthlyImpact: -22000, startMonth: 1, durationMonths: 48 },
    ],
  },
  {
    label: "Lose top client",
    icon: "⚠️",
    events: [{ label: "Lost client revenue", type: "revenue", monthlyImpact: -150000, startMonth: 1, durationMonths: 12 }],
  },
];

function genId() { return Math.random().toString(36).slice(2, 9); }

const TYPE_COLORS: Record<string, string> = {
  revenue: "text-green-400",
  expense: "text-red-400",
  hire:    "text-orange-400",
  loan:    "text-blue-400",
  deal:    "text-purple-400",
};

type ScenarioTab = "planner" | "price-sim" | "headcount" | "dilution" | "breakeven" | "revenue-shock" | "cost-cut" | "product-launch" | "supplier-hike" | "payment-terms" | "marketing-roi" | "capex";

export default function ScenariosPage() {
  const { store } = useApp();
  const navigate  = useNavigate();
  const [scenTab, setScenTab] = useState<ScenarioTab>("planner");
  const [events, setEvents] = useState<ScenarioEvent[]>([]);
  const [newLabel, setNewLabel]  = useState("");
  const [newType, setNewType]    = useState<ScenarioEvent["type"]>("revenue");
  const [newImpact, setNewImpact] = useState("");
  const [newStart, setNewStart]  = useState(1);
  const [newDur, setNewDur]      = useState(6);
  const [showForm, setShowForm]  = useState(false);

  const addEvent = () => {
    const impact = parseFloat(newImpact);
    if (!newLabel || isNaN(impact)) return;
    const signed = ["expense", "hire"].includes(newType) ? -Math.abs(impact) : Math.abs(impact);
    setEvents(ev => [...ev, { id: genId(), label: newLabel, type: newType, monthlyImpact: signed, startMonth: newStart, durationMonths: newDur }]);
    setNewLabel(""); setNewImpact(""); setShowForm(false);
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setEvents(prev => [
      ...prev,
      ...preset.events.map(e => ({ ...e, id: genId() })),
    ]);
  };

  const removeEvent = (id: string) => setEvents(ev => ev.filter(e => e.id !== id));

  // Map the planner's events to the forecast engine's Scenario format (custom
  // recurring monthly impact), then run the REAL Monte-Carlo engine for both the
  // base and the with-scenario projection — revenue, recurring series, invoice
  // collections and volatility all included, instead of the old straight-line.
  const scenarios = useMemo<Scenario[]>(() => events.map(e => ({
    id: e.id,
    name: e.label,
    type: "custom",
    active: true,
    createdAt: new Date(0).toISOString(),
    params: {
      monthlyAmount: e.monthlyImpact,
      startDate: addDays(new Date(), e.startMonth * 30).toISOString().split("T")[0],
      durationDays: e.durationMonths * 30,
    },
  })), [events]);

  // Pin the SAME seed on both runs so base vs scenario differ only by the
  // scenario delta — not by RNG noise (runForecast otherwise derives its seed
  // from the config, which changes when scenarios are present).
  const SEED = 1337;
  const base = useMemo(() => runForecast(store, { horizonDays: HORIZON, numSims: 600, seed: SEED }), [store]);
  const scen = useMemo(() => runForecast(store, { horizonDays: HORIZON, numSims: 600, seed: SEED, scenarios }), [store, scenarios]);

  const baseRunway = base.risk.runwayDist.p50;
  const scenRunway = scen.risk.runwayDist.p50;

  // Sample ~fortnightly for a readable chart; base p50 vs scenario p50 with the
  // scenario's P10 downside line.
  const scenarioData = useMemo(() => {
    const out: { month: string; base: number; scenario: number; low: number }[] = [];
    const pts = base.points;
    for (let i = 0; i < pts.length; i += 15) {
      out.push({
        month: format(new Date(pts[i].date), "d MMM"),
        base: Math.round(base.points[i].p50 / 100000),
        scenario: Math.round(scen.points[i].p50 / 100000),
        low: Math.round(scen.points[i].p10 / 100000),
      });
    }
    return out;
  }, [base, scen]);

  const finalBase     = base.points[base.points.length - 1]?.p50 ?? 0;
  const finalScenario = scen.points[scen.points.length - 1]?.p50 ?? 0;
  const scenDiff      = finalScenario - finalBase;

  const breakeven = scen.points.find(p => p.p50 <= 0);
  const scenarioHealthy = finalScenario > 0 && !breakeven;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sliders size={20} className="text-[var(--color-primary)]" />
          Scenario Planner
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Model "what if" situations — hiring, new deals, loans, lost clients — and see the cash impact over the next 6 months, run through the same Monte-Carlo engine as your forecast.
        </p>
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([
          ["planner", "Cash Planner", Sliders],
          ["price-sim", "Price-Change Profit", Tag],
          ["headcount", "Headcount / Hiring", Users],
          ["dilution", "Funding Dilution", PieChart],
          ["breakeven", "Break-even", Target],
          ["revenue-shock", "Revenue Shock", ShieldAlert],
          ["cost-cut", "Cost-Cut Plan", Scissors],
          ["product-launch", "Product Launch", Rocket],
          ["supplier-hike", "Supplier Price Rise", Factory],
          ["payment-terms", "Payment Terms", Clock],
          ["marketing-roi", "Marketing ROI", Megaphone],
          ["capex", "Buy vs Lease", Building2],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setScenTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${scenTab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {scenTab === "price-sim" && <PriceChangeSimulator />}
      {scenTab === "headcount" && <HeadcountScenario />}
      {scenTab === "dilution" && <DilutionScenario />}
      {scenTab === "breakeven" && <BreakevenAnalyzer />}
      {scenTab === "revenue-shock" && <RevenueShockStressTest />}
      {scenTab === "cost-cut" && <CostCutSimulator />}
      {scenTab === "product-launch" && <ProductLaunchModel />}
      {scenTab === "supplier-hike" && <SupplierPriceRiseImpact />}
      {scenTab === "payment-terms" && <PaymentTermsCashImpact />}
      {scenTab === "marketing-roi" && <MarketingRoiScenario />}
      {scenTab === "capex" && <CapexBuyVsLease />}

      {scenTab === "planner" && <>
      {/* Presets */}
      <div>
        <p className="text-xs text-[var(--color-muted)] font-medium mb-2">Quick scenarios</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/50 hover:bg-white/2 transition-all font-medium"
            >
              <span>{p.icon}</span> {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 transition-all"
          >
            <Plus size={12} /> Custom event
          </button>
        </div>
      </div>

      {/* Custom event form */}
      {showForm && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Add custom event</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Event name"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as ScenarioEvent["type"])}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="revenue">Revenue +</option>
              <option value="expense">Expense −</option>
              <option value="hire">Hire (salary) −</option>
              <option value="deal">One-time deal</option>
              <option value="loan">Loan</option>
            </select>
            <input
              value={newImpact}
              onChange={e => setNewImpact(e.target.value)}
              placeholder="Monthly ₹ impact"
              type="number"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Starts month</span>
              <input type="number" min={0} max={11} value={newStart} onChange={e => setNewStart(parseInt(e.target.value) || 0)}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Duration (mo)</span>
              <input type="number" min={1} max={12} value={newDur} onChange={e => setNewDur(parseInt(e.target.value) || 1)}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <button
              onClick={addEvent}
              className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90 transition-all"
            >
              Add to scenario
            </button>
          </div>
        </div>
      )}

      {/* Active events */}
      {events.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Scenario events ({events.length})</h3>
            <button onClick={() => setEvents([])} className="text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors">Clear all</button>
          </div>
          <div className="space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                <span className={`text-xs font-bold w-16 shrink-0 ${TYPE_COLORS[ev.type]}`}>{ev.type}</span>
                <span className="text-sm font-medium flex-1">{ev.label}</span>
                <span className={`text-xs font-semibold tabular-nums ${ev.monthlyImpact >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {ev.monthlyImpact >= 0 ? "+" : ""}{formatCurrency(ev.monthlyImpact)}/mo
                </span>
                <span className="text-xs text-[var(--color-muted)]">mo {ev.startMonth}–{ev.startMonth + ev.durationMonths}</span>
                <button onClick={() => removeEvent(ev.id)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">6-month cash projection</h2>
            <p className="text-xs text-[var(--color-muted)]">Base vs scenario (median path) · scenario downside dashed · ₹ Lakhs</p>
          </div>
          {events.length > 0 && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
              scenarioHealthy
                ? "bg-green-950/30 text-green-400 border-green-800/30"
                : "bg-red-950/30 text-red-400 border-red-800/30"
            }`}>
              {scenarioHealthy ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
              {scenarioHealthy ? "Scenario viable" : "Cash crunch risk"}
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={scenarioData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#7D8590" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#7D8590" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradScen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1A6B55" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1A6B55" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }}
              formatter={(v: number, name: string) => [`₹${v}L`, name === "base" ? "Base" : "Scenario"]}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
            <Area type="monotone" dataKey="base"     stroke="#7D8590" strokeWidth={1.5} fill="url(#gradBase)" strokeDasharray="4 2" name="base" />
            {events.length > 0 && (
              <Area type="monotone" dataKey="scenario" stroke="#1A6B55" strokeWidth={2}   fill="url(#gradScen)" name="scenario" />
            )}
            {events.length > 0 && (
              <Line type="monotone" dataKey="low" stroke="#ef4444" strokeWidth={1} strokeDasharray="2 2" dot={false} name="scenario downside (P10)" />
            )}
          </AreaChart>
        </ResponsiveContainer>

        {events.length === 0 && (
          <p className="text-center text-xs text-[var(--color-muted)] mt-2">Add scenario events above to see the impact on your cash trajectory</p>
        )}
      </div>

      {/* Summary cards */}
      {events.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Base runway",
              value: baseRunway >= HORIZON ? `${HORIZON}+d` : `${baseRunway}d`,
              sub: "median (P50)",
              icon: TrendingUp,
              color: "text-[var(--color-muted)]",
            },
            {
              label: "Scenario runway",
              value: scenRunway >= HORIZON ? `${HORIZON}+d` : `${Math.max(0, scenRunway)}d`,
              sub: "median, with events",
              icon: Sliders,
              color: scenRunway >= baseRunway ? "text-green-400" : "text-red-400",
            },
            {
              label: "6-month base",
              value: formatCurrency(Math.max(0, finalBase)),
              sub: "ending cash (P50)",
              icon: TrendingDown,
              color: "text-[var(--color-muted)]",
            },
            {
              label: "Scenario difference",
              value: `${scenDiff >= 0 ? "+" : ""}${formatCurrency(Math.abs(scenDiff))}`,
              sub: scenDiff >= 0 ? "better outcome" : "worse outcome",
              icon: scenDiff >= 0 ? TrendingUp : AlertTriangle,
              color: scenDiff >= 0 ? "text-green-400" : "text-red-400",
            },
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-[var(--color-muted)] font-medium">{label}</p>
                <Icon size={13} className={color} />
              </div>
              <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Insight */}
      {events.length > 0 && !scenarioHealthy && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-lg px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">This scenario creates a cash crunch</p>
            <p className="text-xs text-red-400/70 mt-0.5">
              {breakeven
                ? `Cash (median path) runs out around ${format(new Date(breakeven.date), "d MMM")}. Consider a working capital line to bridge the gap.`
                : "Your ending cash goes negative. Reduce expenses or secure credit before committing to this plan."}
            </p>
            <button
              onClick={() => navigate("/credit")}
              className="mt-2 text-xs text-red-300 hover:text-red-200 flex items-center gap-1 transition-colors"
            >
              See credit options <Zap size={10} />
            </button>
          </div>
        </div>
      )}

      {events.length > 0 && scenarioHealthy && (
        <div className="bg-green-950/20 border border-green-800/30 rounded-lg px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-300">Scenario looks healthy</p>
              <p className="text-xs text-green-400/70 mt-0.5">You maintain positive cash through all 12 months. This plan is financially viable.</p>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`Headroom scenario: ${events.map(e => e.label).join(", ")} — 12mo delta: ${scenDiff >= 0 ? "+" : ""}${formatCurrency(Math.abs(scenDiff))}`).catch(() => {});
              toast.success("Scenario summary copied");
            }}
            className="flex items-center gap-1.5 text-xs bg-green-900/40 text-green-300 border border-green-800/30 px-3 py-1.5 rounded-lg hover:bg-green-900/60 transition-colors shrink-0"
          >
            <Copy size={12} /> Share summary
          </button>
        </div>
      )}
      </>}
    </div>
  );
}

// Shared input/card class strings (match existing Headroom style)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4";

// ── #90 PRICE-CHANGE PROFIT SIMULATOR ───────────────────────────────────────
// Models the margin/volume trade-off of a price move with a price-elasticity
// assumption, then compares profit before vs after.
function PriceChangeSimulator() {
  const [price, setPrice]       = useState("1000");
  const [cost, setCost]         = useState("600");
  const [units, setUnits]       = useState("500");
  const [changePct, setChange]  = useState("10");
  const [elasticity, setElast]  = useState("1.2"); // |% volume change per % price change|

  const p   = parseFloat(price) || 0;
  const c   = parseFloat(cost) || 0;
  const q   = parseFloat(units) || 0;
  const chg = (parseFloat(changePct) || 0) / 100;
  const e   = parseFloat(elasticity) || 0;

  const newPrice  = p * (1 + chg);
  // Volume reacts inversely to a price rise (and rises on a cut).
  const volFactor = Math.max(0, 1 - chg * e);
  const newUnits  = q * volFactor;

  const oldMargin  = p - c;
  const newMargin  = newPrice - c;
  const oldProfit  = oldMargin * q;
  const newProfit  = newMargin * newUnits;
  const profitDiff = newProfit - oldProfit;
  const oldRevenue = p * q;
  const newRevenue = newPrice * newUnits;
  const oldMarginPct = p > 0 ? (oldMargin / p) * 100 : 0;
  const newMarginPct = newPrice > 0 ? (newMargin / newPrice) * 100 : 0;
  const better = profitDiff >= 0;
  const fc = formatCurrency;

  const rows = [
    { label: "Selling price / unit", old: fc(p),         nw: fc(Math.round(newPrice)) },
    { label: "Contribution margin",  old: fc(oldMargin), nw: fc(Math.round(newMargin)) },
    { label: "Margin %",             old: `${oldMarginPct.toFixed(1)}%`, nw: `${newMarginPct.toFixed(1)}%` },
    { label: "Units sold",           old: Math.round(q).toString(), nw: Math.round(newUnits).toString() },
    { label: "Revenue",              old: fc(Math.round(oldRevenue)), nw: fc(Math.round(newRevenue)) },
    { label: "Profit (contribution)", old: fc(Math.round(oldProfit)), nw: fc(Math.round(newProfit)), bold: true },
  ];

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Tag size={14} className="text-[var(--color-primary)]" /> Price-Change Profit Simulator</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Price / unit (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cost / unit (₹)</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Current units</label><input type="number" value={units} onChange={e => setUnits(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Price change %</label><input type="number" value={changePct} onChange={e => setChange(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Elasticity (|%vol/%price|)</label><input type="number" value={elasticity} onChange={e => setElast(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">A +10% price with elasticity 1.2 assumes volume drops ~12%. Elasticity 0 = volume unaffected.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Profit before", value: fc(Math.round(oldProfit)), color: "text-[var(--color-muted)]" },
          { label: "Profit after",  value: fc(Math.round(newProfit)), color: better ? "text-green-400" : "text-red-400" },
          { label: "Profit change", value: `${better ? "+" : "−"}${fc(Math.abs(Math.round(profitDiff)))}`, color: better ? "text-green-400" : "text-red-400" },
          { label: "New volume",     value: `${Math.round(newUnits)} u (${(volFactor * 100).toFixed(0)}%)`, color: "text-[var(--color-text)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Before", "After"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.old}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.nw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${better ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${better ? "text-green-400" : "text-red-400"}`}>
          {better
            ? `✓ This price move lifts contribution profit by ${fc(Math.abs(Math.round(profitDiff)))} despite ${q > 0 ? `${Math.round(q - newUnits)} fewer units` : "volume shifts"}.`
            : `⚠ This price move cuts contribution profit by ${fc(Math.abs(Math.round(profitDiff)))} — the volume loss outweighs the higher margin.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Contribution profit = (price − unit cost) × units. Fixed costs are held constant. Elasticity is a simple linear assumption — validate against real demand data.</p>
    </div>
  );
}

// ── #91 HEADCOUNT / HIRING SCENARIO ─────────────────────────────────────────
// Adds a planned hire (or several) on top of live cash & burn and shows the
// runway impact.
function HeadcountScenario() {
  const { store } = useApp();
  const fc = formatCurrency;

  // Derive live monthly burn & cash from transactions (last 90 days annualised).
  const { cashOnHand, monthlyRevenue, monthlyCost } = useMemo(() => {
    const txns = store.transactions ?? [];
    const months = Math.max(txns.length / 30, 1);
    const rev  = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0) / months;
    const cost = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0) / months;
    const cash = txns.reduce((s, t) => s + t.amount, 0);
    return { cashOnHand: Math.max(0, Math.round(cash)), monthlyRevenue: Math.round(rev), monthlyCost: Math.round(cost) };
  }, [store.transactions]);

  const [cashInput, setCashInput] = useState("");
  const [hires, setHires]   = useState("2");
  const [salary, setSalary] = useState("60000"); // avg monthly CTC per hire
  const [loadPct, setLoad]  = useState("15");     // employer load (PF/ESI/overhead) %
  const [extraRev, setExtra] = useState("0");     // expected added monthly revenue from hires

  const cash    = parseFloat(cashInput) || cashOnHand;
  const n       = parseFloat(hires) || 0;
  const sal     = parseFloat(salary) || 0;
  const load    = (parseFloat(loadPct) || 0) / 100;
  const addRev  = parseFloat(extraRev) || 0;

  const fullyLoadedPerHire = sal * (1 + load);
  const newMonthlyCost     = fullyLoadedPerHire * n;
  const baseBurn   = monthlyCost - monthlyRevenue;                       // +ve = burning
  const scenBurn   = (monthlyCost + newMonthlyCost) - (monthlyRevenue + addRev);

  const runway = (burn: number) => burn <= 0 ? Infinity : cash / burn;
  const baseRunway = runway(baseBurn);
  const scenRunway = runway(scenBurn);
  const runwayLabel = (m: number) => m === Infinity ? "∞ (cash-positive)" : `${m.toFixed(1)} months`;
  const runwayDelta = (baseRunway === Infinity || scenRunway === Infinity)
    ? null
    : scenRunway - baseRunway;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Headcount / Hiring Scenario</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash on hand (₹)</label><input type="number" value={cashInput} onChange={e => setCashInput(e.target.value)} placeholder={`Auto: ${fc(cashOnHand)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1"># of hires</label><input type="number" value={hires} onChange={e => setHires(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Avg salary / mo (₹)</label><input type="number" value={salary} onChange={e => setSalary(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Employer load %</label><input type="number" value={loadPct} onChange={e => setLoad(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Added revenue / mo (₹)</label><input type="number" value={extraRev} onChange={e => setExtra(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Live monthly revenue ≈ {fc(monthlyRevenue)}, costs ≈ {fc(monthlyCost)} (from your transactions). Fully-loaded cost per hire = salary × (1 + load%).</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Added monthly cost", value: fc(Math.round(newMonthlyCost)), color: "text-red-400" },
          { label: "Burn before",        value: baseBurn <= 0 ? "cash-positive" : `${fc(Math.round(baseBurn))}/mo`, color: baseBurn <= 0 ? "text-green-400" : "text-[var(--color-muted)]" },
          { label: "Burn after",         value: scenBurn <= 0 ? "cash-positive" : `${fc(Math.round(scenBurn))}/mo`, color: scenBurn <= 0 ? "text-green-400" : "text-orange-400" },
          { label: "Runway after",       value: runwayLabel(scenRunway), color: scenRunway === Infinity ? "text-green-400" : scenRunway < 6 ? "text-red-400" : "text-[var(--color-text)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Before hiring", "After hiring"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Monthly revenue", b: fc(monthlyRevenue), a: fc(Math.round(monthlyRevenue + addRev)) },
              { label: "Monthly cost",    b: fc(monthlyCost),    a: fc(Math.round(monthlyCost + newMonthlyCost)) },
              { label: "Net burn / mo",   b: baseBurn <= 0 ? "cash-positive" : fc(Math.round(baseBurn)), a: scenBurn <= 0 ? "cash-positive" : fc(Math.round(scenBurn)) },
              { label: "Runway",          b: runwayLabel(baseRunway), a: runwayLabel(scenRunway), bold: true },
            ].map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${scenBurn <= 0 ? "border-green-800/40 bg-green-950/20" : scenRunway < 6 ? "border-red-800/40 bg-red-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
        <p className={`text-sm font-bold ${scenBurn <= 0 ? "text-green-400" : scenRunway < 6 ? "text-red-400" : "text-orange-400"}`}>
          {scenBurn <= 0
            ? `✓ Even with ${n} hire(s) you stay cash-positive — this plan is fundable from operations.`
            : scenRunway < 6
              ? `⚠ Hiring ${n} drops runway to ${runwayLabel(scenRunway)} — below the 6-month safety line. Secure revenue or funding first.`
              : `Hiring ${n} costs ${fc(Math.round(newMonthlyCost))}/mo${runwayDelta !== null ? ` and shortens runway by ~${Math.abs(runwayDelta).toFixed(1)} months` : ""}.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Runway = cash on hand ÷ net monthly burn. Assumes hires start immediately at full cost. Ramp-up and severance are not modelled.</p>
    </div>
  );
}

// ── #92 FUNDING-ROUND DILUTION SCENARIO ─────────────────────────────────────
// Pre/post-money valuation, investor stake, founder dilution, plus an ESOP-pool
// top-up done pre-money (standard term-sheet mechanic).
function DilutionScenario() {
  const fc = formatCurrency;
  const [preMoney, setPre]   = useState("4");   // ₹ Cr
  const [raise, setRaise]    = useState("1");   // ₹ Cr
  const [esopPct, setEsop]   = useState("10");  // target post-round ESOP %
  const [founderPre, setFP]  = useState("100"); // founder ownership before round %

  const pre   = (parseFloat(preMoney) || 0) * 1e7;  // Cr → ₹
  const raised = (parseFloat(raise) || 0) * 1e7;
  const esop  = (parseFloat(esopPct) || 0) / 100;
  const fpre  = (parseFloat(founderPre) || 0) / 100;

  const post  = pre + raised;
  const investorPct = post > 0 ? raised / post : 0;
  const pricePerShare = post; // notional — work in % ownership

  // ESOP top-up is created from the pre-money (existing holders bear it),
  // so the new pool is esop% of post-money, funded out of the pre-money slice.
  const remainingPct = 1 - investorPct;            // existing holders + ESOP share post-round
  const esopFromExisting = Math.max(0, esop);       // target % of post cap table
  const founderPost = Math.max(0, remainingPct * fpre - esopFromExisting);
  const otherExisting = Math.max(0, remainingPct * (1 - fpre));
  const founderDilution = fpre - founderPost;

  const slices = [
    { label: "Founders",       pct: founderPost,      color: "text-green-400",  bg: "bg-green-400" },
    { label: "New investor",   pct: investorPct,      color: "text-blue-400",   bg: "bg-blue-400" },
    { label: "ESOP pool",      pct: esopFromExisting, color: "text-purple-400", bg: "bg-purple-400" },
    { label: "Other existing", pct: otherExisting,    color: "text-[var(--color-muted)]", bg: "bg-[var(--color-muted)]" },
  ];
  const total = slices.reduce((s, x) => s + x.pct, 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Funding-Round Dilution</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Pre-money (₹ Cr)</label><input type="number" value={preMoney} onChange={e => setPre(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Amount raised (₹ Cr)</label><input type="number" value={raise} onChange={e => setRaise(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Post-round ESOP %</label><input type="number" value={esopPct} onChange={e => setEsop(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Founder % before</label><input type="number" value={founderPre} onChange={e => setFP(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Post-money = pre-money + raise. ESOP top-up is created pre-money (standard term sheet), so it dilutes existing holders, not the new investor.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Post-money", value: `₹${(post / 1e7).toFixed(2)} Cr`, color: "text-[var(--color-primary)]" },
          { label: "Investor stake", value: `${(investorPct * 100).toFixed(1)}%`, color: "text-blue-400" },
          { label: "Founder after", value: `${(founderPost * 100).toFixed(1)}%`, color: "text-green-400" },
          { label: "Founder dilution", value: `−${(founderDilution * 100).toFixed(1)} pts`, color: "text-orange-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Post-round cap table</p>
        <div className="flex w-full h-3 rounded-full overflow-hidden bg-[var(--color-bg)]">
          {slices.map(s => (
            <div key={s.label} title={`${s.label}: ${(s.pct * 100).toFixed(1)}%`}
              className={`h-full ${s.bg}`} style={{ width: `${Math.max(0, s.pct * 100)}%` }} />
          ))}
        </div>
        <div className="space-y-1.5">
          {slices.map(s => (
            <div key={s.label} className="flex items-center justify-between text-sm">
              <span className={`font-medium ${s.color}`}>{s.label}</span>
              <span className="tabular-nums">{(s.pct * 100).toFixed(1)}%</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)] pt-1.5 border-t border-[var(--color-border)]">
            <span>Total</span><span className="tabular-nums">{(total * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">Single-round, single-class model in % ownership (price/share = post-money, {fc(Math.round(pricePerShare))} notional). Liquidation preferences, multiple classes and option exercise are not modelled — see Cap-Table tools for a full waterfall.</p>
    </div>
  );
}

// ── #93 BREAK-EVEN & MARGIN-OF-SAFETY ───────────────────────────────────────
// Units & revenue to break even from fixed costs and unit contribution, plus
// margin of safety vs current/expected sales.
function BreakevenAnalyzer() {
  const fc = formatCurrency;
  const [fixed, setFixed]     = useState("500000"); // monthly fixed cost
  const [price, setPrice]     = useState("1000");
  const [varCost, setVar]     = useState("600");
  const [actual, setActual]   = useState("700");    // current/expected units

  const F = parseFloat(fixed) || 0;
  const P = parseFloat(price) || 0;
  const V = parseFloat(varCost) || 0;
  const A = parseFloat(actual) || 0;

  const contribution    = P - V;
  const contributionPct = P > 0 ? contribution / P : 0;
  const beUnits   = contribution > 0 ? Math.ceil(F / contribution) : Infinity;
  const beRevenue = contribution > 0 ? F / contributionPct : Infinity;

  const actualRevenue = A * P;
  const profitAtActual = A * contribution - F;
  const mosUnits   = beUnits === Infinity ? 0 : A - beUnits;
  const mosRevenue = beRevenue === Infinity ? 0 : actualRevenue - beRevenue;
  const mosPct     = actualRevenue > 0 && beRevenue !== Infinity ? (mosRevenue / actualRevenue) * 100 : 0;
  const viable     = contribution > 0;
  const aboveBE    = viable && A >= beUnits;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Break-even & Margin of Safety</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Fixed cost / mo (₹)</label><input type="number" value={fixed} onChange={e => setFixed(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Price / unit (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Variable cost / unit (₹)</label><input type="number" value={varCost} onChange={e => setVar(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Actual / expected units</label><input type="number" value={actual} onChange={e => setActual(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Contribution / unit = price − variable cost = {fc(Math.round(contribution))} ({(contributionPct * 100).toFixed(1)}% of price).</p>
      </div>

      {!viable && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400">⚠ Variable cost ≥ price — every unit loses money, so there is no break-even point. Raise price or cut unit cost.</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Break-even units", value: beUnits === Infinity ? "—" : `${beUnits.toLocaleString("en-IN")} u`, color: "text-[var(--color-primary)]" },
          { label: "Break-even revenue", value: beRevenue === Infinity ? "—" : fc(Math.round(beRevenue)), color: "text-[var(--color-primary)]" },
          { label: "Margin of safety", value: beRevenue === Infinity ? "—" : `${mosPct.toFixed(1)}%`, color: mosPct >= 20 ? "text-green-400" : mosPct >= 0 ? "text-orange-400" : "text-red-400" },
          { label: "Profit at actual", value: fc(Math.round(profitAtActual)), color: profitAtActual >= 0 ? "text-green-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {viable && (
        <div className={`${CARD} p-0 overflow-x-auto`}>
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Units", "Revenue (₹)"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
            <tbody>
              {[
                { label: "Break-even", u: beUnits.toLocaleString("en-IN"), r: fc(Math.round(beRevenue)) },
                { label: "Actual / expected", u: A.toLocaleString("en-IN"), r: fc(Math.round(actualRevenue)) },
                { label: "Margin of safety", u: mosUnits.toLocaleString("en-IN"), r: fc(Math.round(mosRevenue)), bold: true },
              ].map(r => (
                <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                  <td className="px-4 py-2.5">{r.label}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.u}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viable && (
        <div className={`rounded-lg p-4 border ${aboveBE ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
          <p className={`text-sm font-bold ${aboveBE ? "text-green-400" : "text-red-400"}`}>
            {aboveBE
              ? `✓ You break even at ${beUnits.toLocaleString("en-IN")} units / ${fc(Math.round(beRevenue))}. At ${A.toLocaleString("en-IN")} units you clear break-even by ${mosPct.toFixed(1)}% — sales can fall ${mosUnits.toLocaleString("en-IN")} units before you hit a loss.`
              : `⚠ At ${A.toLocaleString("en-IN")} units you are ${(beUnits - A).toLocaleString("en-IN")} units below break-even (${fc(Math.round(beRevenue))} needed). You lose ${fc(Math.abs(Math.round(profitAtActual)))}/mo until you sell more.`}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Single-product CVP model. For multi-product break-even, run this per product line using its own price, variable cost and share of fixed costs.</p>
    </div>
  );
}

// Derive live monthly revenue / cost / cash from the ledger (same method the
// HeadcountScenario uses) so the shock & cut tools start from real numbers.
function useLiveMonthly() {
  const { store } = useApp();
  return useMemo(() => {
    const txns = store.transactions ?? [];
    const months = Math.max(txns.length / 30, 1);
    const rev  = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0) / months;
    const cost = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0) / months;
    const cash = txns.reduce((s, t) => s + t.amount, 0);
    return { cashOnHand: Math.max(0, Math.round(cash)), monthlyRevenue: Math.round(rev), monthlyCost: Math.round(cost) };
  }, [store.transactions]);
}

// ── #94 REVENUE-SHOCK / RECESSION STRESS TEST ───────────────────────────────
// Drops monthly revenue by a chosen %, models how much variable cost falls with
// it, then reports the survival sequence: new burn, runway, and the cost cut
// needed to stay above the safety line.
function RevenueShockStressTest() {
  const fc = formatCurrency;
  const live = useLiveMonthly();

  const [cashInput, setCash]   = useState("");
  const [revInput, setRev]     = useState("");
  const [costInput, setCost]   = useState("");
  const [dropPct, setDrop]     = useState("30");   // revenue shock %
  const [varPct, setVarPct]    = useState("40");   // share of cost that's variable (flexes with revenue)
  const [safetyMo, setSafety]  = useState("6");    // months of runway considered safe

  const cash = parseFloat(cashInput) || live.cashOnHand;
  const rev  = parseFloat(revInput)  || live.monthlyRevenue;
  const cost = parseFloat(costInput) || live.monthlyCost;
  const drop = Math.min(Math.max(parseFloat(dropPct) || 0, 0), 100) / 100;
  const varShare = Math.min(Math.max(parseFloat(varPct) || 0, 0), 100) / 100;
  const safety = parseFloat(safetyMo) || 0;

  const shockedRev  = rev * (1 - drop);
  const variableCost = cost * varShare;
  const fixedCost    = cost - variableCost;
  // Variable cost shrinks in proportion to the revenue fall.
  const shockedCost  = fixedCost + variableCost * (1 - drop);

  const baseBurn  = cost - rev;
  const shockBurn = shockedCost - shockedRev;
  const runway = (burn: number) => burn <= 0 ? Infinity : cash / burn;
  const baseRunway  = runway(baseBurn);
  const shockRunway = runway(shockBurn);
  const label = (m: number) => m === Infinity ? "∞ (cash-positive)" : `${m.toFixed(1)} mo`;

  // Cost cut needed to bring shocked runway back to the safety line.
  const maxAffordableCost = safety > 0 ? shockedRev + cash / safety : shockedRev;
  const cutNeeded = Math.max(0, shockedCost - maxAffordableCost);
  const survives  = shockRunway >= safety || shockBurn <= 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Revenue-Shock / Recession Stress Test</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash on hand (₹)</label><input type="number" value={cashInput} onChange={e => setCash(e.target.value)} placeholder={`Auto: ${fc(live.cashOnHand)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly revenue (₹)</label><input type="number" value={revInput} onChange={e => setRev(e.target.value)} placeholder={`Auto: ${fc(live.monthlyRevenue)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly cost (₹)</label><input type="number" value={costInput} onChange={e => setCost(e.target.value)} placeholder={`Auto: ${fc(live.monthlyCost)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Revenue drop %</label><input type="number" value={dropPct} onChange={e => setDrop(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Variable-cost share %</label><input type="number" value={varPct} onChange={e => setVarPct(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Safe runway (months)</label><input type="number" value={safetyMo} onChange={e => setSafety(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Variable cost (e.g. COGS, shipping) falls with revenue; fixed cost (rent, salaries) does not. A 30% drop with 40% variable share cuts cost by ~12%.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Revenue after shock", value: fc(Math.round(shockedRev)), color: "text-red-400" },
          { label: "Burn after shock", value: shockBurn <= 0 ? "cash-positive" : `${fc(Math.round(shockBurn))}/mo`, color: shockBurn <= 0 ? "text-green-400" : "text-orange-400" },
          { label: "Runway after shock", value: label(shockRunway), color: shockRunway === Infinity ? "text-green-400" : shockRunway < safety ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Cost cut to survive", value: cutNeeded <= 0 ? "none" : `${fc(Math.round(cutNeeded))}/mo`, color: cutNeeded <= 0 ? "text-green-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Normal", `After −${(drop * 100).toFixed(0)}%`].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Monthly revenue", b: fc(Math.round(rev)), a: fc(Math.round(shockedRev)) },
              { label: "Monthly cost",    b: fc(Math.round(cost)), a: fc(Math.round(shockedCost)) },
              { label: "Net burn / mo",   b: baseBurn <= 0 ? "cash-positive" : fc(Math.round(baseBurn)), a: shockBurn <= 0 ? "cash-positive" : fc(Math.round(shockBurn)) },
              { label: "Runway",          b: label(baseRunway), a: label(shockRunway), bold: true },
            ].map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${survives ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${survives ? "text-green-400" : "text-red-400"}`}>
          {survives
            ? `✓ A ${(drop * 100).toFixed(0)}% revenue drop still leaves ${label(shockRunway)} of runway — above your ${safety}-month safety line.`
            : `⚠ A ${(drop * 100).toFixed(0)}% drop cuts runway to ${label(shockRunway)}. Cut ${fc(Math.round(cutNeeded))}/mo of cost (or raise cash) to hold the ${safety}-month line.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A first-order stress test: variable cost scales linearly with revenue and fixed cost stays put. Real downturns also stretch receivables — pair this with the Payment-Terms tool.</p>
    </div>
  );
}

// ── #95 COST-CUT SAVINGS SIMULATOR ──────────────────────────────────────────
// Toggle a checklist of common SMB expense lines (each a % of current monthly
// cost) and watch monthly savings, annual savings, and the runway extension add
// up — ranked by how painful each cut is.
function CostCutSimulator() {
  const fc = formatCurrency;
  const live = useLiveMonthly();

  const [cashInput, setCash] = useState("");
  const [costInput, setCost] = useState("");
  const [revInput, setRev]   = useState("");

  const cash = parseFloat(cashInput) || live.cashOnHand;
  const cost = parseFloat(costInput) || live.monthlyCost;
  const rev  = parseFloat(revInput)  || live.monthlyRevenue;

  // Each lever = a % of current monthly cost it could remove, plus a pain rank.
  const LEVERS = [
    { id: "subs",      label: "Trim SaaS / subscriptions",   pct: 4,  pain: "low" },
    { id: "travel",    label: "Cut travel & entertainment",  pct: 6,  pain: "low" },
    { id: "marketing", label: "Pause discretionary marketing", pct: 12, pain: "medium" },
    { id: "contract",  label: "Drop contractors / agencies", pct: 10, pain: "medium" },
    { id: "rent",      label: "Renegotiate / sublet rent",   pct: 9,  pain: "high" },
    { id: "payroll",   label: "Salary freeze / restructure", pct: 18, pain: "high" },
  ];
  const PAIN_COLOR: Record<string, string> = { low: "text-green-400", medium: "text-orange-400", high: "text-red-400" };

  const [on, setOn] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOn(s => ({ ...s, [id]: !s[id] }));

  const monthlySaving = LEVERS.reduce((s, l) => s + (on[l.id] ? cost * (l.pct / 100) : 0), 0);
  const newCost   = Math.max(0, cost - monthlySaving);
  const baseBurn  = cost - rev;
  const newBurn   = newCost - rev;
  const runway = (burn: number) => burn <= 0 ? Infinity : cash / burn;
  const baseRunway = runway(baseBurn);
  const newRunway  = runway(newBurn);
  const label = (m: number) => m === Infinity ? "∞" : `${m.toFixed(1)} mo`;
  const runwayGain = (baseRunway === Infinity || newRunway === Infinity) ? null : newRunway - baseRunway;
  const anyOn = monthlySaving > 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Scissors size={14} className="text-[var(--color-primary)]" /> Cost-Cut Savings Simulator</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash on hand (₹)</label><input type="number" value={cashInput} onChange={e => setCash(e.target.value)} placeholder={`Auto: ${fc(live.cashOnHand)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly cost (₹)</label><input type="number" value={costInput} onChange={e => setCost(e.target.value)} placeholder={`Auto: ${fc(live.monthlyCost)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly revenue (₹)</label><input type="number" value={revInput} onChange={e => setRev(e.target.value)} placeholder={`Auto: ${fc(live.monthlyRevenue)}`} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Tick the cuts you're willing to make — each is sized as a share of your current monthly cost. Cuts are ranked least to most painful.</p>
      </div>

      <div className={`${CARD} space-y-2`}>
        {LEVERS.map(l => {
          const saving = cost * (l.pct / 100);
          const active = !!on[l.id];
          return (
            <button key={l.id} onClick={() => toggle(l.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${active ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10" : "border-[var(--color-border)] hover:bg-white/2"}`}>
              <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${active ? "bg-[var(--color-primary)] border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
                {active && <CheckCircle2 size={12} className="text-[var(--color-bg)]" />}
              </span>
              <span className="text-sm font-medium flex-1">{l.label}</span>
              <span className={`text-[10px] font-semibold uppercase ${PAIN_COLOR[l.pain]}`}>{l.pain}</span>
              <span className="text-xs tabular-nums text-[var(--color-muted)] w-28 text-right">−{fc(Math.round(saving))}/mo</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Monthly savings", value: fc(Math.round(monthlySaving)), color: anyOn ? "text-green-400" : "text-[var(--color-muted)]" },
          { label: "Annual savings", value: fc(Math.round(monthlySaving * 12)), color: anyOn ? "text-green-400" : "text-[var(--color-muted)]" },
          { label: "New monthly cost", value: fc(Math.round(newCost)), color: "text-[var(--color-text)]" },
          { label: "Runway after cuts", value: label(newRunway), color: newRunway === Infinity ? "text-green-400" : "text-[var(--color-text)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {anyOn && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400">
            ✓ These cuts save {fc(Math.round(monthlySaving))}/mo ({fc(Math.round(monthlySaving * 12))}/yr){runwayGain !== null ? ` and extend runway by ~${runwayGain.toFixed(1)} months` : newBurn <= 0 ? " and turn you cash-positive" : ""}.
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Indicative percentages — replace with your real line items for an exact plan. High-pain cuts (payroll, rent) carry morale and continuity costs not shown here.</p>
    </div>
  );
}

// ── #96 NEW-PRODUCT-LAUNCH MODEL ────────────────────────────────────────────
// Models a launch's S-curve ramp over N months, the cannibalization of existing
// sales, upfront launch cost, and the cumulative cash payback / break-even month.
function ProductLaunchModel() {
  const fc = formatCurrency;
  const [upfront, setUpfront]   = useState("300000");  // one-time launch spend
  const [peakRev, setPeak]      = useState("250000");  // steady-state monthly revenue at full ramp
  const [marginPct, setMargin]  = useState("45");      // contribution margin %
  const [rampMo, setRamp]       = useState("4");       // months to reach ~full ramp
  const [cannibal, setCannibal] = useState("15");      // % of new revenue that steals existing margin
  const [months, setMonths]     = useState("12");      // horizon

  const F   = parseFloat(upfront) || 0;
  const peak = parseFloat(peakRev) || 0;
  const m   = (parseFloat(marginPct) || 0) / 100;
  const ramp = Math.max(parseFloat(rampMo) || 1, 1);
  const cann = (parseFloat(cannibal) || 0) / 100;
  const H    = Math.min(Math.max(parseInt(months) || 1, 1), 36);

  // S-curve ramp: fraction of peak reached by month t (logistic-ish, simple).
  const rampFrac = (t: number) => 1 - Math.exp(-2.2 * t / ramp);

  const rows = useMemo(() => {
    const out: { month: number; revenue: number; netContribution: number; cumulative: number }[] = [];
    let cum = -F;
    for (let t = 1; t <= H; t++) {
      const revenue = peak * rampFrac(t);
      // Net contribution = new margin minus the margin lost to cannibalized sales.
      const netContribution = revenue * m * (1 - cann);
      cum += netContribution;
      out.push({ month: t, revenue, netContribution, cumulative: cum });
    }
    return out;
  }, [F, peak, m, ramp, cann, H]);

  const paybackMonth = rows.find(r => r.cumulative >= 0)?.month ?? null;
  const endCumulative = rows[rows.length - 1]?.cumulative ?? -F;
  const totalContribution = endCumulative + F;
  const profitable = endCumulative >= 0;
  const chartData = rows.map(r => ({ month: `M${r.month}`, cum: Math.round(r.cumulative / 1000) }));

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Rocket size={14} className="text-[var(--color-primary)]" /> New-Product-Launch Model</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Upfront launch cost (₹)</label><input type="number" value={upfront} onChange={e => setUpfront(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Peak monthly revenue (₹)</label><input type="number" value={peakRev} onChange={e => setPeak(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Contribution margin %</label><input type="number" value={marginPct} onChange={e => setMargin(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Months to full ramp</label><input type="number" value={rampMo} onChange={e => setRamp(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cannibalization %</label><input type="number" value={cannibal} onChange={e => setCannibal(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Horizon (months)</label><input type="number" value={months} onChange={e => setMonths(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Revenue follows an S-curve to peak. Cannibalization discounts the margin that simply moved from an existing product.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Payback month", value: paybackMonth ? `Month ${paybackMonth}` : "not within horizon", color: paybackMonth ? "text-green-400" : "text-red-400" },
          { label: `Cumulative cash (M${H})`, value: `${endCumulative >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(endCumulative)))}`, color: profitable ? "text-green-400" : "text-red-400" },
          { label: "Total contribution", value: fc(Math.round(totalContribution)), color: "text-[var(--color-text)]" },
          { label: "Peak monthly margin", value: `${fc(Math.round(peak * m * (1 - cann)))}/mo`, color: "text-[var(--color-text)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD}`}>
        <p className="text-xs font-semibold text-[var(--color-muted)] mb-3">Cumulative cash position (₹ thousands) · crosses zero at payback</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gradLaunch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1A6B55" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1A6B55" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`₹${v}k`, "Cumulative"]} />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
            <Area type="monotone" dataKey="cum" stroke="#1A6B55" strokeWidth={2} fill="url(#gradLaunch)" name="cum" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className={`rounded-lg p-4 border ${profitable ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${profitable ? "text-green-400" : "text-red-400"}`}>
          {profitable
            ? `✓ The launch recovers its ${fc(F)} upfront${paybackMonth ? ` by month ${paybackMonth}` : ""} and contributes ${fc(Math.round(endCumulative))} net cash over ${H} months.`
            : `⚠ Over ${H} months the launch is still ${fc(Math.abs(Math.round(endCumulative)))} underwater — slow the ramp assumptions or cut launch cost before committing.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Contribution model: fixed overheads beyond the upfront spend are not re-charged here. Validate the ramp curve and cannibalization rate against a small pilot.</p>
    </div>
  );
}

// ── #97 SUPPLIER PRICE-RISE IMPACT ──────────────────────────────────────────
// A key input cost rises X%; shows the hit to unit margin and annual profit, and
// the selling-price increase needed to fully pass it through.
function SupplierPriceRiseImpact() {
  const fc = formatCurrency;
  const [price, setPrice]     = useState("1000");   // selling price / unit
  const [inputCost, setInput] = useState("400");    // affected input cost / unit
  const [otherVar, setOther]  = useState("200");    // other variable cost / unit
  const [risePct, setRise]    = useState("12");     // supplier increase %
  const [units, setUnits]     = useState("1000");   // monthly units

  const P  = parseFloat(price) || 0;
  const IC = parseFloat(inputCost) || 0;
  const OV = parseFloat(otherVar) || 0;
  const rise = (parseFloat(risePct) || 0) / 100;
  const Q  = parseFloat(units) || 0;

  const newInput = IC * (1 + rise);
  const oldUnitCost = IC + OV;
  const newUnitCost = newInput + OV;
  const oldMargin = P - oldUnitCost;
  const newMargin = P - newUnitCost;
  const marginHitPerUnit = oldMargin - newMargin; // = IC*rise
  const oldMarginPct = P > 0 ? (oldMargin / P) * 100 : 0;
  const newMarginPct = P > 0 ? (newMargin / P) * 100 : 0;
  const annualProfitHit = marginHitPerUnit * Q * 12;

  // Price increase to fully pass the cost through and restore old rupee margin.
  const passThroughPrice = P + marginHitPerUnit;
  const passThroughPct = P > 0 ? (marginHitPerUnit / P) * 100 : 0;
  const stillProfitable = newMargin > 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Factory size={14} className="text-[var(--color-primary)]" /> Supplier Price-Rise Impact</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Selling price / unit (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Affected input cost / unit (₹)</label><input type="number" value={inputCost} onChange={e => setInput(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Other variable cost / unit (₹)</label><input type="number" value={otherVar} onChange={e => setOther(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Supplier rise %</label><input type="number" value={risePct} onChange={e => setRise(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly units</label><input type="number" value={units} onChange={e => setUnits(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Only the affected input rises; other costs and price hold unless you pass it through.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "New input cost / unit", value: fc(Math.round(newInput)), color: "text-red-400" },
          { label: "Margin hit / unit", value: `−${fc(Math.round(marginHitPerUnit))}`, color: "text-red-400" },
          { label: "Annual profit hit", value: `−${fc(Math.round(annualProfitHit))}`, color: "text-red-400" },
          { label: "Pass-through price", value: `${fc(Math.round(passThroughPrice))} (+${passThroughPct.toFixed(1)}%)`, color: "text-[var(--color-primary)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Before", "After rise"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Unit cost", b: fc(Math.round(oldUnitCost)), a: fc(Math.round(newUnitCost)) },
              { label: "Unit margin", b: fc(Math.round(oldMargin)), a: fc(Math.round(newMargin)) },
              { label: "Margin %", b: `${oldMarginPct.toFixed(1)}%`, a: `${newMarginPct.toFixed(1)}%` },
              { label: "Monthly profit", b: fc(Math.round(oldMargin * Q)), a: fc(Math.round(newMargin * Q)), bold: true },
            ].map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${stillProfitable ? "border-orange-800/40 bg-orange-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${stillProfitable ? "text-orange-400" : "text-red-400"}`}>
          {stillProfitable
            ? `A ${(rise * 100).toFixed(0)}% supplier hike costs ${fc(Math.round(annualProfitHit))}/yr in profit. Raise price ${passThroughPct.toFixed(1)}% (to ${fc(Math.round(passThroughPrice))}) to fully recover it, or absorb the ${newMarginPct.toFixed(1)}% margin.`
            : `⚠ At a ${(rise * 100).toFixed(0)}% hike your unit margin turns negative — you must raise price, re-source, or drop this line.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Pass-through restores rupee margin per unit; it assumes demand holds at the higher price — stress that with the Price-Change Profit tool's elasticity.</p>
    </div>
  );
}

// ── #98 PAYMENT-TERMS CASH IMPACT ───────────────────────────────────────────
// Shifts customer (DSO) and supplier (DPO) payment days and shows the one-time
// cash freed/locked plus the interest saved on a working-capital line.
function PaymentTermsCashImpact() {
  const fc = formatCurrency;
  const live = useLiveMonthly();

  const [revInput, setRev]   = useState("");
  const [costInput, setCost] = useState("");
  const [dsoOld, setDsoOld]  = useState("60");
  const [dsoNew, setDsoNew]  = useState("45");
  const [dpoOld, setDpoOld]  = useState("30");
  const [dpoNew, setDpoNew]  = useState("45");
  const [wcRate, setRate]    = useState("14");   // working-capital interest %

  const rev  = parseFloat(revInput)  || live.monthlyRevenue;
  const cost = parseFloat(costInput) || live.monthlyCost;
  const dailyRev  = rev * 12 / 365;
  const dailyCost = cost * 12 / 365;
  const rate = (parseFloat(wcRate) || 0) / 100;

  const dDso = (parseFloat(dsoOld) || 0) - (parseFloat(dsoNew) || 0); // +ve = collect faster = cash in
  const dDpo = (parseFloat(dpoNew) || 0) - (parseFloat(dpoOld) || 0); // +ve = pay slower = cash kept

  const cashFromDso = dDso * dailyRev;
  const cashFromDpo = dDpo * dailyCost;
  const cashFreed   = cashFromDso + cashFromDpo;
  const interestSaved = cashFreed * rate;
  const positive = cashFreed >= 0;

  const oldCcc = (parseFloat(dsoOld) || 0) - (parseFloat(dpoOld) || 0);
  const newCcc = (parseFloat(dsoNew) || 0) - (parseFloat(dpoNew) || 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Clock size={14} className="text-[var(--color-primary)]" /> Payment-Terms Cash Impact</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly revenue (₹)</label><input type="number" value={revInput} onChange={e => setRev(e.target.value)} placeholder={`Auto: ${fc(live.monthlyRevenue)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly cost (₹)</label><input type="number" value={costInput} onChange={e => setCost(e.target.value)} placeholder={`Auto: ${fc(live.monthlyCost)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">WC interest %</label><input type="number" value={wcRate} onChange={e => setRate(e.target.value)} className={INP} /></div>
          <div />
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Customer days (DSO) — now</label><input type="number" value={dsoOld} onChange={e => setDsoOld(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Customer days (DSO) — new</label><input type="number" value={dsoNew} onChange={e => setDsoNew(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Supplier days (DPO) — now</label><input type="number" value={dpoOld} onChange={e => setDpoOld(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Supplier days (DPO) — new</label><input type="number" value={dpoNew} onChange={e => setDpoNew(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Collecting sooner (lower DSO) and paying later (higher DPO) both free one-time cash. Cash-conversion cycle = DSO − DPO.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cash from faster DSO", value: `${cashFromDso >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(cashFromDso)))}`, color: cashFromDso >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Cash from slower DPO", value: `${cashFromDpo >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(cashFromDpo)))}`, color: cashFromDpo >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Total cash freed", value: `${positive ? "+" : "−"}${fc(Math.abs(Math.round(cashFreed)))}`, color: positive ? "text-green-400" : "text-red-400" },
          { label: "Annual interest saved", value: fc(Math.round(interestSaved)), color: interestSaved >= 0 ? "text-green-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} flex items-center justify-around text-center`}>
        <div>
          <p className="text-xs text-[var(--color-muted)] mb-1">Cash-conversion cycle now</p>
          <p className="text-2xl font-bold tabular-nums">{oldCcc.toFixed(0)} <span className="text-sm font-normal text-[var(--color-muted)]">days</span></p>
        </div>
        <TrendingDown size={20} className={newCcc <= oldCcc ? "text-green-400" : "text-red-400"} />
        <div>
          <p className="text-xs text-[var(--color-muted)] mb-1">After change</p>
          <p className={`text-2xl font-bold tabular-nums ${newCcc <= oldCcc ? "text-green-400" : "text-red-400"}`}>{newCcc.toFixed(0)} <span className="text-sm font-normal text-[var(--color-muted)]">days</span></p>
        </div>
      </div>

      <div className={`rounded-lg p-4 border ${positive ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${positive ? "text-green-400" : "text-red-400"}`}>
          {positive
            ? `✓ These terms free ${fc(Math.round(cashFreed))} of one-time cash and save ${fc(Math.round(interestSaved))}/yr in working-capital interest — CCC drops ${(oldCcc - newCcc).toFixed(0)} days.`
            : `⚠ These terms lock up ${fc(Math.abs(Math.round(cashFreed)))} more cash and lengthen your cash-conversion cycle. Re-check the DSO/DPO direction.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A one-time balance-sheet shift, not recurring profit. Faster DSO may need early-pay discounts; slower DPO can strain supplier goodwill.</p>
    </div>
  );
}

// ── #99 MARKETING-SPEND ROI SCENARIO ────────────────────────────────────────
// Models spend → leads (via CPL) → customers (conversion) → revenue & margin,
// then reports ROAS, CAC, payback and net profit including LTV.
function MarketingRoiScenario() {
  const fc = formatCurrency;
  const [spend, setSpend]       = useState("100000");
  const [cpl, setCpl]           = useState("400");     // cost per lead
  const [convPct, setConv]      = useState("8");       // lead → customer %
  const [aov, setAov]           = useState("6000");    // avg first-order value
  const [marginPct, setMargin]  = useState("40");      // contribution margin %
  const [repeat, setRepeat]     = useState("2");       // additional lifetime orders

  const S = parseFloat(spend) || 0;
  const CPL = parseFloat(cpl) || 0;
  const conv = (parseFloat(convPct) || 0) / 100;
  const aovV = parseFloat(aov) || 0;
  const m = (parseFloat(marginPct) || 0) / 100;
  const repeatOrders = parseFloat(repeat) || 0;

  const leads = CPL > 0 ? S / CPL : 0;
  const customers = leads * conv;
  const firstRevenue = customers * aovV;
  const ltvRevenue = customers * aovV * (1 + repeatOrders);
  const firstMargin = firstRevenue * m;
  const ltvMargin = ltvRevenue * m;
  const cac = customers > 0 ? S / customers : 0;
  const ltvPerCustomer = aovV * (1 + repeatOrders) * m;
  const roasFirst = S > 0 ? firstRevenue / S : 0;
  const netFirst = firstMargin - S;
  const netLtv = ltvMargin - S;
  const ltvCacRatio = cac > 0 ? ltvPerCustomer / cac : 0;
  const profitableFirst = netFirst >= 0;
  const profitableLtv = netLtv >= 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Megaphone size={14} className="text-[var(--color-primary)]" /> Marketing-Spend ROI Scenario</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Marketing spend (₹)</label><input type="number" value={spend} onChange={e => setSpend(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cost per lead (₹)</label><input type="number" value={cpl} onChange={e => setCpl(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Lead → customer %</label><input type="number" value={convPct} onChange={e => setConv(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Avg order value (₹)</label><input type="number" value={aov} onChange={e => setAov(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Contribution margin %</label><input type="number" value={marginPct} onChange={e => setMargin(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Extra lifetime orders</label><input type="number" value={repeat} onChange={e => setRepeat(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Funnel: spend ÷ CPL = leads → × conversion = customers → × AOV = revenue. LTV adds repeat orders.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "New customers", value: Math.round(customers).toLocaleString("en-IN"), color: "text-[var(--color-text)]" },
          { label: "CAC", value: fc(Math.round(cac)), color: "text-[var(--color-text)]" },
          { label: "First-order ROAS", value: `${roasFirst.toFixed(2)}×`, color: roasFirst >= 1 ? "text-green-400" : "text-orange-400" },
          { label: "LTV : CAC", value: `${ltvCacRatio.toFixed(1)}×`, color: ltvCacRatio >= 3 ? "text-green-400" : ltvCacRatio >= 1 ? "text-orange-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "First order", "With LTV"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Revenue", b: fc(Math.round(firstRevenue)), a: fc(Math.round(ltvRevenue)) },
              { label: "Contribution margin", b: fc(Math.round(firstMargin)), a: fc(Math.round(ltvMargin)) },
              { label: "Less: marketing spend", b: `−${fc(Math.round(S))}`, a: `−${fc(Math.round(S))}` },
              { label: "Net profit", b: `${netFirst >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(netFirst)))}`, a: `${netLtv >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(netLtv)))}`, bold: true },
            ].map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${profitableLtv ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${profitableLtv ? "text-green-400" : "text-red-400"}`}>
          {profitableFirst
            ? `✓ This spend pays back on the first order (${roasFirst.toFixed(2)}× ROAS) and nets ${fc(Math.round(netLtv))} over the customer lifetime.`
            : profitableLtv
              ? `Loses ${fc(Math.abs(Math.round(netFirst)))} on first orders but turns ${fc(Math.round(netLtv))} profit once repeat orders land — viable only if retention holds (LTV:CAC ${ltvCacRatio.toFixed(1)}×).`
              : `⚠ Even with lifetime value this spend loses ${fc(Math.abs(Math.round(netLtv)))} — lower CPL, lift conversion, or raise AOV before scaling.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">CPL and conversion are the most fragile inputs — small swings flip ROI. Test with a small budget before committing the full spend.</p>
    </div>
  );
}

// ── #100 CAPEX: BUY vs LEASE WAR-GAME ───────────────────────────────────────
// Compares outright buy, equipment loan, and lease over the asset life on total
// cash out, tax shield (depreciation / interest / lease rent), and net cost.
function CapexBuyVsLease() {
  const fc = formatCurrency;
  const [assetCost, setAsset]  = useState("1000000");
  const [lifeYears, setLife]   = useState("5");
  const [salvagePct, setSalv]  = useState("15");    // residual value % at end
  const [loanRate, setRate]    = useState("12");    // equipment loan %
  const [leaseMo, setLease]    = useState("22000"); // monthly lease rent
  const [taxPct, setTax]       = useState("25");    // corporate tax %
  const [deprPct, setDepr]     = useState("15");    // WDV depreciation %

  const A = parseFloat(assetCost) || 0;
  const yrs = Math.max(parseFloat(lifeYears) || 1, 1);
  const salvage = A * (parseFloat(salvagePct) || 0) / 100;
  const r = (parseFloat(loanRate) || 0) / 100;
  const leaseM = parseFloat(leaseMo) || 0;
  const tax = (parseFloat(taxPct) || 0) / 100;
  const depr = (parseFloat(deprPct) || 0) / 100;

  // Depreciation tax shield (WDV method over the asset life).
  let wdv = A, deprShield = 0;
  for (let y = 0; y < yrs; y++) { const d = wdv * depr; deprShield += d * tax; wdv -= d; }

  // BUY: pay full cost, recover salvage, keep depreciation tax shield.
  const buyNet = A - salvage - deprShield;

  // LOAN: simple-interest equipment loan over the life; interest is tax-deductible,
  // and the buyer still owns the asset (depreciation shield + salvage).
  const totalInterest = A * r * yrs;
  const interestShield = totalInterest * tax;
  const loanNet = A + totalInterest - interestShield - salvage - deprShield;

  // LEASE: rent is fully deductible; no ownership, no salvage, no depreciation.
  const totalLease = leaseM * 12 * yrs;
  const leaseShield = totalLease * tax;
  const leaseNet = totalLease - leaseShield;

  const options = [
    { key: "buy",   label: "Buy (cash)",   net: buyNet,   upfront: A,        color: "text-green-400" },
    { key: "loan",  label: "Equipment loan", net: loanNet, upfront: 0,        color: "text-blue-400" },
    { key: "lease", label: "Lease",        net: leaseNet, upfront: leaseM,   color: "text-purple-400" },
  ];
  const best = options.reduce((b, o) => o.net < b.net ? o : b, options[0]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Capex: Buy vs Loan vs Lease</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Asset cost (₹)</label><input type="number" value={assetCost} onChange={e => setAsset(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Life (years)</label><input type="number" value={lifeYears} onChange={e => setLife(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Salvage value %</label><input type="number" value={salvagePct} onChange={e => setSalv(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Loan rate %</label><input type="number" value={loanRate} onChange={e => setRate(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Lease rent / mo (₹)</label><input type="number" value={leaseMo} onChange={e => setLease(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Tax rate %</label><input type="number" value={taxPct} onChange={e => setTax(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Depreciation % (WDV)</label><input type="number" value={deprPct} onChange={e => setDepr(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Net cost = total cash out − tax shields − salvage. Buy/loan keep depreciation + residual; lease deducts full rent but owns nothing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {options.map(o => (
          <div key={o.key} className={`${CARD} ${o.key === best.key ? "border-[var(--color-primary)]/50 ring-1 ring-[var(--color-primary)]/30" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-sm font-semibold ${o.color}`}>{o.label}</p>
              {o.key === best.key && <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase">Lowest cost</span>}
            </div>
            <p className="text-2xl font-bold tabular-nums">{fc(Math.round(o.net))}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">net cost over {yrs}y · upfront {fc(Math.round(o.upfront))}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[480px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Component", "Buy", "Loan", "Lease"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Gross cash out", buy: fc(Math.round(A)), loan: fc(Math.round(A + totalInterest)), lease: fc(Math.round(totalLease)) },
              { label: "Tax shield", buy: `−${fc(Math.round(deprShield))}`, loan: `−${fc(Math.round(deprShield + interestShield))}`, lease: `−${fc(Math.round(leaseShield))}` },
              { label: "Less: salvage", buy: `−${fc(Math.round(salvage))}`, loan: `−${fc(Math.round(salvage))}`, lease: "—" },
              { label: "Net cost", buy: fc(Math.round(buyNet)), loan: fc(Math.round(loanNet)), lease: fc(Math.round(leaseNet)), bold: true },
            ].map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.buy}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.loan}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.lease}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
        <p className="text-sm font-bold text-green-400">
          ✓ Lowest net cost over {yrs} years: {best.label} at {fc(Math.round(best.net))}. Buy needs {fc(Math.round(A))} upfront; lease preserves cash but forfeits {fc(Math.round(salvage))} residual and the depreciation shield.
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Simplified: loan uses flat interest and the time-value of money is not discounted. Confirm depreciation rate and lease tax treatment with your CA before deciding.</p>
    </div>
  );
}
