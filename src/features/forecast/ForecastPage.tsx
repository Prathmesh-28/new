import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { Plus, Trash2, Eye, EyeOff, TrendingUp, RefreshCw, Sparkles, X } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Line, ComposedChart, ReferenceLine,
} from "recharts";
import { format } from "date-fns";
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
  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiText,    setAiText]    = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const navigate = useNavigate();
  const activeScenario = scenarios.find(s => s.active);

  const pressureDay = forecast.slice(0, 45).findIndex(f => f.p10 < 0);
  const slowFactor  = slowPct / 100;

  const chartData = forecast.slice(0, 90).map((f, i) => {
    let adj = 0;
    if (activeScenario) {
      const p   = activeScenario.params as Record<string, unknown>;
      const amt = Number(p.amount ?? 0);
      switch (activeScenario.type) {
        case "contract_won":
          adj = i > 10 ? amt : 0;
          break;
        case "new_hire":
          adj = i > 15 ? -Number(p.salary ?? amt) * (i / 30) : 0;
          break;
        case "loan_draw": {
          const r   = 0.018;
          const n   = Number(p.termMonths ?? 12);
          const emi = n > 0 ? amt * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : 0;
          adj = amt - Math.min(Math.floor(i / 30), n) * emi;
          break;
        }
        case "custom": {
          const startIdx = p.startDate
            ? Math.max(0, Math.round((new Date(p.startDate as string).getTime() - Date.now()) / 86400000))
            : 0;
          adj = i >= startIdx ? amt : 0;
          break;
        }
      }
    }
    const p50 = Math.round(f.p50 * slowFactor / 100000);
    const p10 = Math.round(f.p10 * slowFactor / 100000);
    const p90 = Math.round(f.p90 / 100000);
    return {
      date:     format(new Date(f.date), "MMM d"),
      p50, p10, p90,
      scenario: activeScenario ? Math.round((f.p50 * slowFactor + adj) / 100000) : undefined,
    };
  });

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
      const data = await api.post<{ forecast: typeof forecast }>("/api/forecast/trigger", {});
      if (data?.forecast?.length) {
        setStore(s => ({ ...s, forecast: data.forecast }));
        toast.success("90-day forecast generated");
      } else {
        localForecast();
      }
    } catch {
      localForecast();
    } finally {
      autoAddGSTObligation();
      setGenerating(false);
    }
  };

  const localForecast = () => {
    const startBalance = bankAccounts.reduce((a, b) => a + b.balance, 0);
    const net          = transactions.reduce((a, t) => a + t.amount, 0);
    const dailyNet     = net / Math.max(transactions.length, 1);
    const today        = new Date();
    const generated    = Array.from({ length: 90 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const p50 = startBalance + dailyNet * i;
      return { date: d.toISOString().split("T")[0], p10: p50 * 0.82, p50, p90: p50 * 1.18 };
    });
    setStore(s => ({ ...s, forecast: generated }));
    toast.success("Forecast generated from your transactions");
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

  const handleAiExplain = async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiText("");
    try {
      const balance = bankAccounts.reduce((a, b) => a + b.balance, 0);
      const runway  = pressureDay !== -1 ? `${pressureDay + 1} days` : "90+ days";
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
          {/* Pressure alert */}
          {pressureDay !== -1 && (
            <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TrendingUp size={16} className="text-red-400 shrink-0" />
                <p className="text-sm">P10 scenario goes below zero in <strong className="text-red-400">{pressureDay + 1} days</strong> — downside risk is high.</p>
              </div>
              <button onClick={() => navigate("/credit")}
                className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-3 py-1.5 rounded-lg hover:bg-red-900/60 shrink-0 whitespace-nowrap">
                See options →
              </button>
            </div>
          )}

          {/* Chart */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 md:p-6">
            <h2 className="text-sm font-semibold mb-4">90-Day Projection (₹L) · P10 / P50 / P90</h2>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={14} />
                <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#1e1e14", border: "1px solid #2e2e1a", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`₹${v}L`, ""]} />
                <Area type="monotone" dataKey="p90" stroke="#C9A227" strokeWidth={1} strokeDasharray="4 2" fill="#C9A22710" />
                <Area type="monotone" dataKey="p50" stroke="#C9A227" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="p10" stroke="#C9A227" strokeWidth={1} strokeDasharray="4 2" fill="transparent" />
                {activeScenario && <Line type="monotone" dataKey="scenario" stroke="#e0b830" strokeWidth={2} strokeDasharray="6 3" dot={false} />}
                {oblMarkers.map(o => (
                  <ReferenceLine key={o.id} x={o.chartDate} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1.5}
                    label={{ value: o.name, position: "insideTopRight", fontSize: 8, fill: "#ef4444" }} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            {oblMarkers.length > 0 && (
              <p className="text-[10px] text-red-400 mt-2">Red lines = cash obligations due</p>
            )}
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
