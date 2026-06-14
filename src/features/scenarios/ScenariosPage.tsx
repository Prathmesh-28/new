import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Sliders, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Zap, Copy } from "lucide-react";
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

export default function ScenariosPage() {
  const { store } = useApp();
  const navigate  = useNavigate();
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

  const base = useMemo(() => runForecast(store, { horizonDays: HORIZON, numSims: 600 }), [store]);
  const scen = useMemo(() => runForecast(store, { horizonDays: HORIZON, numSims: 600, scenarios }), [store, scenarios]);

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
    </div>
  );
}
