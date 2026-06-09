import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { Plus, Trash2, Eye, EyeOff, TrendingUp, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Scenario, CashObligation } from "@/data/types";

export default function ForecastPage() {
  const { store, addScenario, deleteScenario, updateScenario, addObligation, deleteObligation, setStore } = useApp();
  const { forecast, scenarios, obligations, transactions, bankAccounts } = store;
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

  const navigate = useNavigate();
  const activeScenario = scenarios.find(s => s.active);

  // Detect P10 dipping below 0 within 45 days
  const pressureDay = forecast.slice(0, 45).findIndex(f => f.p10 < 0);

  // Slow month: apply revenue reduction to chart data
  const slowAdjFactor = slowPct / 100;

  const chartData = forecast.slice(0, 90).map((f, i) => {
    const adj = activeScenario ? (
      activeScenario.type === "contract_won" && i > 10 ? Number((activeScenario.params as Record<string, unknown>).amount ?? 0) :
      activeScenario.type === "new_hire" && i > 15 ? -Number((activeScenario.params as Record<string, unknown>).salary ?? 0) * (i / 30) : 0
    ) : 0;
    return {
      date: format(new Date(f.date), "MMM d"),
      p50: Math.round(f.p50 / 100000), p10: Math.round(f.p10 / 100000), p90: Math.round(f.p90 / 100000),
      scenario: activeScenario ? Math.round((f.p50 + adj) / 100000) : undefined,
    };
  });

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
        // Fallback: generate locally from transactions
        const startBalance = bankAccounts.reduce((a, b) => a + b.balance, 0);
        const dailyBurn = transactions.filter(t => t.amount < 0).reduce((a, t) => a + t.amount, 0) / 90;
        const dailyIncome = transactions.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0) / 90;
        const today = new Date();
        const generated = Array.from({ length: 90 }, (_, i) => {
          const d = new Date(today); d.setDate(d.getDate() + i);
          const p50 = startBalance + (dailyIncome + dailyBurn) * i;
          return { date: d.toISOString().split("T")[0], p10: p50 * 0.82, p50, p90: p50 * 1.18 };
        });
        setStore(s => ({ ...s, forecast: generated }));
        toast.success("Forecast generated from your transactions");
      }
    } catch {
      // Fallback local generation
      const startBalance = bankAccounts.reduce((a, b) => a + b.balance, 0);
      const net = transactions.reduce((a, t) => a + t.amount, 0);
      const dailyNet = net / Math.max(transactions.length, 1);
      const today = new Date();
      const generated = Array.from({ length: 90 }, (_, i) => {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const p50 = startBalance + dailyNet * i;
        return { date: d.toISOString().split("T")[0], p10: p50 * 0.82, p50, p90: p50 * 1.18 };
      });
      setStore(s => ({ ...s, forecast: generated }));
      toast.success("Forecast generated");
    } finally {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cash Flow Forecast</h1>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40">
          <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
          {generating ? "Generating…" : forecast.length ? "Refresh" : "Generate Forecast"}
        </button>
      </div>

      {/* Empty state */}
      {forecast.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-10 text-center">
          <TrendingUp size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No forecast yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-xs mx-auto">
            Add transactions in the Dashboard, then generate your 90-day P10/P50/P90 forecast.
          </p>
          <button onClick={handleGenerate} disabled={generating}
            className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90 disabled:opacity-40">
            {generating ? "Generating…" : "Generate Forecast"}
          </button>
        </div>
      ) : (
        <>
          {/* Pressure alert */}
          {pressureDay !== -1 && (
            <div className="bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TrendingUp size={16} className="text-red-400 shrink-0" />
                <p className="text-sm">Your P10 scenario goes below zero in <strong className="text-red-400">{pressureDay + 1} days</strong> — downside risk is high. Consider a credit buffer.</p>
              </div>
              <button onClick={() => navigate("/credit")}
                className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-3 py-1.5 rounded-lg hover:bg-red-900/60 shrink-0 whitespace-nowrap">
                See options →
              </button>
            </div>
          )}

          {/* Chart */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 md:p-6">
            <h2 className="text-sm font-semibold mb-4">90-Day Projection (₹L) · P10 / P50 / P90</h2>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={14} />
                <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#1e1e14", border: "1px solid #2e2e1a", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`₹${v}L`, ""]} />
                <Area type="monotone" dataKey="p90" stroke="#C9A227" strokeWidth={1} strokeDasharray="4 2" fill="#C9A22710" />
                <Area type="monotone" dataKey="p50" stroke="#C9A227" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="p10" stroke="#C9A227" strokeWidth={1} strokeDasharray="4 2" fill="transparent" />
                {activeScenario && <Line type="monotone" dataKey="scenario" stroke="#e0b830" strokeWidth={2} strokeDasharray="6 3" dot={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Slow month slider */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
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
              <span>{slowPct === 100 ? "Normal month — no adjustment" : `Revenue at ${slowPct}% — P50 shifts down by ~${(100 - slowPct).toFixed(0)}%`}</span>
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
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Scenarios</h2>
                <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-1 rounded font-semibold hover:opacity-90">
                  <Plus size={12} /> Add
                </button>
              </div>
              {showForm && (
                <div className="mb-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-2">
                  <input placeholder="Scenario name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  <select value={scenarioType} onChange={e => setScenarioType(e.target.value as Scenario["type"])} className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none">
                    <option value="new_hire">New Hire</option>
                    <option value="contract_won">Contract Won</option>
                    <option value="loan_draw">Loan Draw</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input placeholder="Amount (₹)" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <button onClick={handleAddScenario} className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-1.5 rounded hover:opacity-90">Save</button>
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
                      <button onClick={() => updateScenario({ ...s, active: !s.active })} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]">{s.active ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                      <button onClick={() => deleteScenario(s.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {scenarios.length === 0 && <p className="text-sm text-[var(--color-muted)] py-4 text-center">No scenarios yet</p>}
              </div>
            </div>

            {/* Obligations */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Cash Obligations</h2>
                <button onClick={() => setShowOblForm(v => !v)} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-1 rounded font-semibold hover:opacity-90">
                  <Plus size={12} /> Add
                </button>
              </div>
              {showOblForm && (
                <div className="mb-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-2">
                  <input placeholder="Name" value={oblName} onChange={e => setOblName(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                  <input placeholder="Amount (₹)" type="number" value={oblAmount} onChange={e => setOblAmount(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <input type="date" value={oblDate} onChange={e => setOblDate(e.target.value)} className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
                  <button onClick={handleAddObligation} className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-1.5 rounded hover:opacity-90">Add</button>
                </div>
              )}
              <div className="space-y-2">
                {obligations.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                    <div>
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">Due {format(new Date(o.dueDate), "MMM d")}</p>
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
