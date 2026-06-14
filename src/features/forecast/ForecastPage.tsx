import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { runForecast, generateForecast } from "@/lib/forecastEngine";
import { scheduleReminders, cancelReminders } from "@/lib/nativeFeatures";
import { isNative } from "@/lib/mobile";
import { Plus, Trash2, Eye, EyeOff, TrendingUp, RefreshCw, Sparkles, X } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Line, ComposedChart, ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { SeriesLegend, useSeriesToggle } from "@/components/charts/ChartKit";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Scenario, CashObligation } from "@/data/types";

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
    </div>
  );
}
