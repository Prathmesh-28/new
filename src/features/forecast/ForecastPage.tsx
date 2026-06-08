import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Scenario, CashObligation } from "@/data/types";

export default function ForecastPage() {
  const { store, addScenario, deleteScenario, updateScenario, addObligation, deleteObligation } = useApp();
  const { forecast, scenarios, obligations } = store;
  const [showForm, setShowForm] = useState(false);
  const [scenarioType, setScenarioType] = useState<Scenario["type"]>("new_hire");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [showObligationForm, setShowObligationForm] = useState(false);
  const [oblName, setOblName] = useState("");
  const [oblAmount, setOblAmount] = useState("");
  const [oblDate, setOblDate] = useState("");

  const activeScenario = scenarios.find(s => s.active);

  const chartData = forecast.slice(0, 90).map((f, i) => {
    const scenarioAdjust = activeScenario
      ? (activeScenario.type === "contract_won" && i > 10
          ? Number((activeScenario.params as Record<string, unknown>).amount ?? 0)
          : activeScenario.type === "new_hire" && i > 15
          ? -Number((activeScenario.params as Record<string, unknown>).salary ?? 0) * (i / 30)
          : 0)
      : 0;
    return {
      date: format(new Date(f.date), "MMM d"),
      p50:  Math.round(f.p50 / 100000),
      p10:  Math.round(f.p10 / 100000),
      p90:  Math.round(f.p90 / 100000),
      scenario: activeScenario ? Math.round((f.p50 + scenarioAdjust) / 100000) : undefined,
    };
  });

  const handleAddScenario = () => {
    if (!name || !amount) return;
    addScenario({
      id: generateId(), name, type: scenarioType, active: false,
      params: { amount: Number(amount), startDate },
      createdAt: new Date().toISOString(),
    });
    toast.success("Scenario saved");
    setShowForm(false); setName(""); setAmount(""); setStartDate("");
  };

  const handleAddObligation = () => {
    if (!oblName || !oblAmount || !oblDate) return;
    addObligation({ id: generateId(), name: oblName, amount: Number(oblAmount), dueDate: oblDate, type: "other" });
    toast.success("Obligation added");
    setShowObligationForm(false); setOblName(""); setOblAmount(""); setOblDate("");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Cash Flow Forecast</h1>

      {/* Chart */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-4">90-Day Projection (₹L) · P10 / P50 / P90</h2>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={14} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "#1e1e14", border: "1px solid #2e2e1a", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`₹${v}L`, ""]}
            />
            <Area type="monotone" dataKey="p90" stroke="#C9A227" strokeWidth={1} strokeDasharray="4 2" fill="#C9A22710" />
            <Area type="monotone" dataKey="p50" stroke="#C9A227" strokeWidth={2} fill="transparent" />
            <Area type="monotone" dataKey="p10" stroke="#C9A227" strokeWidth={1} strokeDasharray="4 2" fill="transparent" />
            {activeScenario && (
              <Line type="monotone" dataKey="scenario" stroke="#e0b830" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {activeScenario && (
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Gold dashed line = scenario: <span className="text-[var(--color-primary)]">{activeScenario.name}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scenarios */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Scenarios</h2>
            <button onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-1 rounded font-semibold hover:opacity-90">
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
                className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-1.5 rounded hover:opacity-90">
                Save scenario
              </button>
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
                  <button onClick={() => updateScenario({ ...s, active: !s.active })}
                    className="text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                    {s.active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => deleteScenario(s.id)} className="text-[var(--color-muted)] hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {scenarios.length === 0 && <p className="text-sm text-[var(--color-muted)]">No scenarios yet</p>}
          </div>
        </div>

        {/* Obligations */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Cash Obligations</h2>
            <button onClick={() => setShowObligationForm(v => !v)}
              className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-1 rounded font-semibold hover:opacity-90">
              <Plus size={12} /> Add
            </button>
          </div>

          {showObligationForm && (
            <div className="mb-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-2">
              <input placeholder="Name" value={oblName} onChange={e => setOblName(e.target.value)}
                className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
              <input placeholder="Amount (₹)" type="number" value={oblAmount} onChange={e => setOblAmount(e.target.value)}
                className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
              <input type="date" value={oblDate} onChange={e => setOblDate(e.target.value)}
                className="w-full bg-transparent border border-[var(--color-border)] rounded px-2 py-1.5 text-sm outline-none" />
              <button onClick={handleAddObligation}
                className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-1.5 rounded hover:opacity-90">
                Add obligation
              </button>
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
                  <button onClick={() => deleteObligation(o.id)} className="text-[var(--color-muted)] hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
