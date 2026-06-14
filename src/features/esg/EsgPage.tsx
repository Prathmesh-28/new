import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Leaf, Factory, Zap, Droplets, ClipboardCheck, FileCheck2, Recycle,
  Gauge, Truck, Trees, Target, CheckCircle2, AlertTriangle, Plus, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

// Shared input + card styles (reused from TaxPage convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "footprint" | "scopes" | "energy" | "scorecard" | "brsr"
  | "greenspend" | "intensity" | "supplier" | "offset" | "goals";

export default function EsgPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Leaf size={18} className="text-[var(--color-primary)]" /> Sustainability & ESG
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Carbon footprint, Scope 1/2/3, BRSR-lite, green spend & ESG goals — estimated from your live books, India-aware (BRSR, SEBI, CBAM).
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", Leaf],
            ["footprint", "Carbon Footprint", Factory],
            ["scopes", "Scope 1/2/3", Gauge],
            ["energy", "Energy & Water", Zap],
            ["scorecard", "ESG Scorecard", ClipboardCheck],
            ["brsr", "BRSR-Lite", FileCheck2],
            ["greenspend", "Green Spend", Recycle],
            ["intensity", "Emission Intensity", TrendingDown],
            ["supplier", "Supplier Rating", Truck],
            ["offset", "Offset Cost", Trees],
            ["goals", "Goal Tracker", Target],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview onJump={setTab} />}
      {tab === "footprint" && <CarbonFootprintEstimator />}
      {tab === "scopes" && <ScopeCalculator />}
      {tab === "energy" && <EnergyWaterTracker />}
      {tab === "scorecard" && <EsgScorecard />}
      {tab === "brsr" && <BrsrLiteChecklist />}
      {tab === "greenspend" && <GreenSpendTracker />}
      {tab === "intensity" && <EmissionIntensity />}
      {tab === "supplier" && <SupplierSustainabilityRating />}
      {tab === "offset" && <CarbonOffsetEstimator />}
      {tab === "goals" && <SustainabilityGoalTracker />}
    </div>
  );
}

// ── India emission factors (kg CO2e per unit) — spend & activity based ──────────
// Spend-based: kg CO2e per ₹1,000 of spend (rough EEIO-style screening factors).
const SPEND_FACTORS: { id: string; label: string; perThousand: number }[] = [
  { id: "fuel", label: "Fuel (diesel/petrol)", perThousand: 70 },
  { id: "electricity", label: "Electricity / power bills", perThousand: 55 },
  { id: "travel", label: "Travel (air/road/rail)", perThousand: 40 },
  { id: "logistics", label: "Freight & logistics", perThousand: 50 },
  { id: "materials", label: "Raw materials / goods", perThousand: 30 },
  { id: "services", label: "Professional services", perThousand: 8 },
];
// Activity factors
const GRID_FACTOR = 0.71;      // kg CO2e / kWh — India CEA average grid factor
const DIESEL_FACTOR = 2.68;    // kg CO2e / litre
const PETROL_FACTOR = 2.31;    // kg CO2e / litre
const LPG_FACTOR = 2.98;       // kg CO2e / kg

const fmtT = (kg: number) => `${(kg / 1000).toFixed(2)} tCO₂e`;

// ── #1 Carbon Footprint Estimator (spend-based, from expense categories) ────────
function CarbonFootprintEstimator() {
  const { store } = useApp();
  // Total expense spend from live books (used as a hint / quick-fill).
  const annualExpense = useMemo(
    () => store.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    [store.transactions],
  );

  const [spend, setSpend] = useState<Record<string, string>>({});
  const set = (id: string, v: string) => setSpend(p => ({ ...p, [id]: v }));

  const rows = SPEND_FACTORS.map(f => {
    const amt = parseFloat(spend[f.id]) || 0;
    return { ...f, amt, kg: (amt / 1000) * f.perThousand };
  });
  const totalSpend = rows.reduce((s, r) => s + r.amt, 0);
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Factory size={14} className="text-[var(--color-primary)]" /> Carbon Footprint Estimator (spend-based)</h3>
          <span className="text-[10px] text-[var(--color-muted)]">Annual expense in books: {formatCurrency(Math.round(annualExpense))}</span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Quick screening footprint from how much you spend per category. Use this when activity data (litres, kWh) isn't handy — it's an order-of-magnitude estimate, not an audited inventory.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SPEND_FACTORS.map(f => (
            <div key={f.id}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{f.label} — annual ₹</label>
              <input type="number" value={spend[f.id] ?? ""} onChange={e => set(f.id, e.target.value)} placeholder="0" className={INP} />
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{f.perThousand} kg CO₂e / ₹1,000</p>
            </div>
          ))}
        </div>
      </div>

      {totalSpend > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Categorised spend", value: formatCurrency(Math.round(totalSpend)), color: "text-[var(--color-text)]" },
              { label: "Estimated footprint", value: fmtT(totalKg), color: "text-orange-400" },
              { label: "Largest source", value: rows.reduce((a, b) => (b.kg > a.kg ? b : a)).label, color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-4 space-y-2`}>
            <p className="text-sm font-semibold mb-1">Breakdown by category</p>
            {rows.filter(r => r.kg > 0).sort((a, b) => b.kg - a.kg).map(r => {
              const pct = totalKg > 0 ? (r.kg / totalKg) * 100 : 0;
              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium">{r.label}</span>
                    <span className="tabular-nums text-orange-400">{fmtT(r.kg)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-orange-500/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter at least one category's annual spend to estimate your carbon footprint.</p>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Spend-based (EEIO-style) screening factors for India. For BRSR or CBAM you'll need activity-based data — use the Scope 1/2/3 calculator for that.</p>
    </div>
  );
}

// ── #2 Scope 1/2/3 Calculator (activity-based) ──────────────────────────────────
function ScopeCalculator() {
  // Scope 1 — direct combustion
  const [diesel, setDiesel] = useState("");
  const [petrol, setPetrol] = useState("");
  const [lpg, setLpg] = useState("");
  // Scope 2 — purchased electricity
  const [kwh, setKwh] = useState("");
  // Scope 3 — value chain (spend-based proxy)
  const [purchased, setPurchased] = useState("");
  const [logistics, setLogistics] = useState("");
  const [businessTravel, setBusinessTravel] = useState("");

  const n = (v: string) => parseFloat(v) || 0;
  const scope1 = n(diesel) * DIESEL_FACTOR + n(petrol) * PETROL_FACTOR + n(lpg) * LPG_FACTOR;
  const scope2 = n(kwh) * GRID_FACTOR;
  const scope3 =
    (n(purchased) / 1000) * 30 + (n(logistics) / 1000) * 50 + (n(businessTravel) / 1000) * 40;
  const total = scope1 + scope2 + scope3;
  const has = total > 0;

  const scopes = [
    { label: "Scope 1 — Direct", kg: scope1, color: "#ef4444", desc: "Fuel burned in your own vehicles & equipment" },
    { label: "Scope 2 — Energy", kg: scope2, color: "#f97316", desc: "Purchased grid electricity (CEA factor)" },
    { label: "Scope 3 — Value chain", kg: scope3, color: "#eab308", desc: "Purchased goods, freight, business travel" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${CARD} p-4 space-y-3`}>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Factory size={13} className="text-red-400" /> Scope 1 — Direct</h3>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Diesel (litres/yr)</label>
            <input type="number" value={diesel} onChange={e => setDiesel(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Petrol (litres/yr)</label>
            <input type="number" value={petrol} onChange={e => setPetrol(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">LPG (kg/yr)</label>
            <input type="number" value={lpg} onChange={e => setLpg(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
        <div className={`${CARD} p-4 space-y-3`}>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Zap size={13} className="text-orange-400" /> Scope 2 — Energy</h3>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Grid electricity (kWh/yr)</label>
            <input type="number" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="0" className={INP} />
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Grid factor {GRID_FACTOR} kg CO₂e/kWh (CEA India average). Subtract renewable/REC-backed units.</p>
        </div>
        <div className={`${CARD} p-4 space-y-3`}>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Truck size={13} className="text-yellow-400" /> Scope 3 — Value chain (₹)</h3>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purchased goods (₹/yr)</label>
            <input type="number" value={purchased} onChange={e => setPurchased(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Freight & logistics (₹/yr)</label>
            <input type="number" value={logistics} onChange={e => setLogistics(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Business travel (₹/yr)</label>
            <input type="number" value={businessTravel} onChange={e => setBusinessTravel(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {has ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {scopes.map(s => (
              <div key={s.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{fmtT(s.kg)}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{total > 0 ? `${((s.kg / total) * 100).toFixed(0)}% of total` : ""}</p>
              </div>
            ))}
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">Total GHG inventory</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-text)]">{fmtT(total)}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Scope 1 + 2 + 3</p>
            </div>
          </div>
          <div className={`${CARD} p-4 space-y-2`}>
            <p className="text-sm font-semibold mb-1">Inventory split</p>
            <div className="flex h-4 w-full rounded-full overflow-hidden bg-[var(--color-bg)]">
              {scopes.map(s => (
                <div key={s.label} style={{ width: `${total > 0 ? (s.kg / total) * 100 : 0}%`, background: s.color }} title={`${s.label}: ${fmtT(s.kg)}`} />
              ))}
            </div>
            {scopes.map(s => (
              <p key={s.label} className="text-[11px] text-[var(--color-muted)]">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: s.color }} />
                {s.label} — {s.desc}
              </p>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter at least one activity figure to build a GHG Protocol Scope 1/2/3 inventory.</p>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Aligned to the GHG Protocol. Scope 3 here uses spend-based proxies for screening; primary supplier data gives a defensible figure for assurance.</p>
    </div>
  );
}

// ── #3 Energy & Water Tracker (durable monthly log) ─────────────────────────────
type UtilityRow = { id: string; month: string; kwh: number; waterKl: number; cost: number };
function EnergyWaterTracker() {
  const [rows, setRows] = useFeatureState<UtilityRow[]>("esg-utility-log", []);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [kwh, setKwh] = useState("");
  const [waterKl, setWaterKl] = useState("");
  const [cost, setCost] = useState("");

  const add = () => {
    const k = parseFloat(kwh), w = parseFloat(waterKl);
    if (!month || (isNaN(k) && isNaN(w))) { toast.error("Enter a month and at least one reading"); return; }
    setRows([...rows, { id: crypto.randomUUID(), month, kwh: k || 0, waterKl: w || 0, cost: parseFloat(cost) || 0 }]);
    setKwh(""); setWaterKl(""); setCost("");
    toast.success("Reading logged");
  };

  const totalKwh = rows.reduce((s, r) => s + r.kwh, 0);
  const totalWater = rows.reduce((s, r) => s + r.waterKl, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const emissionsKg = totalKwh * GRID_FACTOR;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Droplets size={14} className="text-blue-400" /> Energy & Water Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Log monthly electricity (kWh) and water (kilolitres) from your DISCOM/utility bills. Builds the data behind Scope 2 and water disclosure.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Electricity (kWh)</label>
            <input type="number" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Water (kL)</label>
            <input type="number" value={waterKl} onChange={e => setWaterKl(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Bill cost (₹)</label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total electricity", value: `${totalKwh.toLocaleString("en-IN")} kWh`, color: "text-orange-400" },
              { label: "Scope 2 emissions", value: fmtT(emissionsKg), color: "text-red-400" },
              { label: "Total water", value: `${totalWater.toLocaleString("en-IN")} kL`, color: "text-blue-400" },
              { label: "Utility spend", value: formatCurrency(Math.round(totalCost)), color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Month", "kWh", "Water (kL)", "Cost", "CO₂e", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {[...rows].sort((a, b) => b.month.localeCompare(a.month)).map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5">{r.month}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.kwh.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.waterKl.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.cost))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400">{fmtT(r.kwh * GRID_FACTOR)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #4 ESG Scorecard (E/S/G self-assessment) ────────────────────────────────────
type EsgQ = { id: string; pillar: "E" | "S" | "G"; q: string };
const ESG_QUESTIONS: EsgQ[] = [
  { id: "e1", pillar: "E", q: "Measure your carbon footprint annually" },
  { id: "e2", pillar: "E", q: "Track energy & water consumption" },
  { id: "e3", pillar: "E", q: "Have a waste / recycling process" },
  { id: "e4", pillar: "E", q: "Use any renewable energy" },
  { id: "s1", pillar: "S", q: "Provide written contracts & fair wages to all staff" },
  { id: "s2", pillar: "S", q: "Have a workplace health & safety policy" },
  { id: "s3", pillar: "S", q: "Track gender diversity in the workforce" },
  { id: "s4", pillar: "S", q: "Run community / CSR initiatives" },
  { id: "g1", pillar: "G", q: "Maintain audited financial statements" },
  { id: "g2", pillar: "G", q: "Have an anti-bribery / code-of-conduct policy" },
  { id: "g3", pillar: "G", q: "Document data-privacy & security practices" },
  { id: "g4", pillar: "G", q: "Have a board / advisory governance structure" },
];
function EsgScorecard() {
  const [answers, setAnswers] = useFeatureState<Record<string, boolean>>("esg-scorecard", {});
  const toggle = (id: string) => setAnswers({ ...answers, [id]: !answers[id] });

  const pillar = (p: "E" | "S" | "G") => {
    const qs = ESG_QUESTIONS.filter(q => q.pillar === p);
    const yes = qs.filter(q => answers[q.id]).length;
    return { yes, total: qs.length, pct: Math.round((yes / qs.length) * 100) };
  };
  const E = pillar("E"), S = pillar("S"), G = pillar("G");
  const overall = Math.round((E.pct + S.pct + G.pct) / 3);
  const band = overall >= 75 ? { label: "Leader", color: "text-green-400" } : overall >= 50 ? { label: "Progressing", color: "text-yellow-400" } : overall >= 25 ? { label: "Developing", color: "text-orange-400" } : { label: "Starting out", color: "text-red-400" };

  const PILLARS = [
    { key: "E" as const, name: "Environment", data: E, color: "#22c55e" },
    { key: "S" as const, name: "Social", data: S, color: "#3b82f6" },
    { key: "G" as const, name: "Governance", data: G, color: "#a855f7" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Overall ESG Score</p>
          <p className={`text-2xl font-bold tabular-nums ${band.color}`}>{overall}<span className="text-sm">/100</span></p>
          <p className={`text-[10px] mt-0.5 ${band.color}`}>{band.label}</p>
        </div>
        {PILLARS.map(p => (
          <div key={p.key} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{p.name}</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: p.color }}>{p.data.pct}%</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{p.data.yes}/{p.data.total} practices in place</p>
          </div>
        ))}
      </div>

      {PILLARS.map(p => (
        <div key={p.key} className={`${CARD} p-4 space-y-2`}>
          <p className="text-sm font-semibold flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color }} /> {p.name}</p>
          {ESG_QUESTIONS.filter(q => q.pillar === p.key).map(q => (
            <label key={q.id} className="flex items-center gap-2.5 cursor-pointer text-sm py-1">
              <input type="checkbox" checked={!!answers[q.id]} onChange={() => toggle(q.id)} className="accent-[var(--color-primary)]" />
              <span className={answers[q.id] ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}>{q.q}</span>
            </label>
          ))}
        </div>
      ))}
      <p className="text-[10px] text-[var(--color-muted)]">A directional self-assessment across Environment, Social and Governance — useful for investor/lender ESG questionnaires. Not a certified rating.</p>
    </div>
  );
}

// ── #5 BRSR-Lite Readiness Checklist ────────────────────────────────────────────
type BrsrItem = { id: string; section: string; label: string };
const BRSR_ITEMS: BrsrItem[] = [
  { id: "b1", section: "General", label: "CIN, PAN, GSTIN & registered address on file" },
  { id: "b2", section: "General", label: "List of products/services with NIC codes" },
  { id: "b3", section: "Environment", label: "Energy consumption (electricity + fuel) totalled" },
  { id: "b4", section: "Environment", label: "Water withdrawal & discharge recorded" },
  { id: "b5", section: "Environment", label: "Scope 1 & Scope 2 GHG emissions computed" },
  { id: "b6", section: "Environment", label: "Waste generated & recycled quantified" },
  { id: "b7", section: "Social", label: "Employee & worker headcount with gender split" },
  { id: "b8", section: "Social", label: "Health, safety & POSH (anti-harassment) policy" },
  { id: "b9", section: "Social", label: "CSR spend & beneficiary details" },
  { id: "b10", section: "Governance", label: "Code of conduct / anti-corruption policy" },
  { id: "b11", section: "Governance", label: "Grievance redressal mechanism documented" },
  { id: "b12", section: "Governance", label: "Data privacy & cyber-security practices stated" },
];
function BrsrLiteChecklist() {
  const [done, setDone] = useFeatureState<Record<string, boolean>>("esg-brsr-lite", {});
  const toggle = (id: string) => setDone({ ...done, [id]: !done[id] });
  const sections = Array.from(new Set(BRSR_ITEMS.map(i => i.section)));
  const completed = BRSR_ITEMS.filter(i => done[i.id]).length;
  const pct = Math.round((completed / BRSR_ITEMS.length) * 100);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><FileCheck2 size={14} className="text-[var(--color-primary)]" /> BRSR-Lite Readiness</h3>
          <span className={`text-sm font-bold tabular-nums ${pct === 100 ? "text-green-400" : "text-yellow-400"}`}>{completed}/{BRSR_ITEMS.length} ready · {pct}%</span>
        </div>
        <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          SEBI's BRSR applies to the top 1,000 listed firms, but value-chain SMBs are increasingly asked for these data points. Tick what you can already evidence.
        </p>
      </div>

      {sections.map(sec => (
        <div key={sec} className={`${CARD} p-4 space-y-2`}>
          <p className="text-sm font-semibold">{sec}</p>
          {BRSR_ITEMS.filter(i => i.section === sec).map(i => (
            <label key={i.id} className="flex items-center gap-2.5 cursor-pointer text-sm py-1">
              <input type="checkbox" checked={!!done[i.id]} onChange={() => toggle(i.id)} className="accent-[var(--color-primary)]" />
              <span className={done[i.id] ? "text-[var(--color-text)] line-through opacity-70" : "text-[var(--color-text)]"}>{i.label}</span>
            </label>
          ))}
        </div>
      ))}

      {pct === 100 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> All BRSR-lite data points are in place — you can respond to a value-chain disclosure request with confidence.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A simplified readiness list inspired by SEBI BRSR Core. Full BRSR has nine principles; consult your CA / ESG advisor for a formal filing.</p>
    </div>
  );
}

// ── #6 Green Spend Tracker ──────────────────────────────────────────────────────
type GreenItem = { id: string; name: string; amount: number; type: string };
const GREEN_TYPES = ["Renewable energy", "Energy efficiency", "Waste / recycling", "Sustainable materials", "EV / clean transport", "Offsets / RECs", "Other green"];
function GreenSpendTracker() {
  const { store } = useApp();
  const annualSpend = useMemo(
    () => store.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    [store.transactions],
  );
  const [items, setItems] = useFeatureState<GreenItem[]>("esg-green-spend", []);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState(GREEN_TYPES[0]);

  const add = () => {
    const a = parseFloat(amount);
    if (!name.trim() || isNaN(a) || a <= 0) { toast.error("Enter a description and amount"); return; }
    setItems([...items, { id: crypto.randomUUID(), name: name.trim(), amount: a, type }]);
    setName(""); setAmount("");
    toast.success("Green spend logged");
  };

  const total = items.reduce((s, i) => s + i.amount, 0);
  const greenPct = annualSpend > 0 ? (total / annualSpend) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Recycle size={14} className="text-green-400" /> Green Spend Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Tag the spend that advances sustainability — useful for green-finance applications and impact reporting.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Description</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rooftop solar" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={INP}>
              {GREEN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Total green spend", value: formatCurrency(Math.round(total)), color: "text-green-400" },
              { label: "% of total expenses", value: `${greenPct.toFixed(1)}%`, color: "text-[var(--color-primary)]" },
              { label: "Green initiatives", value: `${items.length}`, color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Initiative", "Type", "Amount", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {items.map(i => (
                    <tr key={i.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{i.name}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{i.type}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(i.amount))}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setItems(items.filter(x => x.id !== i.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #7 Emissions-per-Revenue Intensity ──────────────────────────────────────────
function EmissionIntensity() {
  const { store } = useApp();
  const annualRevenue = useMemo(
    () => store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [store.transactions],
  );
  const [emissionsT, setEmissionsT] = useState("");
  const [revenue, setRevenue] = useState("");
  const [prevIntensity, setPrevIntensity] = useState("");

  const rev = parseFloat(revenue) || annualRevenue;
  const tonnes = parseFloat(emissionsT) || 0;
  // tCO2e per ₹ crore of revenue
  const intensity = rev > 0 ? tonnes / (rev / 1_00_00_000) : 0;
  const prev = parseFloat(prevIntensity) || 0;
  const delta = prev > 0 && intensity > 0 ? ((intensity - prev) / prev) * 100 : null;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingDown size={14} className="text-[var(--color-primary)]" /> Emission Intensity (per ₹ revenue)</h3>
        <p className="text-xs text-[var(--color-muted)]">Normalises emissions to business size so you can track decarbonisation even as you grow. Pull totals from the Scope calculator.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total emissions (tCO₂e/yr)</label>
            <input type="number" value={emissionsT} onChange={e => setEmissionsT(e.target.value)} placeholder="e.g. 120" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual revenue (₹)</label>
            <input type="number" value={revenue} onChange={e => setRevenue(e.target.value)} placeholder={annualRevenue > 0 ? `Auto: ${Math.round(annualRevenue)}` : "e.g. 50000000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Prior-year intensity (optional)</label>
            <input type="number" value={prevIntensity} onChange={e => setPrevIntensity(e.target.value)} placeholder="tCO₂e / ₹cr" className={INP} />
          </div>
        </div>
      </div>

      {tonnes > 0 && rev > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Carbon intensity", value: `${intensity.toFixed(2)}`, sub: "tCO₂e / ₹ crore revenue", color: "text-orange-400" },
              { label: "Per ₹1 lakh revenue", value: `${(intensity / 100).toFixed(3)}`, sub: "tCO₂e / ₹ lakh", color: "text-[var(--color-text)]" },
              { label: "YoY change", value: delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`, sub: delta === null ? "Add prior year" : delta < 0 ? "Improving" : "Worsening", color: delta === null ? "text-[var(--color-muted)]" : delta < 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          {delta !== null && (
            <div className={`rounded-lg p-4 border ${delta < 0 ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
              <p className={`text-sm font-bold flex items-center gap-2 ${delta < 0 ? "text-green-400" : "text-orange-400"}`}>
                {delta < 0 ? <TrendingDown size={14} /> : <AlertTriangle size={14} />}
                Your carbon intensity {delta < 0 ? "fell" : "rose"} {Math.abs(delta).toFixed(1)}% YoY — {delta < 0 ? "real decarbonisation, not just lower output." : "emissions are growing faster than revenue; review your biggest sources."}
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Intensity = total tCO₂e ÷ revenue. A falling intensity is the headline metric lenders and BRSR reviewers look for, since absolute emissions can rise with growth.</p>
    </div>
  );
}

// ── #8 Supplier Sustainability Rating ───────────────────────────────────────────
type Supplier = { id: string; name: string; emissions: number; labour: number; governance: number; certified: boolean };
function SupplierSustainabilityRating() {
  const [suppliers, setSuppliers] = useFeatureState<Supplier[]>("esg-suppliers", []);
  const [name, setName] = useState("");
  const [emissions, setEmissions] = useState(3);
  const [labour, setLabour] = useState(3);
  const [governance, setGovernance] = useState(3);
  const [certified, setCertified] = useState(false);

  const add = () => {
    if (!name.trim()) { toast.error("Enter a supplier name"); return; }
    setSuppliers([...suppliers, { id: crypto.randomUUID(), name: name.trim(), emissions, labour, governance, certified }]);
    setName(""); setEmissions(3); setLabour(3); setGovernance(3); setCertified(false);
    toast.success("Supplier rated");
  };

  const rated = suppliers.map(s => ({ ...s, score: Math.min(100, Math.round(((s.emissions + s.labour + s.governance) / 15) * 100 * (s.certified ? 1.1 : 1))) }));
  const tier = (sc: number) => sc >= 75 ? { label: "Low risk", color: "text-green-400" } : sc >= 50 ? { label: "Watch", color: "text-yellow-400" } : { label: "High risk", color: "text-red-400" };

  const sliders: [string, number, (n: number) => void][] = [
    ["Emissions practices", emissions, setEmissions],
    ["Labour & human rights", labour, setLabour],
    ["Governance & ethics", governance, setGovernance],
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Truck size={14} className="text-[var(--color-primary)]" /> Supplier Sustainability Rating</h3>
        <p className="text-xs text-[var(--color-muted)]">Rate each key supplier 1–5 on three ESG dimensions to surface supply-chain risk and prioritise engagement.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Supplier name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Components Pvt Ltd" className={INP} />
            <label className="flex items-center gap-2 cursor-pointer text-xs mt-3">
              <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} className="accent-[var(--color-primary)]" />
              Holds an ESG / ISO 14001 certification
            </label>
          </div>
          <div className="space-y-3">
            {sliders.map(([label, val, setter]) => (
              <div key={label}>
                <label className="text-xs text-[var(--color-muted)] flex justify-between mb-1">{label} <strong className="text-[var(--color-text)]">{val}/5</strong></label>
                <input type="range" min={1} max={5} step={1} value={val} onChange={e => setter(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
              </div>
            ))}
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Rate supplier
        </button>
      </div>

      {rated.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Supplier", "Emissions", "Labour", "Governance", "Certified", "Score", "Tier", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...rated].sort((a, b) => b.score - a.score).map(s => {
                  const t = tier(s.score);
                  return (
                    <tr key={s.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{s.name}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.emissions}/5</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.labour}/5</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.governance}/5</td>
                      <td className="px-3 py-2.5">{s.certified ? <CheckCircle2 size={13} className="text-green-400" /> : <span className="text-[var(--color-muted)] text-xs">—</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">{s.score}</td>
                      <td className={`px-3 py-2.5 text-xs font-semibold ${t.color}`}>{t.label}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => setSuppliers(suppliers.filter(x => x.id !== s.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A subjective screening score. For Scope 3 assurance, replace these estimates with primary data from a supplier questionnaire.</p>
    </div>
  );
}

// ── #9 Carbon Offset Cost Estimator ─────────────────────────────────────────────
function CarbonOffsetEstimator() {
  const [residualT, setResidualT] = useState("");
  const [pricePerT, setPricePerT] = useState("1200");
  const [quality, setQuality] = useState<"basic" | "verified" | "removal">("verified");

  const tonnes = parseFloat(residualT) || 0;
  // Price multipliers by credit quality tier (over the base price)
  const mult = quality === "basic" ? 0.5 : quality === "verified" ? 1 : 3;
  const unit = (parseFloat(pricePerT) || 0) * mult;
  const cost = tonnes * unit;

  const QUALITY: { id: "basic" | "verified" | "removal"; label: string; desc: string }[] = [
    { id: "basic", label: "Basic / avoidance", desc: "REDD+, cookstoves — lower price, higher scrutiny" },
    { id: "verified", label: "Verified (Verra/Gold Std)", desc: "Independently audited, India afforestation/biogas" },
    { id: "removal", label: "Carbon removal", desc: "Biochar, DAC — highest integrity, premium price" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Trees size={14} className="text-green-400" /> Carbon Offset Cost Estimator</h3>
        <p className="text-xs text-[var(--color-muted)]">Estimate the cost to neutralise residual emissions you can't yet cut. Reduce first, offset only what remains.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Residual emissions to offset (tCO₂e)</label>
            <input type="number" value={residualT} onChange={e => setResidualT(e.target.value)} placeholder="e.g. 80" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base price (₹ / tCO₂e)</label>
            <input type="number" value={pricePerT} onChange={e => setPricePerT(e.target.value)} placeholder="1200" className={INP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-2">Credit quality</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {QUALITY.map(q => (
              <button key={q.id} onClick={() => setQuality(q.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${quality === q.id ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"}`}>
                <p className="text-xs font-semibold">{q.label}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{q.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {tonnes > 0 && unit > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Effective price / tonne", value: formatCurrency(Math.round(unit)), color: "text-[var(--color-text)]" },
            { label: "Tonnes to offset", value: `${tonnes.toLocaleString("en-IN")} tCO₂e`, color: "text-orange-400" },
            { label: "Estimated offset cost", value: formatCurrency(Math.round(cost)), color: "text-green-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Indicative only — voluntary carbon market prices vary widely by vintage, project and registry. Verify credit serial numbers to avoid double-counting. Offsetting is no substitute for cutting emissions at source.</p>
    </div>
  );
}

// ── #10 Sustainability Goal Tracker ─────────────────────────────────────────────
type Goal = { id: string; name: string; metric: string; baseline: number; current: number; target: number; targetYear: string };
function SustainabilityGoalTracker() {
  const [goals, setGoals] = useFeatureState<Goal[]>("esg-goals", []);
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("tCO₂e");
  const [baseline, setBaseline] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [targetYear, setTargetYear] = useState("2030");

  const add = () => {
    const b = parseFloat(baseline), c = parseFloat(current), t = parseFloat(target);
    if (!name.trim() || isNaN(b) || isNaN(c) || isNaN(t)) { toast.error("Enter goal name, baseline, current and target"); return; }
    setGoals([...goals, { id: crypto.randomUUID(), name: name.trim(), metric, baseline: b, current: c, target: t, targetYear }]);
    setName(""); setBaseline(""); setCurrent(""); setTarget("");
    toast.success("Goal added");
  };

  const progress = (g: Goal) => {
    const span = g.baseline - g.target;
    if (span === 0) return g.current <= g.target ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round(((g.baseline - g.current) / span) * 100)));
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Sustainability Goal Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Set SBTi-style reduction targets (baseline → target) and track progress. Works for emissions, energy, water or waste.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Goal</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Cut Scope 1+2" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Unit</label>
            <input value={metric} onChange={e => setMetric(e.target.value)} placeholder="tCO₂e" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Baseline</label>
            <input type="number" value={baseline} onChange={e => setBaseline(e.target.value)} placeholder="200" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current</label>
            <input type="number" value={current} onChange={e => setCurrent(e.target.value)} placeholder="160" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target</label>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="100" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">By year</label>
            <input value={targetYear} onChange={e => setTargetYear(e.target.value)} placeholder="2030" className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Add goal
        </button>
      </div>

      {goals.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No goals yet. Add a reduction target to track decarbonisation progress.</p>
      ) : (
        <div className="space-y-3">
          {goals.map(g => {
            const pct = progress(g);
            const achieved = g.current <= g.target;
            return (
              <div key={g.id} className={`${CARD} p-4 space-y-2`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{g.name}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {g.baseline} → <strong className="text-[var(--color-text)]">{g.current}</strong> → {g.target} {g.metric} · target by {g.targetYear}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold tabular-nums ${achieved ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-orange-400"}`}>{pct}%</span>
                    <button onClick={() => setGoals(goals.filter(x => x.id !== g.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                  </div>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${achieved ? "bg-green-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} />
                </div>
                {achieved && <p className="text-[11px] text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Target achieved — set a more ambitious next milestone.</p>}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Progress = reduction achieved ÷ reduction targeted. Align targets with SBTi or your net-zero pledge for credibility with lenders and customers.</p>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────────
function Overview({ onJump }: { onJump: (t: Tab) => void }) {
  const { store } = useApp();
  const { revenue, expense } = useMemo(() => {
    let revenue = 0, expense = 0;
    for (const t of store.transactions) { if (t.amount > 0) revenue += t.amount; else expense += Math.abs(t.amount); }
    return { revenue, expense };
  }, [store.transactions]);

  // Very rough whole-business screening estimate from total spend (mixed factor).
  const screeningKg = (expense / 1000) * 35;

  const cards = [
    { label: "Annual revenue (books)", value: formatCurrency(Math.round(revenue)), color: "text-green-400", sub: "Basis for emission intensity" },
    { label: "Annual expense (books)", value: formatCurrency(Math.round(expense)), color: "text-[var(--color-text)]", sub: "Basis for spend-based footprint" },
    { label: "Screening footprint", value: fmtT(screeningKg), color: "text-orange-400", sub: "Rough estimate — refine in Footprint" },
    { label: "Frameworks covered", value: "BRSR · GHG · CBAM", color: "text-[var(--color-primary)]", sub: "India-aware tooling" },
  ];

  const tools: { id: Tab; title: string; desc: string }[] = [
    { id: "footprint", title: "Carbon Footprint", desc: "Spend-based footprint from fuel, power & travel" },
    { id: "scopes", title: "Scope 1/2/3", desc: "Activity-based GHG Protocol inventory" },
    { id: "energy", title: "Energy & Water", desc: "Log monthly kWh and kilolitres" },
    { id: "scorecard", title: "ESG Scorecard", desc: "Self-assess Environment, Social, Governance" },
    { id: "brsr", title: "BRSR-Lite", desc: "Readiness checklist for value-chain disclosure" },
    { id: "greenspend", title: "Green Spend", desc: "Tag sustainability spend for green finance" },
    { id: "intensity", title: "Emission Intensity", desc: "tCO₂e per ₹ revenue, with YoY trend" },
    { id: "supplier", title: "Supplier Rating", desc: "Score suppliers on ESG risk" },
    { id: "offset", title: "Offset Cost", desc: "Cost to neutralise residual emissions" },
    { id: "goals", title: "Goal Tracker", desc: "Track reduction targets to net-zero" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Leaf size={14} className="text-[var(--color-primary)]" /> Turn your books into an ESG ledger</p>
        <p className="text-xs text-[var(--color-muted)]">
          Most of these tools estimate carbon, energy and ESG metrics straight from the spend already in your books — no duplicate data entry.
          As India's BRSR value-chain asks and EU CBAM start touching SMBs and exporters, having a defensible baseline ready matters. Start with a spend-based footprint, then refine with activity data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tools.map(t => (
          <button key={t.id} onClick={() => onJump(t.id)}
            className={`${CARD} p-4 text-left hover:border-[var(--color-primary)]/40 transition-colors`}>
            <p className="text-sm font-semibold">{t.title}</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
