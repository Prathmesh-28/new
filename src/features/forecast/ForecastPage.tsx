import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { runForecast, generateForecast } from "@/lib/forecastEngine";
import { monthlyAggregates, cmgr, monthlyCashFlow } from "@/lib/finance";
import { scheduleReminders, cancelReminders } from "@/lib/nativeFeatures";
import { isNative } from "@/lib/mobile";
import {
  Plus, Trash2, Eye, EyeOff, TrendingUp, RefreshCw, Sparkles, X,
  CalendarRange, Coins, Waves, GitBranch, ShieldAlert, Activity,
  AlertTriangle, CheckCircle2,
  LineChart, Receipt, Users, Flame, Layers, ArrowLeftRight, Scale, Target,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Line, ComposedChart, ReferenceLine, Bar, Cell,
} from "recharts";
import { format } from "date-fns";
import { SeriesLegend, useSeriesToggle } from "@/components/charts/ChartKit";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Scenario, CashObligation, Transaction } from "@/data/types";

export default function ForecastPage() {
  const { store, addScenario, deleteScenario, updateScenario, addObligation, deleteObligation, setStore, isReadOnly } = useApp();
  const { forecast, scenarios, obligations, transactions, bankAccounts, firm } = store;
  const [generating, setGenerating] = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [showOblForm, setShowOblForm] = useState(false);
  const [scenarioType, setScenarioType] = useState<Scenario["type"]>("new_hire");
  const [name,      setName]      = useState("");
  const [amount,    setAmount]    = useState("");
  const [startDate, setStartDate] = useState("");
  const [oblName,   setOblName]   = useState("");
  const [oblAmount, setOblAmount] = useState("");
  const [oblDate,   setOblDate]   = useState("");
  const [slowPct,   setSlowPct]   = useState(100);
  const [burnFactor, setBurnFactor] = useState(100);
  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiText,    setAiText]    = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [fcTab, setFcTab] = useState<
    "main" | "13week" | "ar-inflow" | "seasonality" | "three-line" | "buffer-alert"
    | "revenue-forecast" | "expense-forecast" | "headcount-cost" | "burn-zero-cash"
    | "cash-bridge" | "ar-ap-timing" | "fixed-variable" | "break-even"
  >("main");

  const navigate = useNavigate();
  const activeScenario = scenarios.find(s => s.active);
  const { hidden, toggle } = useSeriesToggle();

  // Live probabilistic forecast — scenarios + slow-month baked into BOTH bands
  // (honest), via the Monte-Carlo engine. Risk metrics come from the same paths.
  const result = useMemo(
    () => runForecast(store, { scenarios: scenarios.filter(s => s.active), revenueFactor: slowPct / 100, burnFactor: burnFactor / 100 }),
    [store, scenarios, slowPct, burnFactor],
  );
  const risk = result.risk;
  const pressureDay = risk.expectedTimeToBreachDays;

  const chartData = result.points.map(f => ({
    date: format(new Date(f.date), "MMM d"),
    p50: Math.round(f.p50 / 100000),
    p10: Math.round(f.p10 / 100000),
    p90: Math.round(f.p90 / 100000),
  }));

  // Map obligations to x-axis values that exist in chartData
  const chartDates  = new Set(chartData.map(d => d.date));
  const oblMarkers  = obligations.map(o => ({
    ...o,
    chartDate: format(new Date(o.dueDate), "MMM d"),
  })).filter(o => chartDates.has(o.chartDate));

  // Auto-add GSTR-3B obligation when GST is enabled (run after any forecast generation)
  const autoAddGSTObligation = () => {
    if (!firm.gstRegistered || !firm.gstRate) return;
    const now       = new Date();
    const lastM     = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMStr  = `${lastM.getFullYear()}-${String(lastM.getMonth() + 1).padStart(2, "0")}`;
    const revenue   = transactions.filter(t => t.amount > 0 && t.date.startsWith(lastMStr)).reduce((s, t) => s + t.amount, 0);
    if (revenue <= 0) return;
    const liability = Math.round(revenue * (firm.gstRate / 100));
    // GSTR-3B is due on the 20th of the current month for last month's returns
    const due = new Date(now.getFullYear(), now.getMonth(), 20);
    if (due < now) { due.setMonth(due.getMonth() + 1); } // already passed → next month
    const dueStr = due.toISOString().split("T")[0];
    const name   = `GSTR-3B (${lastM.toLocaleString("en-IN", { month: "short" })})`;
    setStore(s => {
      const alreadyExists = s.obligations.some(o => o.name === name);
      if (alreadyExists) return s;
      return { ...s, obligations: [...s.obligations, { id: generateId(), name, amount: liability, dueDate: dueStr, type: "tax" as const }] };
    });
  };

  const handleGenerate = async () => {
    if (transactions.length === 0) {
      toast.error("Add some transactions first — the forecast engine needs transaction history.");
      return;
    }
    setGenerating(true);
    try {
      // The deterministic client engine owns forecasting (Monte-Carlo P10/P50/P90).
      // We store the BASE forecast (no scenarios) for the dashboard; the page chart
      // recomputes live with active scenarios + slow-month baked in.
      const base = generateForecast(store);
      setStore(s => ({ ...s, forecast: base }));
      toast.success("90-day probabilistic forecast generated");
    } finally {
      autoAddGSTObligation();
      setGenerating(false);
    }
  };

  const handleAddScenario = () => {
    if (!name || !amount) { toast.error("Fill in scenario name and amount"); return; }
    addScenario({ id: generateId(), name, type: scenarioType, active: false, params: { amount: Number(amount), startDate }, createdAt: new Date().toISOString() });
    toast.success("Scenario saved");
    setShowForm(false); setName(""); setAmount(""); setStartDate("");
  };

  const handleAddObligation = () => {
    if (!oblName || !oblAmount || !oblDate) { toast.error("Fill all obligation fields"); return; }
    addObligation({ id: generateId(), name: oblName, amount: Number(oblAmount), dueDate: oblDate, type: "other" });
    toast.success("Obligation added");
    setShowOblForm(false); setOblName(""); setOblAmount(""); setOblDate("");
  };

  // Schedule on-device reminders 1 day before each upcoming obligation (native).
  const handleRemindMe = async () => {
    const reminders = obligations
      .map((o, i) => ({ id: 7100 + i, title: `${o.name} due tomorrow`, body: `${formatCurrency(o.amount)} · ${o.type}`, at: new Date(new Date(o.dueDate).getTime() - 86_400_000) }))
      .filter(r => r.at.getTime() > Date.now());
    await cancelReminders(reminders.map(r => r.id));
    const n = await scheduleReminders(reminders);
    toast.success(n > 0 ? `${n} on-device reminder${n > 1 ? "s" : ""} set` : "No upcoming obligations to remind about");
  };

  const handleAiExplain = async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiText("");
    try {
      const balance = bankAccounts.reduce((a, b) => a + b.balance, 0);
      const runway  = pressureDay != null ? `${pressureDay} days` : "90+ days";
      const burn    = transactions.filter(t => t.amount < 0).reduce((a, t) => a + t.amount, 0) / Math.max(1, transactions.length / 30);
      const context = `Balance: ₹${(balance / 100000).toFixed(1)}L. Monthly burn: ₹${(Math.abs(burn) / 100000).toFixed(1)}L. P10 runway: ${runway}. Active scenario: ${activeScenario?.name ?? "none"}.`;
      const res = await api.post<{ content: string }>("/api/ai/ask", {
        system: "You are a cash flow advisor for an Indian SMB. Be concise, practical, and use INR terminology. 3-4 sentences max.",
        messages: [{ role: "user", content: `Explain this forecast and give 2 actionable suggestions: ${context}` }],
      });
      setAiText(res.content ?? "No response from AI.");
    } catch {
      setAiText("AI unavailable — check that ANTHROPIC_API_KEY is set on the backend.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cash Flow Forecast</h1>
        <div className="flex items-center gap-2">
          {forecast.length > 0 && (
            <button onClick={handleAiExplain}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg font-medium hover:text-[var(--color-text)] hover:border-[var(--color-primary)]">
              <Sparkles size={12} /> Ask AI
            </button>
          )}
          {isNative() && obligations.length > 0 && (
            <button onClick={handleRemindMe}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg font-medium hover:text-[var(--color-text)] hover:border-[var(--color-primary)]">
              🔔 Remind me
            </button>
          )}
          <button onClick={handleGenerate} disabled={generating || isReadOnly}
            title={isReadOnly ? "Read-only in client view" : undefined}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
            {generating ? "Generating…" : forecast.length ? "Refresh" : "Generate Forecast"}
          </button>
        </div>
      </div>

      {/* Tool tab selector */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 overflow-x-auto">
        {([
          ["main", "Probabilistic", TrendingUp],
          ["13week", "13-Week Rolling", CalendarRange],
          ["ar-inflow", "AR Inflow Projection", Coins],
          ["seasonality", "Seasonality", Waves],
          ["three-line", "Best / Base / Worst", GitBranch],
          ["buffer-alert", "Buffer Alert", ShieldAlert],
          ["revenue-forecast", "Revenue Forecast", LineChart],
          ["expense-forecast", "Expense Forecast", Receipt],
          ["headcount-cost", "Headcount Cost", Users],
          ["burn-zero-cash", "Burn & Zero-Cash", Flame],
          ["cash-bridge", "Cash Bridge", Layers],
          ["ar-ap-timing", "AR / AP Timing", ArrowLeftRight],
          ["fixed-variable", "Fixed vs Variable", Scale],
          ["break-even", "Break-Even Date", Target],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setFcTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors whitespace-nowrap ${fcTab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {fcTab === "13week"       && <ThirteenWeekForecast />}
      {fcTab === "ar-inflow"    && <ReceivablesInflowProjection />}
      {fcTab === "seasonality"  && <SeasonalityDetector />}
      {fcTab === "three-line"   && <ThreeLineProjection />}
      {fcTab === "buffer-alert" && <CashBufferAlert />}
      {fcTab === "revenue-forecast" && <RevenueForecast />}
      {fcTab === "expense-forecast" && <ExpenseForecast />}
      {fcTab === "headcount-cost"   && <HeadcountCostForecast />}
      {fcTab === "burn-zero-cash"   && <BurnRateZeroCash />}
      {fcTab === "cash-bridge"      && <CashBridgeWaterfall />}
      {fcTab === "ar-ap-timing"     && <ArApTimingForecast />}
      {fcTab === "fixed-variable"   && <FixedVariableProjection />}
      {fcTab === "break-even"       && <BreakEvenForecast />}

      {fcTab === "main" && <>

      {/* AI explanation panel */}
      {aiOpen && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 relative">
          <button onClick={() => setAiOpen(false)} className="absolute top-3 right-3 text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <X size={14} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={13} className="text-[var(--color-primary)]" />
            <p className="text-xs font-semibold text-[var(--color-primary)]">AI Forecast Insight</p>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              Analysing your forecast…
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text)] leading-relaxed">{aiText}</p>
          )}
        </div>
      )}

      {/* Empty state */}
      {forecast.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <TrendingUp size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No forecast yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-xs mx-auto">
            Add transactions in the Dashboard, then generate your 90-day P10/P50/P90 forecast.
          </p>
          <button onClick={handleGenerate} disabled={generating}
            className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40">
            {generating ? "Generating…" : "Generate Forecast"}
          </button>
        </div>
      ) : (
        <>
          {/* Risk strip — calibrated probabilities from the Monte-Carlo paths */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Breach probability", value: `${Math.round(risk.probBreach * 100)}%`, sub: `of dipping below your ${firm.safetyThresholdDays}-day buffer`, danger: risk.probBreach >= 0.3 },
              { label: "Expected time to pressure", value: pressureDay != null ? `${pressureDay}d` : "90+d", sub: risk.p10TimeToBreachDays != null ? `as early as ${risk.p10TimeToBreachDays}d (worst 10%)` : "no breach in 90d", danger: pressureDay != null && pressureDay <= 45 },
              { label: "Cash-Flow-at-Risk (95%)", value: `₹${(risk.cfar95 / 100000).toFixed(1)}L`, sub: "worst-case drawdown to the trough", danger: false },
              { label: "Likely runway", value: risk.runwayDist.p50 >= 90 ? "90+ days" : `${risk.runwayDist.p50} days`, sub: `worst-case ${risk.runwayDist.p10 >= 90 ? "90+" : risk.runwayDist.p10}d`, danger: risk.runwayDist.p10 < 30 },
            ].map(m => (
              <div key={m.label} className={`rounded-lg border p-3 ${m.danger ? "border-red-800/40 bg-red-950/20" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{m.label}</p>
                <p className={`text-xl font-bold tabular-nums mt-0.5 ${m.danger ? "text-red-400" : "text-[var(--color-text)]"}`}>{m.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-tight">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Pressure alert — fires 45-day-early when the hazard says so */}
          {risk.probBreachByDay[Math.min(44, risk.probBreachByDay.length - 1)] >= 0.5 && (
            <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TrendingUp size={16} className="text-red-400 shrink-0" />
                <p className="text-sm">
                  <strong className="text-red-400">{Math.round(risk.probBreach * 100)}% chance</strong> you breach your safety buffer{pressureDay != null ? <> in ~<strong className="text-red-400">{pressureDay} days</strong></> : ""}.
                  {risk.expectedShortfall < risk.thresholdCash ? <> A <strong>₹{Math.round((risk.thresholdCash - risk.expectedShortfall) / 100000)}L</strong> buffer covers the likely shortfall — {result.capital.recommendedTrack.replace(/_/g, " ")} fits.</> : null}
                </p>
              </div>
              <button onClick={() => navigate("/credit")}
                className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-3 py-1.5 rounded-lg hover:bg-red-900/60 shrink-0 whitespace-nowrap">
                See options →
              </button>
            </div>
          )}

          {/* Chart */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 md:p-6">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h2 className="text-sm font-semibold">90-Day Projection (₹L)</h2>
              <SeriesLegend
                series={[
                  { key: "p90", label: "Best (P90)",  color: "#1A6B55" },
                  { key: "p50", label: "Expected (P50)", color: "#1A6B55" },
                  { key: "p10", label: "Worst (P10)", color: "#d97706" },
                ]}
                hidden={hidden}
                onToggle={toggle}
              />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={14} />
                <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number, name: string) => [`₹${v}L`, name.toUpperCase()]} />
                {!hidden.has("p90") && <Area type="monotone" dataKey="p90" name="p90" stroke="#1A6B55" strokeWidth={1} strokeDasharray="4 2" fill="#1A6B5510" animationDuration={400} />}
                {!hidden.has("p50") && <Area type="monotone" dataKey="p50" name="p50" stroke="#1A6B55" strokeWidth={2} fill="#1A6B5508" animationDuration={400} />}
                {!hidden.has("p10") && <Area type="monotone" dataKey="p10" name="p10" stroke="#d97706" strokeWidth={1} strokeDasharray="4 2" fill="transparent" animationDuration={400} />}
                {oblMarkers.map(o => (
                  <ReferenceLine key={o.id} x={o.chartDate} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1.5}
                    label={{ value: o.name, position: "insideTopRight", fontSize: 8, fill: "#ef4444" }} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-[var(--color-muted)] mt-2">
              Tap a band in the legend to toggle it.{oblMarkers.length > 0 && <span className="text-red-400"> Red lines = cash obligations due.</span>}
            </p>
          </div>

          {/* Slow month slider */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-1">Slow month — what's the worst case?</h2>
            <p className="text-xs text-[var(--color-muted)] mb-3">Drag revenue down and see your P10 impact immediately.</p>
            <div className="flex items-center gap-4">
              <input type="range" min="0" max="100" step="5" value={slowPct}
                onChange={e => setSlowPct(Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]" />
              <span className={`text-lg font-bold w-16 text-right ${slowPct < 50 ? "text-red-400" : slowPct < 80 ? "text-yellow-400" : "text-green-400"}`}>
                {slowPct}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-[var(--color-muted)] mt-1">
              <span>0% revenue</span>
              <span>{slowPct === 100 ? "Normal month — no adjustment" : `Revenue at ${slowPct}% — chart updated`}</span>
              <span>100% (base)</span>
            </div>
            {slowPct < 70 && (
              <div className="mt-3 text-xs bg-red-950/20 border border-red-800/40 rounded-lg px-3 py-2 text-red-400">
                A {100 - slowPct}% revenue drop significantly accelerates cash pressure. Consider a credit buffer now.
              </div>
            )}
          </div>

          {/* Burn rate inflation slider */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-1">Burn rate inflation — what if costs rise?</h2>
            <p className="text-xs text-[var(--color-muted)] mb-3">Drag to simulate higher or lower outflows and see the impact on your forecast.</p>
            <div className="flex items-center gap-4">
              <input type="range" min="80" max="150" step="5" value={burnFactor}
                onChange={e => setBurnFactor(Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]" />
              <span className={`text-lg font-bold w-16 text-right ${burnFactor > 120 ? "text-red-400" : burnFactor > 100 ? "text-yellow-400" : "text-green-400"}`}>
                {burnFactor}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-[var(--color-muted)] mt-1">
              <span>80% (leaner)</span>
              <span>{burnFactor === 100 ? "Normal burn — no adjustment" : `Burn at ${burnFactor}% — chart updated`}</span>
              <span>150% (higher burn)</span>
            </div>
            {burnFactor > 120 && (
              <div className="mt-3 text-xs bg-red-950/20 border border-red-800/40 rounded-lg px-3 py-2 text-red-400">
                A {burnFactor - 100}% cost increase significantly shortens your runway. Consider expense controls or a credit buffer.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scenarios */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Scenarios</h2>
                <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-1 rounded font-semibold hover:opacity-90">
                  <Plus size={12} /> Add
                </button>
              </div>
              {showForm && (
                <div className="mb-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-2">
                  <input placeholder="Scenario name" value={name} onChange={e => setName(e.target.value)}
                    className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  <select value={scenarioType} onChange={e => setScenarioType(e.target.value as Scenario["type"])}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none">
                    <option value="new_hire">New Hire</option>
                    <option value="contract_won">Contract Won</option>
                    <option value="loan_draw">Loan Draw</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input placeholder="Amount (₹)" type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <button onClick={handleAddScenario}
                    className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-1.5 rounded hover:opacity-90">Save</button>
                </div>
              )}
              <div className="space-y-2">
                {scenarios.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">{s.type} · {formatCurrency(Number((s.params as Record<string, unknown>).amount ?? 0))}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateScenario({ ...s, active: !s.active })} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                        {s.active ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button onClick={() => deleteScenario(s.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {scenarios.length === 0 && <p className="text-sm text-[var(--color-muted)] py-4 text-center">No scenarios yet</p>}
              </div>
            </div>

            {/* Obligations */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Cash Obligations</h2>
                <button onClick={() => setShowOblForm(v => !v)} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-1 rounded font-semibold hover:opacity-90">
                  <Plus size={12} /> Add
                </button>
              </div>
              {showOblForm && (
                <div className="mb-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-2">
                  <input placeholder="Name" value={oblName} onChange={e => setOblName(e.target.value)}
                    className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  <input placeholder="Amount (₹)" type="number" value={oblAmount} onChange={e => setOblAmount(e.target.value)}
                    className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <input type="date" value={oblDate} onChange={e => setOblDate(e.target.value)}
                    className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <button onClick={handleAddObligation}
                    className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-1.5 rounded hover:opacity-90">Add</button>
                </div>
              )}
              <div className="space-y-2">
                {obligations.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                    <div>
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">Due {format(new Date(o.dueDate), "MMM d, yyyy")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-red-400">{formatCurrency(o.amount)}</span>
                      <button onClick={() => deleteObligation(o.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {obligations.length === 0 && <p className="text-sm text-[var(--color-muted)] py-4 text-center">No obligations yet</p>}
              </div>
              {isNative() && (
                <button
                  onClick={async () => {
                    const overdueInvoices = (store.invoices ?? []).filter(inv => inv.status === "overdue" || new Date(inv.dueDate) < new Date());
                    if (overdueInvoices.length === 0) { toast.info("No overdue invoices to notify about"); return; }
                    const reminders = overdueInvoices.map(inv => ({
                      id: Math.abs(inv.id.split("").reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)) % 900000 + 100000,
                      title: "Invoice overdue",
                      body: `${inv.customer ?? "Customer"} · ${formatCurrency(inv.amount)}`,
                      at: new Date(),
                    }));
                    const n = await scheduleReminders(reminders);
                    toast.success(n > 0 ? `${n} overdue invoice reminder${n > 1 ? "s" : ""} scheduled` : "Reminders scheduled");
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg font-medium hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
                >
                  Notify me
                </button>
              )}
            </div>
          </div>
        </>
      )}

      </>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #76 — 13-Week Rolling Cash Forecast
// Weekly inflow/outflow table — the standard lenders ask for. Inflows from open
// invoices (collected on/after due date) + recurring revenue run-rate; outflows
// from recurring expense run-rate + dated cash obligations + active-loan EMIs.
// ─────────────────────────────────────────────────────────────────────────────
const WEEK_MS = 7 * 86_400_000;

interface WeekRow {
  index: number;
  startLabel: string;
  inflow: number;
  outflow: number;
  net: number;
  closing: number;
}

function ThirteenWeekForecast() {
  const { store } = useApp();
  const { transactions, invoices, bankAccounts, obligations, activeLoans, firm } = store;

  const rows = useMemo<WeekRow[]>(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const openingBalance = (bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);

    // Estimate weekly run-rate inflow/outflow from the trailing 90 days of variable
    // (non-transfer) cash flow, excluding items we schedule explicitly below.
    const hist = (transactions ?? []).filter(t => {
      if (t.category === "transfer") return false;
      const d = new Date(t.date).getTime();
      return d >= today.getTime() - 90 * 86_400_000 && d <= today.getTime();
    });
    const histIn = hist.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const histOut = hist.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const weeklyBaseIn = (histIn / 90) * 7;
    const weeklyBaseOut = (histOut / 90) * 7;

    const weekOf = (dateStr: string): number => {
      const diff = new Date(dateStr).getTime() - start.getTime();
      return Math.floor(diff / WEEK_MS);
    };

    const out: WeekRow[] = [];
    let closing = openingBalance;
    for (let w = 0; w < 13; w++) {
      const weekStart = new Date(start.getTime() + w * WEEK_MS);
      let inflow = weeklyBaseIn;
      let outflow = weeklyBaseOut;

      // Open invoices collected the week their due-date falls in (overdue → week 0).
      for (const inv of invoices ?? []) {
        if (inv.status === "paid") continue;
        const due = weekOf(inv.dueDate);
        const collectWeek = due < 0 ? 0 : due;
        if (collectWeek === w) inflow += inv.amount;
      }
      // Dated cash obligations.
      for (const o of obligations ?? []) {
        const ow = weekOf(o.dueDate);
        const payWeek = ow < 0 ? 0 : ow;
        if (payWeek === w) outflow += Math.abs(o.amount);
      }
      // Active-loan EMIs (approx every 4 weeks from next payment date).
      for (const l of activeLoans ?? []) {
        if (!l.monthlyEmi || !l.nextPaymentDate) continue;
        const firstWeek = weekOf(l.nextPaymentDate);
        if (firstWeek >= 0 && (w - firstWeek) % 4 === 0 && w >= firstWeek) outflow += Math.abs(l.monthlyEmi);
      }

      const net = inflow - outflow;
      closing += net;
      out.push({
        index: w + 1,
        startLabel: format(weekStart, "d MMM"),
        inflow: Math.round(inflow),
        outflow: Math.round(outflow),
        net: Math.round(net),
        closing: Math.round(closing),
      });
    }
    return out;
  }, [transactions, invoices, bankAccounts, obligations, activeLoans]);

  const totalIn = rows.reduce((s, r) => s + r.inflow, 0);
  const totalOut = rows.reduce((s, r) => s + r.outflow, 0);
  const lowest = rows.reduce((m, r) => (r.closing < m.closing ? r : m), rows[0]);

  // Safety threshold: days-of-burn × weekly outflow run-rate ÷ 7.
  const dailyBurn = totalOut / (13 * 7) || 0;
  const threshold = (firm?.safetyThresholdDays ?? 14) * dailyBurn;
  const chartData = rows.map(r => ({ wk: `W${r.index}`, closing: Math.round(r.closing / 100000) }));

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <CalendarRange size={14} className="text-[var(--color-primary)]" /> 13-Week Rolling Cash Forecast
        </h2>
        <p className="text-xs text-[var(--color-muted)]">
          Weekly inflow/outflow projection — the standard format lenders and CFOs use. Built live from your invoices, recurring run-rate, obligations and EMIs.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "13-week inflows", value: formatCurrency(totalIn), color: "text-green-400" },
          { label: "13-week outflows", value: formatCurrency(totalOut), color: "text-red-400" },
          { label: "Net 13-week", value: formatCurrency(totalIn - totalOut), color: totalIn - totalOut >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Lowest weekly close", value: formatCurrency(lowest?.closing ?? 0), color: (lowest?.closing ?? 0) < threshold ? "text-red-400" : "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Projected closing balance (₹L)</h3>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="wk" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`₹${v}L`, "Closing"]} />
            <ReferenceLine y={Math.round(threshold / 100000)} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Safety", position: "insideTopRight", fontSize: 8, fill: "#ef4444" }} />
            <Area type="monotone" dataKey="closing" stroke="#1A6B55" strokeWidth={2} fill="#1A6B5510" animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Week", "Starting", "Inflow", "Outflow", "Net", "Closing"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(r => {
              const breach = r.closing < threshold;
              return (
                <tr key={r.index} className={breach ? "bg-red-950/15" : "hover:bg-white/2"}>
                  <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">W{r.index}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)] whitespace-nowrap">{r.startLabel}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-green-400">{formatCurrency(r.inflow)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-red-400">{formatCurrency(r.outflow)}</td>
                  <td className={`px-3 py-2 text-xs tabular-nums ${r.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(r.net)}</td>
                  <td className={`px-3 py-2 text-xs tabular-nums font-semibold ${breach ? "text-red-400" : "text-[var(--color-text)]"}`}>{formatCurrency(r.closing)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Red rows close below your {firm?.safetyThresholdDays ?? 14}-day safety buffer. Inflow/outflow base run-rate is the trailing-90-day average; invoices, obligations and EMIs are scheduled on their dates.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #77 — Receivables-Driven Inflow Projection
// Forecasts collections from open invoices: each invoice's expected collection
// date (due-date + status-based slip) × a pay-probability (lower if overdue),
// bucketed by month, with an expected-value inflow line.
// ─────────────────────────────────────────────────────────────────────────────
interface ProjectedInflow {
  invoiceId: string;
  customer: string;
  amount: number;
  dueDate: string;
  expectedDate: string;
  payProbability: number;
  expectedValue: number;
  bucket: string;
}

function ReceivablesInflowProjection() {
  const { store } = useApp();
  const { invoices } = store;

  const projections = useMemo<ProjectedInflow[]>(() => {
    const today = new Date();
    const out: ProjectedInflow[] = [];
    for (const inv of invoices ?? []) {
      if (inv.status === "paid") continue;
      const due = new Date(inv.dueDate);
      const daysOverdue = Math.round((today.getTime() - due.getTime()) / 86_400_000);

      // Pay-probability decays with how overdue the invoice is. Current invoices
      // are ~92% likely to be collected in-horizon; deeply overdue ones much less.
      let payProbability: number;
      let slipDays: number;
      if (inv.status === "overdue" || daysOverdue > 0) {
        // logistic-ish decay: 90d overdue ≈ 45%, 180d ≈ 25%.
        payProbability = Math.max(0.2, 0.85 - daysOverdue / 250);
        slipDays = Math.min(45, 7 + daysOverdue * 0.3);
      } else {
        payProbability = 0.92;
        slipDays = 7; // typical slip past due date even for healthy payers
      }
      const expected = new Date(Math.max(today.getTime(), due.getTime()) + slipDays * 86_400_000);
      out.push({
        invoiceId: inv.id,
        customer: inv.customer,
        amount: inv.amount,
        dueDate: inv.dueDate,
        expectedDate: expected.toISOString().slice(0, 10),
        payProbability,
        expectedValue: Math.round(inv.amount * payProbability),
        bucket: format(expected, "MMM yyyy"),
      });
    }
    return out.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  }, [invoices]);

  const byBucket = useMemo(() => {
    const map = new Map<string, { bucket: string; gross: number; expected: number; count: number }>();
    for (const p of projections) {
      const e = map.get(p.bucket) ?? { bucket: p.bucket, gross: 0, expected: 0, count: 0 };
      e.gross += p.amount; e.expected += p.expectedValue; e.count += 1;
      map.set(p.bucket, e);
    }
    return [...map.values()];
  }, [projections]);

  const totalGross = projections.reduce((s, p) => s + p.amount, 0);
  const totalExpected = projections.reduce((s, p) => s + p.expectedValue, 0);
  const atRisk = totalGross - totalExpected;
  const chartData = byBucket.map(b => ({ bucket: b.bucket, gross: Math.round(b.gross / 100000), expected: Math.round(b.expected / 100000) }));

  if (projections.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Coins size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <h2 className="text-base font-semibold mb-1">No open invoices</h2>
        <p className="text-sm text-[var(--color-muted)] max-w-xs mx-auto">Add or import invoices to project receivables-driven cash inflow by due-date and pay-probability.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Coins size={14} className="text-[var(--color-primary)]" /> Receivables-Driven Inflow Projection
        </h2>
        <p className="text-xs text-[var(--color-muted)]">Each open invoice's collection date (due-date + slip) × pay-probability — overdue invoices are discounted automatically.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Gross receivable", value: formatCurrency(totalGross), color: "text-[var(--color-text)]" },
          { label: "Expected to collect", value: formatCurrency(totalExpected), color: "text-green-400" },
          { label: "At risk (discounted)", value: formatCurrency(atRisk), color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Projected inflow by month (₹L) — gross vs probability-weighted</h3>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 8, fontSize: 11 }} formatter={(v: number, name: string) => [`₹${v}L`, name === "gross" ? "Gross" : "Expected"]} />
            <Area type="monotone" dataKey="gross" stroke="#8a8060" strokeWidth={1} strokeDasharray="4 2" fill="transparent" animationDuration={400} />
            <Area type="monotone" dataKey="expected" stroke="#1A6B55" strokeWidth={2} fill="#1A6B5510" animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Customer", "Amount", "Due", "Expected collection", "Pay prob.", "Expected ₹"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {projections.map(p => (
              <tr key={p.invoiceId} className="hover:bg-white/2">
                <td className="px-3 py-2 text-xs font-medium truncate max-w-[160px]">{p.customer}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{formatCurrency(p.amount)}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)] whitespace-nowrap">{format(new Date(p.dueDate), "d MMM")}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{format(new Date(p.expectedDate), "d MMM yyyy")}</td>
                <td className={`px-3 py-2 text-xs tabular-nums ${p.payProbability < 0.5 ? "text-red-400" : p.payProbability < 0.8 ? "text-yellow-400" : "text-green-400"}`}>{Math.round(p.payProbability * 100)}%</td>
                <td className="px-3 py-2 text-xs tabular-nums font-semibold text-green-400">{formatCurrency(p.expectedValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #78 — Seasonality Detector
// Auto-detects month-of-year revenue/expense patterns from transaction history:
// per-month index (vs the annual average = 100), flagging peak & trough months.
// ─────────────────────────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MonthStat {
  month: number;
  label: string;
  revenue: number;
  expense: number;
  count: number;
  revenueIndex: number;
  expenseIndex: number;
}

function SeasonalityDetector() {
  const { store } = useApp();
  const { transactions } = store;

  const stats = useMemo<MonthStat[]>(() => {
    const rev = new Array(12).fill(0);
    const exp = new Array(12).fill(0);
    const cnt = new Array(12).fill(0);
    for (const t of transactions ?? []) {
      if (t.category === "transfer") continue;
      const m = new Date(t.date).getMonth();
      if (t.amount > 0) rev[m] += t.amount; else exp[m] += Math.abs(t.amount);
      cnt[m] += 1;
    }
    const activeRev = rev.filter((_, i) => cnt[i] > 0);
    const activeExp = exp.filter((_, i) => cnt[i] > 0);
    const avgRev = activeRev.length ? activeRev.reduce((s, v) => s + v, 0) / activeRev.length : 0;
    const avgExp = activeExp.length ? activeExp.reduce((s, v) => s + v, 0) / activeExp.length : 0;
    return MONTHS.map((label, m) => ({
      month: m,
      label,
      revenue: Math.round(rev[m]),
      expense: Math.round(exp[m]),
      count: cnt[m],
      revenueIndex: avgRev > 0 && cnt[m] > 0 ? Math.round((rev[m] / avgRev) * 100) : 0,
      expenseIndex: avgExp > 0 && cnt[m] > 0 ? Math.round((exp[m] / avgExp) * 100) : 0,
    }));
  }, [transactions]);

  const active = stats.filter(s => s.count > 0);
  const hasData = active.length >= 3;
  const peak = active.length ? active.reduce((m, s) => (s.revenueIndex > m.revenueIndex ? s : m), active[0]) : null;
  const trough = active.length ? active.reduce((m, s) => (s.revenueIndex < m.revenueIndex ? s : m), active[0]) : null;
  // Seasonality strength = coefficient of variation of the revenue indices.
  const idxs = active.map(s => s.revenueIndex);
  const meanIdx = idxs.length ? idxs.reduce((s, v) => s + v, 0) / idxs.length : 0;
  const variance = idxs.length ? idxs.reduce((s, v) => s + (v - meanIdx) ** 2, 0) / idxs.length : 0;
  const cv = meanIdx > 0 ? Math.sqrt(variance) / meanIdx : 0;
  const strength = cv > 0.35 ? "Strong" : cv > 0.15 ? "Moderate" : "Weak";

  const chartData = stats.map(s => ({ label: s.label, revenue: s.revenueIndex, expense: s.expenseIndex }));

  if (!hasData) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Waves size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <h2 className="text-base font-semibold mb-1">Not enough history yet</h2>
        <p className="text-sm text-[var(--color-muted)] max-w-xs mx-auto">Seasonality detection needs transactions across at least 3 distinct months.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Waves size={14} className="text-[var(--color-primary)]" /> Seasonality Detector
        </h2>
        <p className="text-xs text-[var(--color-muted)]">Month-of-year revenue & expense patterns, indexed to your annual average (=100). Spots predictable peaks and troughs to plan cash buffers.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Seasonality strength", value: strength, color: strength === "Strong" ? "text-orange-400" : strength === "Moderate" ? "text-yellow-400" : "text-green-400", sub: `CV ${(cv * 100).toFixed(0)}%` },
          { label: "Peak revenue month", value: peak ? `${peak.label}` : "—", color: "text-green-400", sub: peak ? `${peak.revenueIndex} index` : "" },
          { label: "Trough revenue month", value: trough ? `${trough.label}` : "—", color: "text-red-400", sub: trough ? `${trough.revenueIndex} index` : "" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{c.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Monthly index vs annual average (100 = average)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 8, fontSize: 11 }} formatter={(v: number, name: string) => [`${v}`, name === "revenue" ? "Revenue idx" : "Expense idx"]} />
            <ReferenceLine y={100} stroke="#8a8060" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="revenue" stroke="#1A6B55" strokeWidth={2} dot={false} animationDuration={400} />
            <Line type="monotone" dataKey="expense" stroke="#d97706" strokeWidth={1.5} strokeDasharray="4 2" dot={false} animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Month", "Revenue", "Rev. index", "Expense", "Exp. index"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {stats.map(s => (
              <tr key={s.month} className={s.count === 0 ? "opacity-30" : "hover:bg-white/2"}>
                <td className="px-3 py-2 text-xs font-medium">{s.label}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-green-400">{s.count ? formatCurrency(s.revenue) : "—"}</td>
                <td className={`px-3 py-2 text-xs tabular-nums ${s.revenueIndex > 110 ? "text-green-400" : s.revenueIndex < 90 && s.revenueIndex > 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{s.count ? s.revenueIndex : "—"}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-red-400">{s.count ? formatCurrency(s.expense) : "—"}</td>
                <td className={`px-3 py-2 text-xs tabular-nums ${s.expenseIndex > 110 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{s.count ? s.expenseIndex : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Index = month total ÷ average across active months × 100. Strength is the coefficient of variation of revenue indices. Greyed months have no recorded transactions.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #79 — Scenario-Linked Forecast (best / base / worst)
// Three-line 90-day cash projection: re-runs the Monte-Carlo engine at three
// revenue/burn settings, plotting P50 of each as best/base/worst. Editable
// optimism/pessimism via sliders so the spread reflects this firm's volatility.
// ─────────────────────────────────────────────────────────────────────────────
function ThreeLineProjection() {
  const { store } = useApp();
  const { scenarios } = store;
  const [optimism, setOptimism] = useState(15);  // best = +optimism% revenue, leaner burn
  const [pessimism, setPessimism] = useState(20); // worst = -pessimism% revenue, higher burn

  const active = useMemo(() => (scenarios ?? []).filter(s => s.active), [scenarios]);

  const lines = useMemo(() => {
    const best = runForecast(store, { scenarios: active, revenueFactor: 1 + optimism / 100, burnFactor: 1 - Math.min(optimism, 20) / 200 });
    const base = runForecast(store, { scenarios: active, revenueFactor: 1, burnFactor: 1 });
    const worst = runForecast(store, { scenarios: active, revenueFactor: Math.max(0.4, 1 - pessimism / 100), burnFactor: 1 + pessimism / 100 });
    return { best, base, worst };
  }, [store, active, optimism, pessimism]);

  const chartData = lines.base.points.map((pt, i) => ({
    date: format(new Date(pt.date), "MMM d"),
    best: Math.round((lines.best.points[i]?.p50 ?? pt.p50) / 100000),
    base: Math.round(pt.p50 / 100000),
    worst: Math.round((lines.worst.points[i]?.p50 ?? pt.p50) / 100000),
  }));

  const endOf = (r: typeof lines.base) => r.points[r.points.length - 1]?.p50 ?? r.startBalance;
  const summary = [
    { key: "best", label: "Best case", end: endOf(lines.best), color: "text-green-400", runway: lines.best.risk.runwayDist.p50 },
    { key: "base", label: "Base case", end: endOf(lines.base), color: "text-[var(--color-text)]", runway: lines.base.risk.runwayDist.p50 },
    { key: "worst", label: "Worst case", end: endOf(lines.worst), color: "text-red-400", runway: lines.worst.risk.runwayDist.p50 },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <GitBranch size={14} className="text-[var(--color-primary)]" /> Best / Base / Worst Projection
        </h2>
        <p className="text-xs text-[var(--color-muted)]">
          Three-line 90-day cash projection, re-running the forecast engine at optimistic, base and pessimistic settings.
          {active.length > 0 ? ` ${active.length} active scenario${active.length > 1 ? "s" : ""} baked into all three lines.` : " Activate scenarios on the Probabilistic tab to fold them in."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Optimism (best-case upside)</span><span className="font-semibold text-green-400">+{optimism}%</span></label>
          <input type="range" min={5} max={40} step={5} value={optimism} onChange={e => setOptimism(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Pessimism (worst-case downside)</span><span className="font-semibold text-red-400">−{pessimism}%</span></label>
          <input type="range" min={5} max={50} step={5} value={pessimism} onChange={e => setPessimism(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {summary.map(s => (
          <div key={s.key} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${s.color}`}>{formatCurrency(Math.round(s.end))}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">runway {s.runway >= 90 ? "90+" : s.runway}d</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={13} className="text-[var(--color-primary)]" /> 90-day cash projection (₹L)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={14} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 8, fontSize: 11 }} formatter={(v: number, name: string) => [`₹${v}L`, name.charAt(0).toUpperCase() + name.slice(1)]} />
            <Line type="monotone" dataKey="best" stroke="#22c55e" strokeWidth={1.5} dot={false} animationDuration={400} />
            <Line type="monotone" dataKey="base" stroke="#1A6B55" strokeWidth={2} dot={false} animationDuration={400} />
            <Line type="monotone" dataKey="worst" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" dot={false} animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-[10px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-green-500 inline-block" /> Best</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-[#1A6B55] inline-block" /> Base</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-red-500 inline-block" /> Worst</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #80 — Cash Buffer / Minimum-Balance Alert
// Projects whether the worst-case (P10) path breaches a user-set minimum-balance
// floor and on which day, with a configurable safety target and a clear verdict.
// ─────────────────────────────────────────────────────────────────────────────
function CashBufferAlert() {
  const { store } = useApp();
  const { bankAccounts, firm } = store;
  const currentBalance = (bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);

  const result = useMemo(() => runForecast(store, {}), [store]);
  // Suggested floor: 14-day burn from the engine's threshold, rounded to nearest ₹1L.
  const suggestedFloor = Math.max(0, Math.round(result.risk.thresholdCash / 100000) * 100000);
  const [floor, setFloor] = useFeatureState<number>("forecast-min-balance-floor", 0);
  const effectiveFloor = floor > 0 ? floor : suggestedFloor;

  const breach = useMemo(() => {
    const points = result.points;
    const findBreach = (key: "p10" | "p50") => {
      const i = points.findIndex(p => p[key] < effectiveFloor);
      return i < 0 ? null : { day: i + 1, date: points[i].date, balance: points[i][key] };
    };
    return { worst: findBreach("p10"), expected: findBreach("p50") };
  }, [result, effectiveFloor]);

  const minP10 = result.points.reduce((m, p) => Math.min(m, p.p10), currentBalance);
  const willBreach = breach.worst !== null;
  const expectedBreach = breach.expected !== null;

  const chartData = result.points.map(p => ({ date: format(new Date(p.date), "MMM d"), p10: Math.round(p.p10 / 100000), p50: Math.round(p.p50 / 100000) }));

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <ShieldAlert size={14} className="text-[var(--color-primary)]" /> Cash Buffer / Minimum-Balance Alert
        </h2>
        <p className="text-xs text-[var(--color-muted)]">Set a minimum cash floor — we project whether your worst-case (P10) and expected (P50) paths breach it, and on which day.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Minimum-balance floor (₹) — leave 0 to use suggested {formatCurrency(suggestedFloor)}</label>
            <input type="number" min={0} value={floor || ""} onChange={e => setFloor(Number(e.target.value) || 0)} placeholder={String(suggestedFloor)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <button onClick={() => setFloor(suggestedFloor)} className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40 whitespace-nowrap">
            Use {firm?.safetyThresholdDays ?? 14}-day buffer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current balance", value: formatCurrency(currentBalance), color: "text-[var(--color-text)]" },
          { label: "Floor", value: formatCurrency(effectiveFloor), color: "text-[var(--color-text)]" },
          { label: "Worst-case low (P10)", value: formatCurrency(Math.round(minP10)), color: minP10 < effectiveFloor ? "text-red-400" : "text-green-400" },
          { label: "Breach risk", value: `${Math.round(result.risk.probBreach * 100)}%`, color: result.risk.probBreach >= 0.3 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {willBreach ? (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-400">Projected breach of your minimum-balance floor</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Worst-case (P10) dips below {formatCurrency(effectiveFloor)} on <strong className="text-red-300">{format(new Date(breach.worst!.date), "d MMM")}</strong> (~day {breach.worst!.day}), reaching {formatCurrency(Math.round(breach.worst!.balance))}.
              {expectedBreach ? <> Even the expected path breaches on <strong className="text-red-300">{format(new Date(breach.expected!.date), "d MMM")}</strong> — arrange a buffer now.</> : <> The expected (P50) path stays above the floor.</>}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-green-950/20 border border-green-800/40 rounded-lg px-4 py-3 flex items-start gap-3">
          <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-400">No breach projected over 90 days</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Even the worst-case (P10) path stays above your {formatCurrency(effectiveFloor)} floor. Lowest projected point: {formatCurrency(Math.round(minP10))}.</p>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Projected balance vs floor (₹L)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={14} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 8, fontSize: 11 }} formatter={(v: number, name: string) => [`₹${v}L`, name === "p10" ? "Worst (P10)" : "Expected (P50)"]} />
            <ReferenceLine y={Math.round(effectiveFloor / 100000)} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Floor", position: "insideTopRight", fontSize: 8, fill: "#ef4444" }} />
            <Area type="monotone" dataKey="p50" stroke="#1A6B55" strokeWidth={2} fill="#1A6B5508" animationDuration={400} />
            <Area type="monotone" dataKey="p10" stroke="#d97706" strokeWidth={1} strokeDasharray="4 2" fill="transparent" animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Shared chrome for the tool cards below — header block with title + blurb.
function ToolHeader({ icon: Icon, title, blurb }: { icon: typeof TrendingUp; title: string; blurb: string }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <Icon size={14} className="text-[var(--color-primary)]" /> {title}
      </h2>
      <p className="text-xs text-[var(--color-muted)]">{blurb}</p>
    </div>
  );
}

function StatGrid({ cols, cards }: { cols: string; cards: { label: string; value: string; color?: string; sub?: string }[] }) {
  return (
    <div className={`grid grid-cols-2 ${cols} gap-3`}>
      {cards.map(c => (
        <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{c.label}</p>
          <p className={`text-lg font-bold tabular-nums mt-0.5 ${c.color ?? "text-[var(--color-text)]"}`}>{c.value}</p>
          {c.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-tight">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

const tooltipStyle = { background: "#161B22", border: "1px solid #21262D", borderRadius: 8, fontSize: 11 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// #81 — Revenue Forecast (growth-rate driven)
// Projects monthly revenue forward 12 months from the trailing run-rate, using a
// growth rate seeded from the firm's own compound-monthly-growth and overridable.
// ─────────────────────────────────────────────────────────────────────────────
function RevenueForecast() {
  const { store } = useApp();
  const { transactions } = store;
  const hist = useMemo(() => monthlyAggregates(transactions ?? [], 12), [transactions]);
  const seedGrowth = useMemo(() => {
    const g = cmgr(hist.filter(m => m.revenue > 0).map(m => m.revenue));
    return g == null ? 2 : Math.round(clampNum(g, -10, 20) * 10) / 10;
  }, [hist]);
  const [growth, setGrowth] = useFeatureState<number>("fc-rev-growth-pct", 0);
  const [horizon, setHorizon] = useState(12);
  const effGrowth = growth !== 0 ? growth : seedGrowth;

  const lastRev = useMemo(() => {
    const active = hist.filter(m => m.revenue > 0);
    if (active.length === 0) return 0;
    // trailing-3-month average as the base run-rate (smooths a single spike)
    const tail = active.slice(-3);
    return tail.reduce((s, m) => s + m.revenue, 0) / tail.length;
  }, [hist]);

  const proj = useMemo(() => {
    const out: { label: string; revenue: number }[] = [];
    let rev = lastRev;
    const now = new Date();
    for (let i = 1; i <= horizon; i++) {
      rev = rev * (1 + effGrowth / 100);
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({ label: format(d, "MMM yy"), revenue: Math.round(rev) });
    }
    return out;
  }, [lastRev, effGrowth, horizon]);

  const chartData = [
    ...hist.filter(m => m.revenue > 0).map(m => ({ label: m.label, actual: Math.round(m.revenue / 100000), projected: null as number | null })),
    ...proj.map(p => ({ label: p.label, actual: null as number | null, projected: Math.round(p.revenue / 100000) })),
  ];
  const totalProjected = proj.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="space-y-4">
      <ToolHeader icon={LineChart} title="Revenue Forecast" blurb="Projects monthly revenue forward from your trailing 3-month run-rate at a growth rate seeded from your own history — override it to test plans." />
      <StatGrid cols="md:grid-cols-3" cards={[
        { label: "Base monthly run-rate", value: formatCurrency(Math.round(lastRev)), color: "text-[var(--color-text)]" },
        { label: `Growth rate (MoM)`, value: `${effGrowth > 0 ? "+" : ""}${effGrowth}%`, color: effGrowth >= 0 ? "text-green-400" : "text-red-400", sub: growth !== 0 ? "your override" : "from history" },
        { label: `${horizon}-month projected revenue`, value: formatCurrency(totalProjected), color: "text-green-400" },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 grid md:grid-cols-2 gap-4">
        <div>
          <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Monthly growth override</span><span className="font-semibold">{growth !== 0 ? `${growth > 0 ? "+" : ""}${growth}%` : "off"}</span></label>
          <input type="range" min={-10} max={20} step={0.5} value={growth} onChange={e => setGrowth(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          <p className="text-[10px] text-[var(--color-muted)] mt-1">Set to 0 to use your historical CMGR ({seedGrowth}%).</p>
        </div>
        <div>
          <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Horizon</span><span className="font-semibold">{horizon} months</span></label>
          <input type="range" min={3} max={24} step={1} value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Revenue: actual vs projected (₹L)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`₹${v}L`, name === "actual" ? "Actual" : "Projected"]} />
            <Line type="monotone" dataKey="actual" stroke="#1A6B55" strokeWidth={2} dot={false} connectNulls animationDuration={400} />
            <Line type="monotone" dataKey="projected" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #82 — Expense Forecast (category run-rate × inflation)
// Projects monthly expense forward by category using each category's trailing
// run-rate, with a single inflation dial that compounds across the horizon.
// ─────────────────────────────────────────────────────────────────────────────
const EXP_CATS: Transaction["category"][] = ["expense", "payroll", "tax", "loan"];
const EXP_LABEL: Record<string, string> = { expense: "Operating", payroll: "Payroll", tax: "Tax", loan: "Loan/EMI" };

function ExpenseForecast() {
  const { store } = useApp();
  const { transactions } = store;
  const [inflation, setInflation] = useState(6);
  const [horizon, setHorizon] = useState(12);

  // trailing-6-month average monthly outflow per category
  const base = useMemo(() => {
    const now = new Date();
    const cut = new Date(now.getFullYear(), now.getMonth() - 6, 1).getTime();
    const sums: Record<string, number> = {};
    let months = 0;
    const seen = new Set<string>();
    for (const t of transactions ?? []) {
      if (t.amount >= 0 || t.category === "transfer") continue;
      const d = new Date(t.date);
      if (d.getTime() < cut) continue;
      seen.add(`${d.getFullYear()}-${d.getMonth()}`);
      const cat = EXP_CATS.includes(t.category) ? t.category : "expense";
      sums[cat] = (sums[cat] ?? 0) + Math.abs(t.amount);
    }
    months = Math.max(1, seen.size);
    return EXP_CATS.map(c => ({ cat: c, monthly: Math.round((sums[c] ?? 0) / months) }));
  }, [transactions]);

  const totalBase = base.reduce((s, b) => s + b.monthly, 0);
  const proj = useMemo(() => {
    const now = new Date();
    const out: { label: string; total: number }[] = [];
    for (let i = 1; i <= horizon; i++) {
      const f = (1 + inflation / 100) ** (i / 12);
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({ label: format(d, "MMM yy"), total: Math.round(totalBase * f) });
    }
    return out;
  }, [totalBase, inflation, horizon]);
  const totalProjected = proj.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <ToolHeader icon={Receipt} title="Expense Forecast" blurb="Projects monthly outflow by category from each category's trailing 6-month run-rate, with one inflation dial compounding across the horizon." />
      <StatGrid cols="md:grid-cols-3" cards={[
        { label: "Base monthly expense", value: formatCurrency(totalBase), color: "text-red-400" },
        { label: "Annual inflation", value: `${inflation}%`, color: "text-[var(--color-text)]" },
        { label: `${horizon}-month projected expense`, value: formatCurrency(totalProjected), color: "text-red-400" },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 grid md:grid-cols-2 gap-4">
        <div>
          <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Annual cost inflation</span><span className="font-semibold">{inflation}%</span></label>
          <input type="range" min={0} max={20} step={1} value={inflation} onChange={e => setInflation(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
        <div>
          <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Horizon</span><span className="font-semibold">{horizon} months</span></label>
          <input type="range" min={3} max={24} step={1} value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Base monthly expense by category</h3>
        <div className="space-y-2">
          {base.map(b => (
            <div key={b.cat} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-muted)]">{EXP_LABEL[b.cat] ?? b.cat}</span>
              <span className="tabular-nums font-medium">{formatCurrency(b.monthly)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Projected monthly expense (₹L)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={proj.map(p => ({ label: p.label, total: Math.round(p.total / 100000) }))}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v}L`, "Expense"]} />
            <Area type="monotone" dataKey="total" stroke="#d97706" strokeWidth={2} fill="#d9770610" animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #83 — Headcount-Cost Forecast
// Build a roster of roles (salary × count, optional start month) on top of the
// current payroll run-rate and project total monthly people-cost forward.
// ─────────────────────────────────────────────────────────────────────────────
interface PlannedRole { id: string; title: string; monthlyCost: number; startMonth: number; count: number }

function HeadcountCostForecast() {
  const { store } = useApp();
  const { transactions } = store;
  const [roles, setRoles] = useFeatureState<PlannedRole[]>("fc-planned-roles", []);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [count, setCount] = useState("1");
  const [startMonth, setStartMonth] = useState("1");

  // current payroll run-rate = trailing-3-month average payroll outflow
  const currentPayroll = useMemo(() => {
    const now = new Date();
    const cut = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();
    let sum = 0; const seen = new Set<string>();
    for (const t of transactions ?? []) {
      if (t.category !== "payroll" || t.amount >= 0) continue;
      const d = new Date(t.date);
      if (d.getTime() < cut) continue;
      seen.add(`${d.getFullYear()}-${d.getMonth()}`);
      sum += Math.abs(t.amount);
    }
    return Math.round(sum / Math.max(1, seen.size));
  }, [transactions]);

  const addRole = () => {
    if (!title || !cost) { toast.error("Add a title and monthly cost"); return; }
    setRoles(prev => [...prev, { id: generateId(), title, monthlyCost: Number(cost), count: Math.max(1, Number(count) || 1), startMonth: Math.max(0, Number(startMonth) || 0) }]);
    toast.success("Role added to plan");
    setTitle(""); setCost(""); setCount("1"); setStartMonth("1");
  };

  const proj = useMemo(() => {
    const now = new Date();
    const out: { label: string; cost: number }[] = [];
    for (let i = 0; i < 12; i++) {
      let extra = 0;
      for (const r of roles) if (i >= r.startMonth) extra += r.monthlyCost * r.count;
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({ label: format(d, "MMM yy"), cost: currentPayroll + extra });
    }
    return out;
  }, [roles, currentPayroll]);

  const fullyLoaded = proj[proj.length - 1]?.cost ?? currentPayroll;
  const headcountAdd = roles.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-4">
      <ToolHeader icon={Users} title="Headcount-Cost Forecast" blurb="Layer planned hires on top of your current payroll run-rate and see total monthly people-cost ramp across the next 12 months." />
      <StatGrid cols="md:grid-cols-3" cards={[
        { label: "Current payroll / month", value: formatCurrency(currentPayroll), color: "text-[var(--color-text)]" },
        { label: "Planned hires", value: `${headcountAdd}`, color: "text-[var(--color-text)]" },
        { label: "Fully-loaded / month", value: formatCurrency(fullyLoaded), color: "text-red-400" },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add a planned role</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          <input placeholder="Role title" value={title} onChange={e => setTitle(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] col-span-2 md:col-span-1" />
          <input type="number" placeholder="Monthly cost (₹)" value={cost} onChange={e => setCost(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" placeholder="Count" value={count} onChange={e => setCount(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" placeholder="Start month" value={startMonth} onChange={e => setStartMonth(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <button onClick={addRole} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded font-semibold hover:opacity-90"><Plus size={12} /> Add role</button>
        <div className="mt-3 space-y-2">
          {roles.map(r => (
            <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
              <div>
                <p className="text-sm font-medium">{r.count > 1 ? `${r.count}× ` : ""}{r.title}</p>
                <p className="text-xs text-[var(--color-muted)]">{formatCurrency(r.monthlyCost)}/mo · from month {r.startMonth}</p>
              </div>
              <button onClick={() => setRoles(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
          {roles.length === 0 && <p className="text-sm text-[var(--color-muted)] py-3 text-center">No planned roles yet</p>}
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Monthly people-cost ramp (₹L)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={proj.map(p => ({ label: p.label, cost: Math.round(p.cost / 100000) }))}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v}L`, "People cost"]} />
            <Area type="monotone" dataKey="cost" stroke="#1A6B55" strokeWidth={2} fill="#1A6B5510" animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #84 — Burn-Rate & Zero-Cash Date
// Net monthly burn from trailing history, current cash, and a straight-line
// zero-cash date if burn continues — with an adjustable burn-change dial.
// ─────────────────────────────────────────────────────────────────────────────
function BurnRateZeroCash() {
  const { store } = useApp();
  const { transactions, bankAccounts } = store;
  const [burnAdj, setBurnAdj] = useState(0); // % change to net burn
  const cash = (bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);

  const hist = useMemo(() => monthlyAggregates(transactions ?? [], 6), [transactions]);
  const netBurn = useMemo(() => {
    const active = hist.filter(m => m.revenue > 0 || m.expense > 0);
    if (active.length === 0) return 0;
    const avgNet = active.reduce((s, m) => s + m.net, 0) / active.length;
    return -avgNet; // positive = burning cash
  }, [hist]);
  const effBurn = netBurn * (1 + burnAdj / 100);
  const monthsLeft = effBurn > 0 ? cash / effBurn : Infinity;
  const zeroDate = effBurn > 0 ? new Date(Date.now() + monthsLeft * 30 * 86_400_000) : null;

  const chartData = useMemo(() => {
    const out: { label: string; cash: number }[] = [];
    let bal = cash;
    const now = new Date();
    for (let i = 0; i <= 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({ label: format(d, "MMM yy"), cash: Math.round(Math.max(0, bal) / 100000) });
      bal -= effBurn;
      if (bal < -cash) break;
    }
    return out;
  }, [cash, effBurn]);

  return (
    <div className="space-y-4">
      <ToolHeader icon={Flame} title="Burn-Rate & Zero-Cash Date" blurb="Net monthly burn from your trailing 6-month history projected straight-line against current cash — adjust the burn to see how the zero-cash date moves." />
      <StatGrid cols="md:grid-cols-4" cards={[
        { label: "Current cash", value: formatCurrency(cash), color: "text-[var(--color-text)]" },
        { label: "Net monthly burn", value: effBurn > 0 ? formatCurrency(Math.round(effBurn)) : "Cash-positive", color: effBurn > 0 ? "text-red-400" : "text-green-400" },
        { label: "Months of runway", value: monthsLeft === Infinity ? "∞" : monthsLeft.toFixed(1), color: monthsLeft < 6 ? "text-red-400" : monthsLeft < 12 ? "text-yellow-400" : "text-green-400" },
        { label: "Zero-cash date", value: zeroDate ? format(zeroDate, "MMM yyyy") : "—", color: zeroDate && monthsLeft < 6 ? "text-red-400" : "text-[var(--color-text)]" },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Burn change</span><span className={`font-semibold ${burnAdj > 0 ? "text-red-400" : burnAdj < 0 ? "text-green-400" : ""}`}>{burnAdj > 0 ? "+" : ""}{burnAdj}%</span></label>
        <input type="range" min={-50} max={50} step={5} value={burnAdj} onChange={e => setBurnAdj(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>
      {effBurn > 0 && monthsLeft < 6 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-center gap-3">
          <Flame size={16} className="text-red-400 shrink-0" />
          <p className="text-sm">At this burn you run out of cash by <strong className="text-red-400">{zeroDate ? format(zeroDate, "MMM yyyy") : "—"}</strong> — under 6 months. Cut burn or arrange a buffer now.</p>
        </div>
      )}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Cash depletion (₹L)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v}L`, "Cash"]} />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" />
            <Area type="monotone" dataKey="cash" stroke="#d97706" strokeWidth={2} fill="#d9770610" animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #85 — Monthly Cash-Bridge Waterfall
// Opening → operating → financing → closing for the most recent month, as a
// waterfall, built from the direct-method monthlyCashFlow ledger in finance.ts.
// ─────────────────────────────────────────────────────────────────────────────
function CashBridgeWaterfall() {
  const { store } = useApp();
  const rows = useMemo(() => monthlyCashFlow(store, 6), [store]);
  const [idx, setIdx] = useState(rows.length - 1);
  const row = rows[Math.min(idx, rows.length - 1)];

  const bars = useMemo(() => {
    if (!row) return [];
    const steps = [
      { name: "Opening", delta: row.opening, total: row.opening },
      { name: "Receipts", delta: row.receipts },
      { name: "Suppliers", delta: -row.supplierPayments },
      { name: "Payroll", delta: -row.payroll },
      { name: "Taxes", delta: -row.taxes },
      { name: "Financing", delta: row.financing },
      { name: "Closing", delta: row.closing, total: row.closing },
    ];
    let running = 0;
    return steps.map((s, i) => {
      const isAnchor = i === 0 || i === steps.length - 1;
      const start = isAnchor ? 0 : running;
      if (!isAnchor) running += s.delta;
      else running = s.total ?? running;
      const value = isAnchor ? (s.total ?? 0) : Math.abs(s.delta);
      return { name: s.name, base: isAnchor ? 0 : Math.min(start, start + s.delta), value: Math.round(value / 100000), positive: isAnchor ? true : s.delta >= 0, baseL: Math.round((isAnchor ? 0 : Math.min(start, start + s.delta)) / 100000), isAnchor };
    });
  }, [row]);

  if (!row) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Layers size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <h2 className="text-base font-semibold mb-1">No cash-flow data</h2>
        <p className="text-sm text-[var(--color-muted)] max-w-xs mx-auto">Add transactions to build a monthly cash-bridge waterfall.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ToolHeader icon={Layers} title="Monthly Cash-Bridge Waterfall" blurb="Opening cash → receipts → suppliers, payroll, taxes → financing → closing, for any of the last 6 months. Shows exactly what moved the balance." />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Month</span><span className="font-semibold">{row.label}</span></label>
        <input type="range" min={0} max={rows.length - 1} step={1} value={Math.min(idx, rows.length - 1)} onChange={e => setIdx(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>
      <StatGrid cols="md:grid-cols-4" cards={[
        { label: "Opening", value: formatCurrency(Math.round(row.opening)), color: "text-[var(--color-text)]" },
        { label: "Operating net", value: formatCurrency(Math.round(row.operating)), color: row.operating >= 0 ? "text-green-400" : "text-red-400" },
        { label: "Financing net", value: formatCurrency(Math.round(row.financing)), color: row.financing >= 0 ? "text-green-400" : "text-red-400" },
        { label: "Closing", value: formatCurrency(Math.round(row.closing)), color: row.closing >= row.opening ? "text-green-400" : "text-red-400" },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Cash bridge — {row.label} (₹L)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={bars}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, p) => [`₹${v}L`, (p?.payload as { name: string })?.name ?? ""]} />
            <Bar dataKey="baseL" stackId="w" fill="transparent" />
            <Bar dataKey="value" stackId="w" radius={[2, 2, 0, 0]} animationDuration={400}>
              {bars.map((b, i) => (
                <Cell key={i} fill={b.isAnchor ? "#8a8060" : b.positive ? "#1A6B55" : "#ef4444"} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Grey = opening/closing balance. Green steps add cash; red steps drain it.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #86 — AR / AP Timing Forecast
// Buckets expected receivable collections (open invoices, due-date based) against
// scheduled payables (obligations + EMIs) by week, surfacing weeks where outflows
// outrun inflows — the classic timing-mismatch view.
// ─────────────────────────────────────────────────────────────────────────────
function ArApTimingForecast() {
  const { store } = useApp();
  const { invoices, obligations, activeLoans } = store;

  const weeks = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const out: { label: string; ar: number; ap: number; net: number }[] = [];
    const wOf = (s: string) => Math.max(0, Math.floor((new Date(s).getTime() - start.getTime()) / WEEK_MS));
    for (let w = 0; w < 13; w++) {
      let ar = 0, ap = 0;
      for (const inv of invoices ?? []) { if (inv.status === "paid") continue; if (wOf(inv.dueDate) === w) ar += inv.amount; }
      for (const o of obligations ?? []) { if (wOf(o.dueDate) === w) ap += Math.abs(o.amount); }
      for (const l of activeLoans ?? []) {
        if (!l.monthlyEmi || !l.nextPaymentDate) continue;
        const first = wOf(l.nextPaymentDate);
        if ((w - first) % 4 === 0 && w >= first) ap += Math.abs(l.monthlyEmi);
      }
      const ws = new Date(start.getTime() + w * WEEK_MS);
      out.push({ label: `W${w + 1} ${format(ws, "d MMM")}`, ar: Math.round(ar), ap: Math.round(ap), net: Math.round(ar - ap) });
    }
    return out;
  }, [invoices, obligations, activeLoans]);

  const totalAr = weeks.reduce((s, w) => s + w.ar, 0);
  const totalAp = weeks.reduce((s, w) => s + w.ap, 0);
  const tightWeeks = weeks.filter(w => w.net < 0).length;

  return (
    <div className="space-y-4">
      <ToolHeader icon={ArrowLeftRight} title="AR / AP Timing Forecast" blurb="Expected receivable collections vs scheduled payables (obligations + EMIs) bucketed by week — surfaces the weeks where money out outruns money in." />
      <StatGrid cols="md:grid-cols-3" cards={[
        { label: "13-week receivables", value: formatCurrency(totalAr), color: "text-green-400" },
        { label: "13-week payables", value: formatCurrency(totalAp), color: "text-red-400" },
        { label: "Tight weeks (AP > AR)", value: `${tightWeeks}`, color: tightWeeks > 0 ? "text-red-400" : "text-green-400" },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Weekly inflow vs outflow (₹L)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={weeks.map(w => ({ label: w.label, ar: Math.round(w.ar / 100000), ap: Math.round(w.ap / 100000) }))}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#8a8060" }} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`₹${v}L`, name === "ar" ? "Receivables" : "Payables"]} />
            <Bar dataKey="ar" fill="#1A6B55" radius={[2, 2, 0, 0]} animationDuration={400} />
            <Bar dataKey="ap" fill="#ef4444" radius={[2, 2, 0, 0]} animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Week", "Receivables", "Payables", "Net"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {weeks.map(w => (
              <tr key={w.label} className={w.net < 0 ? "bg-red-950/15" : "hover:bg-white/2"}>
                <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{w.label}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-green-400">{formatCurrency(w.ar)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-red-400">{formatCurrency(w.ap)}</td>
                <td className={`px-3 py-2 text-xs tabular-nums font-semibold ${w.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(w.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #87 — Fixed-vs-Variable Cost Projection
// Splits trailing outflows into fixed (recurring: payroll, loan, recurring-flagged
// expenses) and variable, then projects each forward — fixed flat, variable scaled
// by a revenue-activity dial — so you see your operating-leverage exposure.
// ─────────────────────────────────────────────────────────────────────────────
function FixedVariableProjection() {
  const { store } = useApp();
  const { transactions } = store;
  const [activity, setActivity] = useState(100); // variable cost scales with this

  const split = useMemo(() => {
    const now = new Date();
    const cut = new Date(now.getFullYear(), now.getMonth() - 6, 1).getTime();
    let fixed = 0, variable = 0; const seen = new Set<string>();
    for (const t of transactions ?? []) {
      if (t.amount >= 0 || t.category === "transfer") continue;
      const d = new Date(t.date);
      if (d.getTime() < cut) continue;
      seen.add(`${d.getFullYear()}-${d.getMonth()}`);
      const isFixed = t.category === "payroll" || t.category === "loan" || t.category === "tax" || t.isRecurring;
      if (isFixed) fixed += Math.abs(t.amount); else variable += Math.abs(t.amount);
    }
    const m = Math.max(1, seen.size);
    return { fixed: Math.round(fixed / m), variable: Math.round(variable / m) };
  }, [transactions]);

  const effVariable = Math.round(split.variable * activity / 100);
  const total = split.fixed + effVariable;
  const fixedShare = total > 0 ? Math.round((split.fixed / total) * 100) : 0;

  const chartData = useMemo(() => {
    const now = new Date();
    const out: { label: string; fixed: number; variable: number }[] = [];
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({ label: format(d, "MMM yy"), fixed: Math.round(split.fixed / 100000), variable: Math.round(effVariable / 100000) });
    }
    return out;
  }, [split.fixed, effVariable]);

  return (
    <div className="space-y-4">
      <ToolHeader icon={Scale} title="Fixed vs Variable Cost Projection" blurb="Splits your trailing outflows into fixed (payroll, loans, tax, recurring) and variable, then projects each forward — slide activity to test your operating leverage." />
      <StatGrid cols="md:grid-cols-4" cards={[
        { label: "Fixed / month", value: formatCurrency(split.fixed), color: "text-[var(--color-text)]" },
        { label: "Variable / month", value: formatCurrency(effVariable), color: "text-[var(--color-text)]", sub: activity !== 100 ? `at ${activity}% activity` : undefined },
        { label: "Total / month", value: formatCurrency(total), color: "text-red-400" },
        { label: "Fixed share", value: `${fixedShare}%`, color: fixedShare > 70 ? "text-red-400" : fixedShare > 50 ? "text-yellow-400" : "text-green-400", sub: fixedShare > 70 ? "high operating leverage" : undefined },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Activity level (scales variable cost)</span><span className="font-semibold">{activity}%</span></label>
        <input type="range" min={40} max={160} step={5} value={activity} onChange={e => setActivity(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Projected cost split (₹L, stacked)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`₹${v}L`, name === "fixed" ? "Fixed" : "Variable"]} />
            <Bar dataKey="fixed" stackId="c" fill="#1A6B55" animationDuration={400} />
            <Bar dataKey="variable" stackId="c" fill="#d97706" radius={[2, 2, 0, 0]} animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-[10px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#1A6B55] inline-block rounded-sm" /> Fixed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#d97706] inline-block rounded-sm" /> Variable</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #88 — Break-Even Cash Date
// Projects cumulative monthly net cash forward from the trailing run-rate plus an
// editable monthly revenue growth, and pinpoints the month cumulative net turns
// positive (cash-flow break-even).
// ─────────────────────────────────────────────────────────────────────────────
function BreakEvenForecast() {
  const { store } = useApp();
  const { transactions } = store;
  const [revGrowth, setRevGrowth] = useState(3);
  const hist = useMemo(() => monthlyAggregates(transactions ?? [], 6), [transactions]);

  const base = useMemo(() => {
    const active = hist.filter(m => m.revenue > 0 || m.expense > 0);
    const n = Math.max(1, active.length);
    const rev = active.reduce((s, m) => s + m.revenue, 0) / n;
    const exp = active.reduce((s, m) => s + m.expense, 0) / n;
    return { rev, exp };
  }, [hist]);

  const proj = useMemo(() => {
    const now = new Date();
    const out: { label: string; monthlyNet: number; cumulative: number }[] = [];
    let rev = base.rev, cum = 0, breakMonth: number | null = null;
    for (let i = 1; i <= 24; i++) {
      rev = rev * (1 + revGrowth / 100);
      const net = rev - base.exp;
      cum += net;
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({ label: format(d, "MMM yy"), monthlyNet: Math.round(net), cumulative: Math.round(cum) });
      if (breakMonth === null && net >= 0) breakMonth = i;
    }
    return { rows: out, breakMonth };
  }, [base, revGrowth]);

  const alreadyPositive = base.rev - base.exp >= 0;
  const breakDate = proj.breakMonth != null ? new Date(new Date().getFullYear(), new Date().getMonth() + proj.breakMonth, 1) : null;

  return (
    <div className="space-y-4">
      <ToolHeader icon={Target} title="Break-Even Cash Date" blurb="Projects monthly net cash from your trailing run-rate plus a growth assumption, and pinpoints the month you turn cash-flow positive." />
      <StatGrid cols="md:grid-cols-3" cards={[
        { label: "Current monthly net", value: formatCurrency(Math.round(base.rev - base.exp)), color: alreadyPositive ? "text-green-400" : "text-red-400" },
        { label: "Assumed rev growth", value: `${revGrowth > 0 ? "+" : ""}${revGrowth}%/mo`, color: "text-[var(--color-text)]" },
        { label: "Break-even month", value: alreadyPositive ? "Already positive" : breakDate ? format(breakDate, "MMM yyyy") : "24+ months", color: alreadyPositive || breakDate ? "text-green-400" : "text-red-400" },
      ]} />
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Monthly revenue growth assumption</span><span className="font-semibold">{revGrowth > 0 ? "+" : ""}{revGrowth}%</span></label>
        <input type="range" min={-5} max={15} step={0.5} value={revGrowth} onChange={e => setRevGrowth(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      </div>
      {!alreadyPositive && !breakDate && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm">At {revGrowth}%/mo growth you don't reach cash-flow break-even within 24 months. Raise growth or cut the expense base.</p>
        </div>
      )}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Monthly net & cumulative cash (₹L)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={proj.rows.map(r => ({ label: r.label, monthlyNet: Math.round(r.monthlyNet / 100000), cumulative: Math.round(r.cumulative / 100000) }))}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#8a8060" }} tickLine={false} interval={2} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`₹${v}L`, name === "monthlyNet" ? "Monthly net" : "Cumulative"]} />
            <ReferenceLine y={0} stroke="#8a8060" strokeDasharray="4 2" />
            <Bar dataKey="monthlyNet" radius={[2, 2, 0, 0]} animationDuration={400}>
              {proj.rows.map((r, i) => <Cell key={i} fill={r.monthlyNet >= 0 ? "#1A6B55" : "#ef4444"} />)}
            </Bar>
            <Line type="monotone" dataKey="cumulative" stroke="#22c55e" strokeWidth={2} dot={false} animationDuration={400} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Small clamp local to this module's tool helpers (engine's clamp isn't exported as default).
function clampNum(x: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, x)); }
