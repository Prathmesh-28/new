import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Sliders, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Zap, Copy, Tag, Users, PieChart, Target, ShieldAlert, Scissors, Rocket, Factory, Clock, Megaphone, Building2, Scale, UserMinus, Wallet, Boxes, Globe, Bot, HeartCrack, Gauge, Flame } from "lucide-react";
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { runForecast } from "@/lib/forecastEngine";
import EmptyState from "@/components/EmptyState";
import { useT } from "@/i18n";
import type { Scenario } from "@/data/types";
import DataFreshnessBadge from "@/components/DataFreshnessBadge";

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

type ScenarioTab = "planner" | "price-sim" | "headcount" | "dilution" | "breakeven" | "revenue-shock" | "cost-cut" | "product-launch" | "supplier-hike" | "payment-terms" | "marketing-roi" | "capex" | "debt-vs-equity" | "client-loss" | "salary-hike" | "inventory-buildup" | "fx-shock" | "automation-roi" | "churn-impact" | "capacity-expansion" | "cost-inflation";

export default function ScenariosPage() {
  const { store } = useApp();
  const navigate  = useNavigate();
  const tr = useT();
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
  // base and the with-scenario projection - revenue, recurring series, invoice
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
  // scenario delta - not by RNG noise (runForecast otherwise derives its seed
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

  // The planner projects off live data (transactions + bank balances). With none,
  // the base Monte-Carlo run is flat/zero - show a helpful empty state instead.
  const hasLiveData = (store.transactions?.length ?? 0) > 0 || (store.bankAccounts?.length ?? 0) > 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sliders size={20} className="text-[var(--color-primary)]" />
          {tr("scen.title")}
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Model "what if" situations - hiring, new deals, loans, lost clients - and see the cash impact over the next 6 months, run through the same Monte-Carlo engine as your forecast.
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
          ["debt-vs-equity", "Debt vs Equity", Scale],
          ["client-loss", "Top-Client Loss", UserMinus],
          ["salary-hike", "Salary-Hike Afford", Wallet],
          ["inventory-buildup", "Inventory Build-up", Boxes],
          ["fx-shock", "FX-Rate Shock", Globe],
          ["automation-roi", "Automation ROI", Bot],
          ["churn-impact", "Churn Increase", HeartCrack],
          ["capacity-expansion", "Capacity Expansion", Gauge],
          ["cost-inflation", "Cost-Inflation Passthrough", Flame],
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
      {scenTab === "debt-vs-equity" && <DebtVsEquityRaise />}
      {scenTab === "client-loss" && <TopClientLossImpact />}
      {scenTab === "salary-hike" && <SalaryHikeAffordability />}
      {scenTab === "inventory-buildup" && <InventoryBuildupImpact />}
      {scenTab === "fx-shock" && <FxRateShock />}
      {scenTab === "automation-roi" && <AutomationRoiScenario />}
      {scenTab === "churn-impact" && <ChurnIncreaseImpact />}
      {scenTab === "capacity-expansion" && <CapacityExpansionModel />}
      {scenTab === "cost-inflation" && <CostInflationPassthrough />}

      {scenTab === "planner" && !hasLiveData && (
        <EmptyState
          icon={Sliders}
          title={tr("scen.emptyTitle")}
          description="Model best/worst-case cash outcomes from your live data. Connect a bank account and record a few transactions, then build a forecast - the planner runs your what-ifs through the same Monte-Carlo engine."
          ctaText="Go to Forecast"
          ctaHref="/forecast"
        />
      )}

      {scenTab === "planner" && hasLiveData && <>
      {/* Presets */}
      <div>
        <p className="text-xs text-[var(--color-muted)] font-medium mb-2">{tr("scen.quickScenarios")}</p>
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
                <span className="text-xs text-[var(--color-muted)]">mo {ev.startMonth}-{ev.startMonth + ev.durationMonths}</span>
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
            <h2 className="text-sm font-semibold">{tr("scen.cashProjection")}</h2>
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
              label: tr("scen.baseRunway"),
              value: baseRunway >= HORIZON ? `${HORIZON}+d` : `${baseRunway}d`,
              sub: "median (P50)",
              icon: TrendingUp,
              color: "text-[var(--color-muted)]",
            },
            {
              label: tr("scen.scenarioRunway"),
              value: scenRunway >= HORIZON ? `${HORIZON}+d` : `${Math.max(0, scenRunway)}d`,
              sub: "median, with events",
              icon: Sliders,
              color: scenRunway >= baseRunway ? "text-green-400" : "text-red-400",
            },
            {
              label: tr("scen.sixMonthBase"),
              value: formatCurrency(Math.max(0, finalBase)),
              sub: "ending cash (P50)",
              icon: TrendingDown,
              color: "text-[var(--color-muted)]",
            },
            {
              label: tr("scen.scenarioDifference"),
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
              navigator.clipboard.writeText(`Headroom scenario: ${events.map(e => e.label).join(", ")} - 12mo delta: ${scenDiff >= 0 ? "+" : ""}${formatCurrency(Math.abs(scenDiff))}`).catch(() => {});
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
            : `⚠ This price move cuts contribution profit by ${fc(Math.abs(Math.round(profitDiff)))} - the volume loss outweighs the higher margin.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Contribution profit = (price − unit cost) × units. Fixed costs are held constant. Elasticity is a simple linear assumption - validate against real demand data.</p>
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
            ? `✓ Even with ${n} hire(s) you stay cash-positive - this plan is fundable from operations.`
            : scenRunway < 6
              ? `⚠ Hiring ${n} drops runway to ${runwayLabel(scenRunway)} - below the 6-month safety line. Secure revenue or funding first.`
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
  const pricePerShare = post; // notional - work in % ownership

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

      <p className="text-[10px] text-[var(--color-muted)]">Single-round, single-class model in % ownership (price/share = post-money, {fc(Math.round(pricePerShare))} notional). Liquidation preferences, multiple classes and option exercise are not modelled - see Cap-Table tools for a full waterfall.</p>
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
          <p className="text-sm font-bold text-red-400">⚠ Variable cost ≥ price - every unit loses money, so there is no break-even point. Raise price or cut unit cost.</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Break-even units", value: beUnits === Infinity ? "-" : `${beUnits.toLocaleString("en-IN")} u`, color: "text-[var(--color-primary)]" },
          { label: "Break-even revenue", value: beRevenue === Infinity ? "-" : fc(Math.round(beRevenue)), color: "text-[var(--color-primary)]" },
          { label: "Margin of safety", value: beRevenue === Infinity ? "-" : `${mosPct.toFixed(1)}%`, color: mosPct >= 20 ? "text-green-400" : mosPct >= 0 ? "text-orange-400" : "text-red-400" },
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
              ? `✓ You break even at ${beUnits.toLocaleString("en-IN")} units / ${fc(Math.round(beRevenue))}. At ${A.toLocaleString("en-IN")} units you clear break-even by ${mosPct.toFixed(1)}% - sales can fall ${mosUnits.toLocaleString("en-IN")} units before you hit a loss.`
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
            ? `✓ A ${(drop * 100).toFixed(0)}% revenue drop still leaves ${label(shockRunway)} of runway - above your ${safety}-month safety line.`
            : `⚠ A ${(drop * 100).toFixed(0)}% drop cuts runway to ${label(shockRunway)}. Cut ${fc(Math.round(cutNeeded))}/mo of cost (or raise cash) to hold the ${safety}-month line.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A first-order stress test: variable cost scales linearly with revenue and fixed cost stays put. Real downturns also stretch receivables - pair this with the Payment-Terms tool.</p>
    </div>
  );
}

// ── #95 COST-CUT SAVINGS SIMULATOR ──────────────────────────────────────────
// Toggle a checklist of common SMB expense lines (each a % of current monthly
// cost) and watch monthly savings, annual savings, and the runway extension add
// up - ranked by how painful each cut is.
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
        <p className="text-[10px] text-[var(--color-muted)]">Tick the cuts you're willing to make - each is sized as a share of your current monthly cost. Cuts are ranked least to most painful.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative percentages - replace with your real line items for an exact plan. High-pain cuts (payroll, rent) carry morale and continuity costs not shown here.</p>
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
            : `⚠ Over ${H} months the launch is still ${fc(Math.abs(Math.round(endCumulative)))} underwater - slow the ramp assumptions or cut launch cost before committing.`}
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
            : `⚠ At a ${(rise * 100).toFixed(0)}% hike your unit margin turns negative - you must raise price, re-source, or drop this line.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Pass-through restores rupee margin per unit; it assumes demand holds at the higher price - stress that with the Price-Change Profit tool's elasticity.</p>
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
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Customer days (DSO) - now</label><input type="number" value={dsoOld} onChange={e => setDsoOld(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Customer days (DSO) - new</label><input type="number" value={dsoNew} onChange={e => setDsoNew(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Supplier days (DPO) - now</label><input type="number" value={dpoOld} onChange={e => setDpoOld(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Supplier days (DPO) - new</label><input type="number" value={dpoNew} onChange={e => setDpoNew(e.target.value)} className={INP} /></div>
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
            ? `✓ These terms free ${fc(Math.round(cashFreed))} of one-time cash and save ${fc(Math.round(interestSaved))}/yr in working-capital interest - CCC drops ${(oldCcc - newCcc).toFixed(0)} days.`
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
              ? `Loses ${fc(Math.abs(Math.round(netFirst)))} on first orders but turns ${fc(Math.round(netLtv))} profit once repeat orders land - viable only if retention holds (LTV:CAC ${ltvCacRatio.toFixed(1)}×).`
              : `⚠ Even with lifetime value this spend loses ${fc(Math.abs(Math.round(netLtv)))} - lower CPL, lift conversion, or raise AOV before scaling.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">CPL and conversion are the most fragile inputs - small swings flip ROI. Test with a small budget before committing the full spend.</p>
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
              { label: "Less: salvage", buy: `−${fc(Math.round(salvage))}`, loan: `−${fc(Math.round(salvage))}`, lease: "-" },
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

// ── #101 DEBT-RAISE vs EQUITY-RAISE WAR-GAME ────────────────────────────────
// Same amount of growth capital raised two ways: a term loan (you keep equity
// but pay EMIs and interest) vs an equity round (no repayment but you dilute).
// Compares 5-year cash cost, ownership kept and the value of the diluted slice.
function DebtVsEquityRaise() {
  const fc = formatCurrency;
  const [amount, setAmount]     = useState("10000000"); // capital needed (₹)
  const [loanRate, setRate]     = useState("14");       // term-loan interest %
  const [tenor, setTenor]       = useState("5");        // loan tenor (years)
  const [taxPct, setTax]        = useState("25");       // corporate tax % (interest shield)
  const [preMoney, setPre]      = useState("4");        // pre-money valuation (₹ Cr)
  const [exitVal, setExit]      = useState("12");       // expected exit valuation (₹ Cr)

  const A    = parseFloat(amount) || 0;
  const r    = (parseFloat(loanRate) || 0) / 100;
  const yrs  = Math.max(parseFloat(tenor) || 1, 1);
  const tax  = (parseFloat(taxPct) || 0) / 100;
  const pre  = (parseFloat(preMoney) || 0) * 1e7;
  const exit = (parseFloat(exitVal) || 0) * 1e7;

  // DEBT - reducing-balance EMI (standard term loan), interest is tax-deductible.
  const monthlyRate = r / 12;
  const n = Math.round(yrs * 12);
  const emi = monthlyRate > 0
    ? A * monthlyRate * Math.pow(1 + monthlyRate, n) / (Math.pow(1 + monthlyRate, n) - 1)
    : A / n;
  const totalRepaid    = emi * n;
  const totalInterest  = totalRepaid - A;
  const interestShield = totalInterest * tax;
  const debtNetCost    = totalInterest - interestShield;  // principal nets out vs the capital received

  // EQUITY - investor takes amount / post-money; founder keeps the rest. The
  // "cost" of equity is the exit value of the slice given away.
  const post        = pre + A;
  const investorPct = post > 0 ? A / post : 0;
  const founderKept = 1 - investorPct;
  const equityCostAtExit = exit * investorPct;            // value handed to the investor at exit

  const debtCheaper = debtNetCost <= equityCostAtExit;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Debt-Raise vs Equity-Raise</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Capital needed (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Loan rate %</label><input type="number" value={loanRate} onChange={e => setRate(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Tenor (years)</label><input type="number" value={tenor} onChange={e => setTenor(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Tax rate %</label><input type="number" value={taxPct} onChange={e => setTax(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Pre-money (₹ Cr)</label><input type="number" value={preMoney} onChange={e => setPre(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Expected exit (₹ Cr)</label><input type="number" value={exitVal} onChange={e => setExit(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Debt: reducing-balance EMI, interest tax-shielded, equity intact. Equity: no repayment but the investor's stake is worth more at exit.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Loan EMI / mo", value: fc(Math.round(emi)), color: "text-orange-400" },
          { label: "Debt net cost", value: fc(Math.round(debtNetCost)), color: "text-orange-400" },
          { label: "Equity given up", value: `${(investorPct * 100).toFixed(1)}%`, color: "text-purple-400" },
          { label: "Equity cost at exit", value: fc(Math.round(equityCostAtExit)), color: "text-purple-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Term loan", "Equity round"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Cash repaid / out", b: fc(Math.round(totalRepaid)), a: "₹0 (no repayment)" },
              { label: "Tax shield", b: `−${fc(Math.round(interestShield))}`, a: "-" },
              { label: "Ownership kept", b: "100%", a: `${(founderKept * 100).toFixed(1)}%` },
              { label: "True cost", b: fc(Math.round(debtNetCost)), a: fc(Math.round(equityCostAtExit)), bold: true },
            ].map(row => (
              <tr key={row.label} className={`border-b border-[var(--color-border)] last:border-0 ${row.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${debtCheaper ? "border-blue-800/40 bg-blue-950/20" : "border-purple-800/40 bg-purple-950/20"}`}>
        <p className={`text-sm font-bold ${debtCheaper ? "text-blue-400" : "text-purple-400"}`}>
          {debtCheaper
            ? `✓ Debt is cheaper here: ${fc(Math.round(debtNetCost))} net interest vs ${fc(Math.round(equityCostAtExit))} of equity value at exit - if your cash flow can carry ${fc(Math.round(emi))}/mo EMIs.`
            : `✓ Equity costs less long-run (${fc(Math.round(equityCostAtExit))} vs ${fc(Math.round(debtNetCost))} debt) - but only if you're comfortable diluting ${(investorPct * 100).toFixed(1)}% and the exit value materialises.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Equity "cost" is the exit value of the slice given away - it's only paid if you exit at the assumed valuation. Debt is a hard obligation regardless of outcome. Run the Funding-Dilution tool for the full cap table.</p>
    </div>
  );
}

// ── #102 TOP-CLIENT LOSS IMPACT (REVENUE CONCENTRATION) ─────────────────────
// Quantifies the cash hit if your largest customer leaves - sized from your real
// invoiced revenue per customer where available - and the runway and recovery
// (new customers needed) implied by the loss.
function TopClientLossImpact() {
  const { store } = useApp();
  const fc = formatCurrency;
  const live = useLiveMonthly();

  // Rank customers by total invoiced amount (the real AR list).
  const byCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of store.invoices ?? []) {
      map.set(inv.customer, (map.get(inv.customer) ?? 0) + inv.amount);
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [store.invoices]);

  const totalInvoiced = byCustomer.reduce((s, c) => s + c.total, 0);
  const top = byCustomer[0];
  const topShare = totalInvoiced > 0 && top ? top.total / totalInvoiced : 0;

  // Default the lost monthly revenue to the top client's share of live revenue.
  const suggestedLoss = Math.round(live.monthlyRevenue * topShare);
  const [lossInput, setLoss]   = useState("");
  const [varPct, setVarPct]    = useState("45");  // variable cost share of that revenue
  const [cashInput, setCash]   = useState("");

  const lostRev   = parseFloat(lossInput) || suggestedLoss;
  const varShare  = Math.min(Math.max(parseFloat(varPct) || 0, 0), 100) / 100;
  const cash      = parseFloat(cashInput) || live.cashOnHand;

  // Margin lost = revenue lost minus the variable cost that goes away with it.
  const marginLost = lostRev * (1 - varShare);
  const newRev  = Math.max(0, live.monthlyRevenue - lostRev);
  const newCost = Math.max(0, live.monthlyCost - lostRev * varShare);
  const baseBurn = live.monthlyCost - live.monthlyRevenue;
  const newBurn  = newCost - newRev;
  const runway = (burn: number) => burn <= 0 ? Infinity : cash / burn;
  const baseRunway = runway(baseBurn);
  const newRunway  = runway(newBurn);
  const label = (m: number) => m === Infinity ? "∞ (cash-positive)" : `${m.toFixed(1)} mo`;

  // How many average-sized remaining customers replace the lost revenue.
  const others = byCustomer.slice(1);
  const avgOther = others.length > 0 ? others.reduce((s, c) => s + c.total, 0) / others.length : 0;
  const replacementsNeeded = avgOther > 0 ? Math.ceil(top ? top.total / avgOther : lostRev / avgOther) : 0;
  const concentrated = topShare >= 0.25;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserMinus size={14} className="text-[var(--color-primary)]" /> Top-Client Loss Impact</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Lost monthly revenue (₹)</label><input type="number" value={lossInput} onChange={e => setLoss(e.target.value)} placeholder={`Auto: ${fc(suggestedLoss)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Variable-cost share %</label><input type="number" value={varPct} onChange={e => setVarPct(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash on hand (₹)</label><input type="number" value={cashInput} onChange={e => setCash(e.target.value)} placeholder={`Auto: ${fc(live.cashOnHand)}`} className={INP} /></div>
        </div>
        {top
          ? <p className="text-[10px] text-[var(--color-muted)]">Top customer <span className="text-[var(--color-text)] font-medium">{top.name}</span> is {(topShare * 100).toFixed(0)}% of invoiced revenue ({fc(Math.round(top.total))}). Default loss = their share of live monthly revenue.</p>
          : <p className="text-[10px] text-[var(--color-muted)]">No invoices found - enter the lost monthly revenue manually. Live monthly revenue ≈ {fc(live.monthlyRevenue)}.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Revenue concentration", value: `${(topShare * 100).toFixed(0)}%`, color: concentrated ? "text-red-400" : "text-green-400" },
          { label: "Margin lost / mo", value: `−${fc(Math.round(marginLost))}`, color: "text-red-400" },
          { label: "Runway after loss", value: label(newRunway), color: newRunway === Infinity ? "text-green-400" : newRunway < 6 ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Customers to replace", value: replacementsNeeded > 0 ? `~${replacementsNeeded}` : "-", color: "text-[var(--color-text)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Now", "After losing top client"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Monthly revenue", b: fc(live.monthlyRevenue), a: fc(Math.round(newRev)) },
              { label: "Monthly cost",    b: fc(live.monthlyCost),    a: fc(Math.round(newCost)) },
              { label: "Net burn / mo",   b: baseBurn <= 0 ? "cash-positive" : fc(Math.round(baseBurn)), a: newBurn <= 0 ? "cash-positive" : fc(Math.round(newBurn)) },
              { label: "Runway",          b: label(baseRunway), a: label(newRunway), bold: true },
            ].map(row => (
              <tr key={row.label} className={`border-b border-[var(--color-border)] last:border-0 ${row.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${concentrated || newRunway < 6 ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold ${concentrated || newRunway < 6 ? "text-red-400" : "text-green-400"}`}>
          {concentrated
            ? `⚠ ${(topShare * 100).toFixed(0)}% of revenue rides on one client. Losing them costs ${fc(Math.round(marginLost))}/mo of margin and ${newRunway === Infinity ? "keeps you cash-positive" : `drops runway to ${label(newRunway)}`}. Diversify before they hold pricing leverage.`
            : `✓ No single client dominates (${(topShare * 100).toFixed(0)}% top share). Even losing the largest leaves ${newRunway === Infinity ? "you cash-positive" : `${label(newRunway)} of runway`} - healthy revenue diversification.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Concentration above ~25% in one customer is a recognised risk flag. Replacement count assumes new clients average the size of your existing non-top accounts.</p>
    </div>
  );
}

// ── #103 SALARY-HIKE AFFORDABILITY ──────────────────────────────────────────
// Models an across-the-board appraisal: the added monthly + annual payroll cost,
// the hit to runway, and the revenue or margin lift needed to keep it neutral.
function SalaryHikeAffordability() {
  const fc = formatCurrency;
  const live = useLiveMonthly();

  const [payrollInput, setPayroll] = useState(""); // current monthly payroll
  const [headcount, setHead]       = useState("10");
  const [hikePct, setHike]         = useState("12");   // average appraisal %
  const [loadPct, setLoad]         = useState("12");   // employer load (PF/ESI) %
  const [cashInput, setCash]       = useState("");
  const [marginPct, setMargin]     = useState("40");   // contribution margin %

  // Default payroll = ~55% of monthly cost if not entered (typical services SMB).
  const suggestedPayroll = Math.round(live.monthlyCost * 0.55);
  const payroll = parseFloat(payrollInput) || suggestedPayroll;
  const heads   = parseFloat(headcount) || 0;
  const hike    = (parseFloat(hikePct) || 0) / 100;
  const load    = (parseFloat(loadPct) || 0) / 100;
  const cash    = parseFloat(cashInput) || live.cashOnHand;
  const margin  = (parseFloat(marginPct) || 0) / 100;

  const addedMonthly = payroll * hike * (1 + load);
  const addedAnnual  = addedMonthly * 12;
  const perHead      = heads > 0 ? addedMonthly / heads : 0;

  const baseBurn = live.monthlyCost - live.monthlyRevenue;
  const newBurn  = (live.monthlyCost + addedMonthly) - live.monthlyRevenue;
  const runway = (burn: number) => burn <= 0 ? Infinity : cash / burn;
  const baseRunway = runway(baseBurn);
  const newRunway  = runway(newBurn);
  const label = (m: number) => m === Infinity ? "∞ (cash-positive)" : `${m.toFixed(1)} mo`;

  // Revenue lift needed (at contribution margin) to cover the added cost.
  const revLiftNeeded = margin > 0 ? addedMonthly / margin : 0;
  const liftPct = live.monthlyRevenue > 0 ? (revLiftNeeded / live.monthlyRevenue) * 100 : 0;
  const affordable = newBurn <= 0 || newRunway >= 6;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Salary-Hike Affordability</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Current payroll / mo (₹)</label><input type="number" value={payrollInput} onChange={e => setPayroll(e.target.value)} placeholder={`Auto: ${fc(suggestedPayroll)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Headcount</label><input type="number" value={headcount} onChange={e => setHead(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Average hike %</label><input type="number" value={hikePct} onChange={e => setHike(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Employer load %</label><input type="number" value={loadPct} onChange={e => setLoad(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash on hand (₹)</label><input type="number" value={cashInput} onChange={e => setCash(e.target.value)} placeholder={`Auto: ${fc(live.cashOnHand)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Contribution margin %</label><input type="number" value={marginPct} onChange={e => setMargin(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Added cost = payroll × hike% × (1 + load%). Load covers PF/ESI/gratuity. Revenue lift needed = added cost ÷ contribution margin.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Added cost / mo", value: fc(Math.round(addedMonthly)), color: "text-orange-400" },
          { label: "Added cost / yr", value: fc(Math.round(addedAnnual)), color: "text-orange-400" },
          { label: "Avg per head / mo", value: fc(Math.round(perHead)), color: "text-[var(--color-text)]" },
          { label: "Runway after hike", value: label(newRunway), color: newRunway === Infinity ? "text-green-400" : newRunway < 6 ? "text-red-400" : "text-[var(--color-text)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Before hike", "After hike"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Monthly payroll", b: fc(Math.round(payroll)), a: fc(Math.round(payroll * (1 + hike) * (1 + load))) },
              { label: "Monthly cost",    b: fc(live.monthlyCost),    a: fc(Math.round(live.monthlyCost + addedMonthly)) },
              { label: "Net burn / mo",   b: baseBurn <= 0 ? "cash-positive" : fc(Math.round(baseBurn)), a: newBurn <= 0 ? "cash-positive" : fc(Math.round(newBurn)) },
              { label: "Runway",          b: label(baseRunway), a: label(newRunway), bold: true },
            ].map(row => (
              <tr key={row.label} className={`border-b border-[var(--color-border)] last:border-0 ${row.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${affordable ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${affordable ? "text-green-400" : "text-red-400"}`}>
          {affordable
            ? `✓ A ${(hike * 100).toFixed(0)}% hike costs ${fc(Math.round(addedMonthly))}/mo and keeps ${newRunway === Infinity ? "you cash-positive" : `${label(newRunway)} of runway`}. Cover it with ~${fc(Math.round(revLiftNeeded))}/mo (+${liftPct.toFixed(1)}%) of extra revenue.`
            : `⚠ A ${(hike * 100).toFixed(0)}% hike adds ${fc(Math.round(addedMonthly))}/mo and cuts runway to ${label(newRunway)}. Phase it, tie part to performance, or first grow revenue ${fc(Math.round(revLiftNeeded))}/mo (+${liftPct.toFixed(1)}%).`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">An across-the-board hike applied to total payroll. For role-by-role appraisals, run this per band using each band's payroll and target hike.</p>
    </div>
  );
}

// ── #104 INVENTORY BUILD-UP CASH IMPACT ─────────────────────────────────────
// Stocking up (for a festival, a bulk discount, or longer lead times) locks cash
// in inventory. Shows the cash tied up, the carrying cost, and any bulk-discount
// saving - netting to whether the build-up pays for itself.
function InventoryBuildupImpact() {
  const fc = formatCurrency;
  const live = useLiveMonthly();

  const [monthlyCogsInput, setCogs] = useState(""); // monthly cost of goods
  const [dioOld, setDioOld]   = useState("30");     // current days inventory
  const [dioNew, setDioNew]   = useState("60");     // target days inventory
  const [carryPct, setCarry]  = useState("22");     // annual carrying cost % (capital + storage + spoilage)
  const [discountPct, setDisc] = useState("4");     // bulk purchase discount %
  const [cashInput, setCash]  = useState("");

  // Default monthly COGS ≈ 60% of monthly cost if not entered.
  const suggestedCogs = Math.round(live.monthlyCost * 0.6);
  const monthlyCogs = parseFloat(monthlyCogsInput) || suggestedCogs;
  const dailyCogs   = monthlyCogs * 12 / 365;
  const dDio   = (parseFloat(dioNew) || 0) - (parseFloat(dioOld) || 0); // extra days of stock
  const carry  = (parseFloat(carryPct) || 0) / 100;
  const disc   = (parseFloat(discountPct) || 0) / 100;
  const cash   = parseFloat(cashInput) || live.cashOnHand;

  const cashLocked   = dDio * dailyCogs;                       // one-time cash tied up
  const carryingCost = cashLocked * carry;                     // annual carrying cost of the extra stock
  const bulkSaving   = monthlyCogs * 12 * disc;                // annual saving from buying more at a discount
  const netAnnual    = bulkSaving - carryingCost;              // +ve = build-up pays off
  const cashAfter    = Math.max(0, cash - cashLocked);
  const worthwhile   = netAnnual >= 0;
  const affordsIt    = cashLocked <= cash;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Inventory Build-up Cash Impact</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Monthly COGS (₹)</label><input type="number" value={monthlyCogsInput} onChange={e => setCogs(e.target.value)} placeholder={`Auto: ${fc(suggestedCogs)}`} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Days inventory - now</label><input type="number" value={dioOld} onChange={e => setDioOld(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Days inventory - target</label><input type="number" value={dioNew} onChange={e => setDioNew(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Carrying cost % / yr</label><input type="number" value={carryPct} onChange={e => setCarry(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Bulk discount %</label><input type="number" value={discountPct} onChange={e => setDisc(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cash on hand (₹)</label><input type="number" value={cashInput} onChange={e => setCash(e.target.value)} placeholder={`Auto: ${fc(live.cashOnHand)}`} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Cash locked = extra days of stock × daily COGS. Carrying cost covers tied-up capital, storage and spoilage. Bulk discount applies on annual purchases.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cash locked up", value: fc(Math.round(cashLocked)), color: "text-red-400" },
          { label: "Carrying cost / yr", value: fc(Math.round(carryingCost)), color: "text-orange-400" },
          { label: "Bulk saving / yr", value: fc(Math.round(bulkSaving)), color: "text-green-400" },
          { label: "Net annual benefit", value: `${netAnnual >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(netAnnual)))}`, color: netAnnual >= 0 ? "text-green-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Now", "After build-up"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Days of inventory", b: `${parseFloat(dioOld) || 0} d`, a: `${parseFloat(dioNew) || 0} d` },
              { label: "Inventory value", b: fc(Math.round((parseFloat(dioOld) || 0) * dailyCogs)), a: fc(Math.round((parseFloat(dioNew) || 0) * dailyCogs)) },
              { label: "Cash on hand", b: fc(Math.round(cash)), a: fc(Math.round(cashAfter)) },
              { label: "Net annual benefit", b: "-", a: `${netAnnual >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(netAnnual)))}`, bold: true },
            ].map(row => (
              <tr key={row.label} className={`border-b border-[var(--color-border)] last:border-0 ${row.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${!affordsIt ? "border-red-800/40 bg-red-950/20" : worthwhile ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
        <p className={`text-sm font-bold ${!affordsIt ? "text-red-400" : worthwhile ? "text-green-400" : "text-orange-400"}`}>
          {!affordsIt
            ? `⚠ Building to ${parseFloat(dioNew) || 0} days locks ${fc(Math.round(cashLocked))} - more than your ${fc(Math.round(cash))} cash. Scale the build-up back or fund it with a working-capital line.`
            : worthwhile
              ? `✓ The bulk discount (${fc(Math.round(bulkSaving))}/yr) beats the carrying cost (${fc(Math.round(carryingCost))}/yr) by ${fc(Math.round(netAnnual))} - the build-up pays for itself. ${fc(Math.round(cashLocked))} of cash is tied up.`
              : `⚠ Carrying cost (${fc(Math.round(carryingCost))}/yr) exceeds the bulk saving (${fc(Math.round(bulkSaving))}/yr) by ${fc(Math.abs(Math.round(netAnnual)))}. Only build up if it's for demand/lead-time cover, not the discount.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Cash locked is a one-time balance-sheet shift; carrying and bulk-saving are annualised. Spoilage-heavy or fast-obsolescing stock carries far higher real holding cost.</p>
    </div>
  );
}

// ── #105 FX-RATE SHOCK (EXPORTERS / IMPORTERS) ──────────────────────────────
// For businesses with USD-denominated revenue or costs: shocks the INR/USD rate
// and shows the rupee P&L swing, plus the natural hedge from any USD costs.
function FxRateShock() {
  const fc = formatCurrency;
  const [usdRevenue, setUsdRev]  = useState("50000");  // monthly USD inflow (exports)
  const [usdCost, setUsdCost]    = useState("12000");  // monthly USD outflow (imported inputs)
  const [rateNow, setRateNow]    = useState("83");     // current INR per USD
  const [shockPct, setShock]     = useState("-6");     // % move in INR/USD (− = rupee strengthens)
  const [marginPct, setMargin]   = useState("35");     // INR contribution margin %

  const usdRev = parseFloat(usdRevenue) || 0;
  const usdC   = parseFloat(usdCost) || 0;
  const rate   = parseFloat(rateNow) || 0;
  const shock  = (parseFloat(shockPct) || 0) / 100;
  const margin = (parseFloat(marginPct) || 0) / 100;

  const newRate = rate * (1 + shock);
  const netUsd  = usdRev - usdC;                       // net USD exposure (export-led if +ve)

  const inrNow  = netUsd * rate;
  const inrNew  = netUsd * newRate;
  const monthlySwing = inrNew - inrNow;                // +ve = gain in rupee terms
  const annualSwing  = monthlySwing * 12;
  const marginSwing  = monthlySwing * margin;          // flows partly to the bottom line via margin

  // Forward-cover cost rough proxy: hedging the net exposure removes the swing.
  const exposureInr = Math.abs(netUsd) * rate;
  const exporter = netUsd >= 0;
  const favourable = monthlySwing >= 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> FX-Rate Shock (Exporters / Importers)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">USD revenue / mo ($)</label><input type="number" value={usdRevenue} onChange={e => setUsdRev(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">USD cost / mo ($)</label><input type="number" value={usdCost} onChange={e => setUsdCost(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">INR per USD - now</label><input type="number" value={rateNow} onChange={e => setRateNow(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Rate move % (− = ₹ strengthens)</label><input type="number" value={shockPct} onChange={e => setShock(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Contribution margin %</label><input type="number" value={marginPct} onChange={e => setMargin(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Net USD exposure = USD revenue − USD cost. A rupee fall (+%) lifts exporter rupee receipts; a rupee rise (−%) cuts them. USD costs are a natural hedge.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Net USD exposure", value: `$${Math.round(netUsd).toLocaleString("en-IN")}`, color: exporter ? "text-green-400" : "text-orange-400" },
          { label: "New rate", value: `₹${newRate.toFixed(2)}`, color: "text-[var(--color-text)]" },
          { label: "Monthly ₹ swing", value: `${favourable ? "+" : "−"}${fc(Math.abs(Math.round(monthlySwing)))}`, color: favourable ? "text-green-400" : "text-red-400" },
          { label: "Annual ₹ swing", value: `${favourable ? "+" : "−"}${fc(Math.abs(Math.round(annualSwing)))}`, color: favourable ? "text-green-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "At ₹" + rate.toFixed(2), "At ₹" + newRate.toFixed(2)].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "USD revenue in ₹", b: fc(Math.round(usdRev * rate)), a: fc(Math.round(usdRev * newRate)) },
              { label: "USD cost in ₹",    b: fc(Math.round(usdC * rate)),   a: fc(Math.round(usdC * newRate)) },
              { label: "Net ₹ from FX",    b: fc(Math.round(inrNow)),        a: fc(Math.round(inrNew)) },
              { label: "Margin impact / mo", b: "-", a: `${marginSwing >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(marginSwing)))}`, bold: true },
            ].map(row => (
              <tr key={row.label} className={`border-b border-[var(--color-border)] last:border-0 ${row.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.b}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${favourable ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${favourable ? "text-green-400" : "text-red-400"}`}>
          {favourable
            ? `✓ This ${Math.abs(shock * 100).toFixed(0)}% rate move adds ${fc(Math.round(annualSwing))}/yr in rupee terms on your $${Math.round(netUsd).toLocaleString("en-IN")} net exposure. Consider booking forwards to lock the gain.`
            : `⚠ This ${Math.abs(shock * 100).toFixed(0)}% rate move costs ${fc(Math.abs(Math.round(annualSwing)))}/yr on your $${Math.round(netUsd).toLocaleString("en-IN")} net exposure (${fc(Math.round(exposureInr))} at risk). A forward or option hedge would cap this downside.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A single-rate sensitivity, not a hedge price. Forward/option premiums, settlement timing and GIFT-City routing aren't priced here - confirm cover with your banker.</p>
    </div>
  );
}

// ── AUTOMATION-INVESTMENT ROI ────────────────────────────────────────────────
// One-time tool/automation spend vs the recurring labour hours it frees, with
// payback period, annual net saving and a 3-year ROI.
function AutomationRoiScenario() {
  const fc = formatCurrency;
  const [upfront, setUpfront]   = useState("200000"); // one-time build/licence
  const [monthly, setMonthly]   = useState("8000");   // recurring subscription/upkeep
  const [hours, setHours]       = useState("60");     // labour hours saved / month
  const [wage, setWage]         = useState("400");    // fully-loaded cost / hour

  const up   = parseFloat(upfront) || 0;
  const mo   = parseFloat(monthly) || 0;
  const hrs  = parseFloat(hours) || 0;
  const wg   = parseFloat(wage) || 0;

  const grossSaving = hrs * wg;            // labour value freed / month
  const netSaving   = grossSaving - mo;    // after recurring upkeep
  const paybackMo   = netSaving > 0 ? up / netSaving : Infinity;
  const annualNet   = netSaving * 12;
  const threeYrNet  = netSaving * 36 - up;
  const roi3yr      = up > 0 ? (threeYrNet / up) * 100 : 0;
  const worth       = netSaving > 0 && threeYrNet > 0;
  const paybackLbl  = paybackMo === Infinity ? "never" : `${paybackMo.toFixed(1)} mo`;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Bot size={14} className="text-[var(--color-primary)]" /> Automation-Investment ROI</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Upfront cost (₹)</label><input type="number" value={upfront} onChange={e => setUpfront(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Recurring cost / mo (₹)</label><input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Hours saved / mo</label><input type="number" value={hours} onChange={e => setHours(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Loaded cost / hour (₹)</label><input type="number" value={wage} onChange={e => setWage(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Net monthly saving = (hours saved × loaded hourly cost) − recurring upkeep. Payback = upfront ÷ net monthly saving.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Labour value freed", value: `${fc(Math.round(grossSaving))}/mo`, color: "text-[var(--color-text)]" },
          { label: "Net saving", value: netSaving >= 0 ? `${fc(Math.round(netSaving))}/mo` : `−${fc(Math.abs(Math.round(netSaving)))}/mo`, color: netSaving >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Payback period", value: paybackLbl, color: paybackMo <= 12 ? "text-green-400" : paybackMo === Infinity ? "text-red-400" : "text-orange-400" },
          { label: "3-year ROI", value: `${roi3yr >= 0 ? "+" : "−"}${Math.abs(roi3yr).toFixed(0)}%`, color: roi3yr >= 0 ? "text-green-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Horizon", "Cumulative cost", "Cumulative saving", "Net"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[12, 24, 36].map(m => {
              const cost = up + mo * m;
              const save = grossSaving * m;
              const net  = save - cost;
              return (
                <tr key={m} className={`border-b border-[var(--color-border)] last:border-0 ${m === 36 ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                  <td className="px-4 py-2.5">{m} months</td>
                  <td className="px-4 py-2.5 tabular-nums">{fc(Math.round(cost))}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fc(Math.round(save))}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{net >= 0 ? "+" : "−"}{fc(Math.abs(Math.round(net)))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${worth ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${worth ? "text-green-400" : "text-red-400"}`}>
          {worth
            ? `✓ This automation pays for itself in ${paybackLbl} and nets ${fc(Math.round(annualNet))}/yr - a clear win at these volumes.`
            : `⚠ Net saving is ${fc(Math.round(netSaving))}/mo - the upkeep eats the gain. Increase hours saved or cut recurring cost before committing.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Assumes freed hours convert to real cost savings (redeployment or headcount avoidance). Ramp-up, training time and reliability risk aren't modelled.</p>
    </div>
  );
}

// ── CHURN-INCREASE IMPACT ────────────────────────────────────────────────────
// Shows how a rise in monthly churn shortens average customer lifetime and
// erodes recurring revenue + lifetime value.
function ChurnIncreaseImpact() {
  const fc = formatCurrency;
  const [customers, setCustomers] = useState("400");
  const [arpu, setArpu]           = useState("3000");  // monthly revenue / customer
  const [churn, setChurn]         = useState("3");     // current monthly churn %
  const [delta, setDelta]         = useState("2");     // additional churn points

  const n     = parseFloat(customers) || 0;
  const arpuV = parseFloat(arpu) || 0;
  const c0    = (parseFloat(churn) || 0) / 100;
  const c1    = Math.min(1, c0 + (parseFloat(delta) || 0) / 100);

  const life  = (c: number) => c > 0 ? 1 / c : Infinity;        // avg lifetime (months)
  const ltv   = (c: number) => c > 0 ? arpuV / c : Infinity;    // simple LTV
  const life0 = life(c0), life1 = life(c1);
  const ltv0  = ltv(c0),  ltv1 = ltv(c1);

  // Customers lost in month 1 from the higher churn, and the MRR they take.
  const extraLost   = n * (c1 - c0);
  const mrr0        = n * arpuV;
  const mrrAfter12  = arpuV * n * Math.pow(1 - c1, 12);
  const mrrBase12   = arpuV * n * Math.pow(1 - c0, 12);
  const mrrGap12    = mrrBase12 - mrrAfter12;
  const lifeLbl     = (m: number) => m === Infinity ? "∞" : `${m.toFixed(1)} mo`;
  const ltvLbl      = (v: number) => v === Infinity ? "∞" : fc(Math.round(v));
  const severe      = c1 - c0 > 0 && mrrGap12 > mrr0 * 0.1;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><HeartCrack size={14} className="text-[var(--color-primary)]" /> Churn-Increase Impact</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Active customers</label><input type="number" value={customers} onChange={e => setCustomers(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Revenue / customer / mo (₹)</label><input type="number" value={arpu} onChange={e => setArpu(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Current churn % / mo</label><input type="number" value={churn} onChange={e => setChurn(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Churn increase (pts)</label><input type="number" value={delta} onChange={e => setDelta(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Avg lifetime ≈ 1 ÷ monthly churn. LTV ≈ monthly revenue ÷ churn (no discounting). Going from {(c0 * 100).toFixed(1)}% to {(c1 * 100).toFixed(1)}% churn.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Avg lifetime after", value: lifeLbl(life1), color: "text-orange-400" },
          { label: "LTV after", value: ltvLbl(ltv1), color: "text-red-400" },
          { label: "Extra lost / mo", value: `${Math.round(extraLost)} cust`, color: "text-red-400" },
          { label: "MRR gap by mo 12", value: `−${fc(Math.round(mrrGap12))}`, color: "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Metric", "Current churn", "Higher churn"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Monthly churn", b: `${(c0 * 100).toFixed(1)}%`, a: `${(c1 * 100).toFixed(1)}%` },
              { label: "Avg lifetime", b: lifeLbl(life0), a: lifeLbl(life1) },
              { label: "LTV / customer", b: ltvLbl(ltv0), a: ltvLbl(ltv1) },
              { label: "MRR after 12 mo", b: fc(Math.round(mrrBase12)), a: fc(Math.round(mrrAfter12)), bold: true },
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

      <div className={`rounded-lg p-4 border ${severe ? "border-red-800/40 bg-red-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
        <p className={`text-sm font-bold ${severe ? "text-red-400" : "text-orange-400"}`}>
          {severe
            ? `⚠ A ${(parseFloat(delta) || 0)}-point churn rise cuts avg lifetime to ${lifeLbl(life1)} and drains ${fc(Math.round(mrrGap12))} of MRR within a year. Retention is now your highest-leverage lever.`
            : `A ${(parseFloat(delta) || 0)}-point churn rise trims lifetime to ${lifeLbl(life1)} - manageable, but watch the LTV/CAC ratio as it compounds.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Simple geometric-decay model with no new-customer acquisition or discounting. Cohort behaviour and seasonality aren't modelled - use as a directional sensitivity.</p>
    </div>
  );
}

// ── CAPACITY-EXPANSION MODEL ─────────────────────────────────────────────────
// Adding production/service capacity: incremental fixed + variable cost vs the
// extra revenue at a given utilisation, with payback on the expansion outlay.
function CapacityExpansionModel() {
  const fc = formatCurrency;
  const [outlay, setOutlay]     = useState("1500000"); // one-time expansion capex
  const [addUnits, setAddUnits] = useState("300");     // extra units/mo at full use
  const [util, setUtil]         = useState("70");      // expected utilisation %
  const [price, setPrice]       = useState("1200");
  const [varCost, setVar]       = useState("700");     // variable cost / unit
  const [fixedAdd, setFixedAdd] = useState("90000");   // extra fixed cost / mo

  const cap   = parseFloat(outlay) || 0;
  const units = parseFloat(addUnits) || 0;
  const u     = (parseFloat(util) || 0) / 100;
  const P     = parseFloat(price) || 0;
  const V     = parseFloat(varCost) || 0;
  const fixed = parseFloat(fixedAdd) || 0;

  const realUnits   = units * u;
  const contrib     = P - V;
  const addRevenue  = realUnits * P;
  const addProfit   = realUnits * contrib - fixed;
  const paybackMo   = addProfit > 0 ? cap / addProfit : Infinity;
  const breakEvenU  = contrib > 0 ? fixed / contrib : Infinity;          // units/mo to cover added fixed
  const breakEvenUtil = units > 0 && breakEvenU !== Infinity ? (breakEvenU / units) * 100 : Infinity;
  const annualProfit  = addProfit * 12;
  const worth       = addProfit > 0 && paybackMo <= 36;
  const paybackLbl  = paybackMo === Infinity ? "never" : `${paybackMo.toFixed(1)} mo`;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Capacity-Expansion Model</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Expansion capex (₹)</label><input type="number" value={outlay} onChange={e => setOutlay(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Added units / mo (full)</label><input type="number" value={addUnits} onChange={e => setAddUnits(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Expected utilisation %</label><input type="number" value={util} onChange={e => setUtil(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Price / unit (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Variable cost / unit (₹)</label><input type="number" value={varCost} onChange={e => setVar(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Added fixed cost / mo (₹)</label><input type="number" value={fixedAdd} onChange={e => setFixedAdd(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Real output = added capacity × utilisation. Added profit / mo = real units × (price − variable cost) − added fixed cost.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Added revenue", value: `${fc(Math.round(addRevenue))}/mo`, color: "text-[var(--color-text)]" },
          { label: "Added profit", value: addProfit >= 0 ? `${fc(Math.round(addProfit))}/mo` : `−${fc(Math.abs(Math.round(addProfit)))}/mo`, color: addProfit >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Payback", value: paybackLbl, color: paybackMo <= 24 ? "text-green-400" : paybackMo === Infinity ? "text-red-400" : "text-orange-400" },
          { label: "Break-even util.", value: breakEvenUtil === Infinity ? "n/a" : `${breakEvenUtil.toFixed(0)}%`, color: "text-[var(--color-muted)]" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Utilisation", "Units / mo", "Added profit / mo", "Payback"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[0.5, 0.7, 0.9, 1].map(uu => {
              const ru = units * uu;
              const prof = ru * contrib - fixed;
              const pb = prof > 0 ? cap / prof : Infinity;
              return (
                <tr key={uu} className={`border-b border-[var(--color-border)] last:border-0 ${Math.abs(uu - u) < 0.001 ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                  <td className="px-4 py-2.5">{(uu * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{Math.round(ru)}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${prof >= 0 ? "text-green-400" : "text-red-400"}`}>{prof >= 0 ? "+" : "−"}{fc(Math.abs(Math.round(prof)))}</td>
                  <td className="px-4 py-2.5 tabular-nums">{pb === Infinity ? "never" : `${pb.toFixed(1)} mo`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${worth ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${worth ? "text-green-400" : "text-red-400"}`}>
          {worth
            ? `✓ At ${(u * 100).toFixed(0)}% utilisation the expansion adds ${fc(Math.round(annualProfit))}/yr and pays back in ${paybackLbl}. Demand cover above ${breakEvenUtil === Infinity ? "-" : `${breakEvenUtil.toFixed(0)}%`} keeps it profitable.`
            : `⚠ At ${(u * 100).toFixed(0)}% utilisation this expansion ${addProfit < 0 ? "loses money" : `pays back only in ${paybackLbl}`}. You need utilisation above ${breakEvenUtil === Infinity ? "-" : `${breakEvenUtil.toFixed(0)}%`} just to cover the added fixed cost.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Steady-state model - ramp-up to full utilisation, financing cost on the capex and demand risk aren't included. Stress-test the utilisation assumption above.</p>
    </div>
  );
}

// ── COST-INFLATION PASSTHROUGH ───────────────────────────────────────────────
// An input-cost rise: how much of it you pass to price to protect margin, the
// price hike needed to fully recover, and the margin left if you absorb it.
function CostInflationPassthrough() {
  const fc = formatCurrency;
  const [price, setPrice]       = useState("1000");
  const [cost, setCost]         = useState("650");   // current variable cost / unit
  const [inflPct, setInfl]      = useState("12");    // input-cost rise %
  const [passPct, setPass]      = useState("60");    // % of cost rise passed to price
  const [units, setUnits]       = useState("800");

  const P     = parseFloat(price) || 0;
  const C     = parseFloat(cost) || 0;
  const infl  = (parseFloat(inflPct) || 0) / 100;
  const pass  = (parseFloat(passPct) || 0) / 100;
  const q     = parseFloat(units) || 0;

  const newCost   = C * (1 + infl);
  const costRise  = newCost - C;
  const newPrice  = P + costRise * pass;          // pass a share of the ₹ rise
  const fullPrice = P + costRise;                 // full passthrough price
  const fullHikePct = P > 0 ? (costRise / P) * 100 : 0;

  const oldMargin   = P - C;
  const newMargin   = newPrice - newCost;          // margin if you partially pass
  const absorbMargin = P - newCost;                // margin if you absorb fully
  const oldMarginPct = P > 0 ? (oldMargin / P) * 100 : 0;
  const newMarginPct = newPrice > 0 ? (newMargin / newPrice) * 100 : 0;

  const oldProfit  = oldMargin * q;
  const newProfit  = newMargin * q;
  const profitDiff = newProfit - oldProfit;
  const protectsMargin = newMargin >= oldMargin - 0.005 * P;
  const priceUpPct = P > 0 ? ((newPrice - P) / P) * 100 : 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className={`${CARD} space-y-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Flame size={14} className="text-[var(--color-primary)]" /> Cost-Inflation Passthrough</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Price / unit (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Input cost / unit (₹)</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Cost inflation %</label><input type="number" value={inflPct} onChange={e => setInfl(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Passthrough %</label><input type="number" value={passPct} onChange={e => setPass(e.target.value)} className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Units / mo</label><input type="number" value={units} onChange={e => setUnits(e.target.value)} className={INP} /></div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Cost rises {fc(Math.round(costRise))}/unit. Passing {(pass * 100).toFixed(0)}% lifts price to {fc(Math.round(newPrice))}. Full recovery needs a {fullHikePct.toFixed(1)}% hike to {fc(Math.round(fullPrice))}.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "New price", value: fc(Math.round(newPrice)), color: "text-[var(--color-text)]" },
          { label: "Price hike", value: `+${priceUpPct.toFixed(1)}%`, color: "text-orange-400" },
          { label: "Margin after", value: `${newMarginPct.toFixed(1)}%`, color: protectsMargin ? "text-green-400" : "text-red-400" },
          { label: "Profit change", value: `${profitDiff >= 0 ? "+" : "−"}${fc(Math.abs(Math.round(profitDiff)))}`, color: profitDiff >= 0 ? "text-green-400" : "text-red-400" },
        ].map(card => (
          <div key={card.label} className={CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-0 overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Strategy", "Price", "Margin / unit", "Margin %"].map(h => <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {[
              { label: "Before inflation", pr: P, mg: oldMargin, mp: oldMarginPct },
              { label: "Absorb fully", pr: P, mg: absorbMargin, mp: P > 0 ? (absorbMargin / P) * 100 : 0 },
              { label: `Pass ${(pass * 100).toFixed(0)}%`, pr: newPrice, mg: newMargin, mp: newMarginPct, bold: true },
              { label: "Full passthrough", pr: fullPrice, mg: fullPrice - newCost, mp: fullPrice > 0 ? ((fullPrice - newCost) / fullPrice) * 100 : 0 },
            ].map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(Math.round(r.pr))}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(Math.round(r.mg))}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.mp.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 border ${protectsMargin ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
        <p className={`text-sm font-bold ${protectsMargin ? "text-green-400" : "text-red-400"}`}>
          {protectsMargin
            ? `✓ Passing ${(pass * 100).toFixed(0)}% holds margin near ${newMarginPct.toFixed(1)}% with only a ${priceUpPct.toFixed(1)}% price rise - likely palatable to customers.`
            : `⚠ Passing only ${(pass * 100).toFixed(0)}% drops margin to ${newMarginPct.toFixed(1)}% and cuts profit by ${fc(Math.abs(Math.round(profitDiff)))}/mo. Full recovery needs a ${fullHikePct.toFixed(1)}% hike - test price sensitivity first.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Holds volume constant - a real price rise may reduce demand (see the Price-Change Profit tool for the elasticity trade-off). Models variable cost only.</p>
    </div>
  );
}
