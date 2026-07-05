import { useMemo, useState } from "react";
import DataFreshnessBadge from "@/components/DataFreshnessBadge";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Leaf, Factory, Zap, Droplets, ClipboardCheck, FileCheck2, Recycle,
  Gauge, Truck, Trees, Target, CheckCircle2, AlertTriangle, Plus, TrendingDown,
  Users, Plane, Trash2, Sun, Car, Globe, Landmark, Banknote,
  Route, ClipboardList, FileText, ShieldAlert, ShoppingCart, HeartHandshake, PiggyBank,
  UserCheck, BatteryCharging, Award, ListChecks,
} from "lucide-react";
import { toast } from "sonner";

// Shared input + card styles (reused from TaxPage convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "footprint" | "scopes" | "energy" | "scorecard" | "brsr"
  | "greenspend" | "intensity" | "supplier" | "offset" | "goals"
  | "commute" | "travel" | "waste" | "renewable" | "evfleet" | "diversity"
  | "governance" | "cbam" | "epr" | "greenloan"
  | "netzero" | "questionnaire" | "report" | "climaterisk" | "procurement"
  | "csr" | "energysavings"
  | "empintensity" | "renewmix" | "certs" | "ratingplan";

export default function EsgPage() {
  const tr = useT();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Leaf size={18} className="text-[var(--color-primary)]" /> {tr("esg.title")}
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {tr("esg.subtitle")}
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", tr("esg.tab.overview"), Leaf],
            ["footprint", tr("esg.tab.footprint"), Factory],
            ["scopes", tr("esg.tab.scopes"), Gauge],
            ["energy", tr("esg.tab.energy"), Zap],
            ["scorecard", tr("esg.tab.scorecard"), ClipboardCheck],
            ["brsr", tr("esg.tab.brsr"), FileCheck2],
            ["greenspend", tr("esg.tab.greenspend"), Recycle],
            ["intensity", tr("esg.tab.intensity"), TrendingDown],
            ["supplier", "Supplier Rating", Truck],
            ["offset", "Offset Cost", Trees],
            ["goals", "Goal Tracker", Target],
            ["commute", "Commute CO₂", Users],
            ["travel", "Business Travel", Plane],
            ["waste", "Waste Tracker", Trash2],
            ["renewable", "Solar ROI", Sun],
            ["evfleet", "EV Fleet", Car],
            ["diversity", "Diversity", Globe],
            ["governance", "Governance", Landmark],
            ["cbam", "CBAM Export", Globe],
            ["epr", "EPR Tracker", Recycle],
            ["greenloan", "Green Loan", Banknote],
            ["netzero", "Net-Zero Path", Route],
            ["questionnaire", "Supplier Survey", ClipboardList],
            ["report", "Report Builder", FileText],
            ["climaterisk", "Climate Risk", ShieldAlert],
            ["procurement", "Green Procurement", ShoppingCart],
            ["csr", "CSR Impact", HeartHandshake],
            ["energysavings", "Energy Savings", PiggyBank],
            ["empintensity", "Per Employee", UserCheck],
            ["renewmix", "Renewable Mix", BatteryCharging],
            ["certs", "Certifications", Award],
            ["ratingplan", "Rating Planner", ListChecks],
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
      {tab === "commute" && <CommuteEmissions />}
      {tab === "travel" && <BusinessTravelEmissions />}
      {tab === "waste" && <WasteTracker />}
      {tab === "renewable" && <RenewableSwitchRoi />}
      {tab === "evfleet" && <EvFleetCalculator />}
      {tab === "diversity" && <DiversityMetrics />}
      {tab === "governance" && <GovernanceChecklist />}
      {tab === "cbam" && <CbamExportEstimator />}
      {tab === "epr" && <EprTracker />}
      {tab === "greenloan" && <GreenLoanEligibility />}
      {tab === "netzero" && <NetZeroPathwayPlanner />}
      {tab === "questionnaire" && <SupplierQuestionnaireTracker />}
      {tab === "report" && <EsgReportBuilder />}
      {tab === "climaterisk" && <ClimateRiskAssessment />}
      {tab === "procurement" && <SustainableProcurementScorecard />}
      {tab === "csr" && <CsrImpactTracker />}
      {tab === "energysavings" && <EnergySavingsTracker />}
      {tab === "empintensity" && <EmissionsPerEmployee />}
      {tab === "renewmix" && <RenewableGridMix />}
      {tab === "certs" && <GreenCertificationChecklist />}
      {tab === "ratingplan" && <EsgRatingPlanner />}
    </div>
  );
}

// ── India emission factors (kg CO2e per unit) - spend & activity based ──────────
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
const GRID_FACTOR = 0.71;      // kg CO2e / kWh - India CEA average grid factor
const DIESEL_FACTOR = 2.68;    // kg CO2e / litre
const PETROL_FACTOR = 2.31;    // kg CO2e / litre
const LPG_FACTOR = 2.98;       // kg CO2e / kg

// State-specific grid emission factors (kg CO2e / kWh), approximate CEA-style values.
// Coal-heavy eastern/central grids run high; hydro/renewable-rich southern & northern hill
// states run low. Defaults to the national average when no state is selected.
const STATE_GRID_FACTORS: { code: string; label: string; factor: number }[] = [
  { code: "", label: "National average (CEA)", factor: GRID_FACTOR },
  { code: "CG", label: "Chhattisgarh", factor: 0.95 },
  { code: "JH", label: "Jharkhand", factor: 0.92 },
  { code: "WB", label: "West Bengal", factor: 0.88 },
  { code: "MP", label: "Madhya Pradesh", factor: 0.85 },
  { code: "OD", label: "Odisha", factor: 0.82 },
  { code: "UP", label: "Uttar Pradesh", factor: 0.80 },
  { code: "MH", label: "Maharashtra", factor: 0.78 },
  { code: "RJ", label: "Rajasthan", factor: 0.72 },
  { code: "GJ", label: "Gujarat", factor: 0.70 },
  { code: "AP", label: "Andhra Pradesh", factor: 0.58 },
  { code: "TN", label: "Tamil Nadu", factor: 0.65 },
  { code: "DL", label: "Delhi", factor: 0.63 },
  { code: "KA", label: "Karnataka", factor: 0.55 },
  { code: "KL", label: "Kerala", factor: 0.42 },
  { code: "UK", label: "Uttarakhand", factor: 0.30 },
  { code: "HP", label: "Himachal Pradesh", factor: 0.20 },
];

const fmtT = (kg: number) => `${(kg / 1000).toFixed(2)} tCO₂e`;

// Scan the books for expense rows that look like fuel/power, returning estimated
// activity quantities from spend. Rough India unit prices: diesel ~₹90/L, petrol
// ~₹105/L, electricity ~₹8/kWh. A starting estimate the user can override.
function estimateFuelPowerFromBooks(
  txns: { amount: number; description?: string; category?: string }[],
): { diesel: number; petrol: number; kwh: number; matched: number } {
  let dieselSpend = 0, petrolSpend = 0, powerSpend = 0, matched = 0;
  for (const t of txns) {
    if (t.amount >= 0) continue; // expenses only
    const text = `${t.description ?? ""} ${t.category ?? ""}`.toLowerCase();
    const spend = Math.abs(t.amount);
    if (/\bdiesel\b|\bhsd\b/.test(text)) { dieselSpend += spend; matched++; }
    else if (/petrol|\bfuel\b|\bpetro\b/.test(text)) { petrolSpend += spend; matched++; }
    else if (/electric|\bpower\b|\bgrid\b|discom|\bkwh\b|\bbescom\b|\bmseb\b|\btneb\b/.test(text)) { powerSpend += spend; matched++; }
  }
  return {
    diesel: Math.round(dieselSpend / 90),
    petrol: Math.round(petrolSpend / 105),
    kwh: Math.round(powerSpend / 8),
    matched,
  };
}

// Build a CSV string from rows and trigger a client-side Blob download.
function downloadEsgCsv(rows: string[][], filename: string) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = rows.map(r => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
          Quick screening footprint from how much you spend per category. Use this when activity data (litres, kWh) isn't handy - it's an order-of-magnitude estimate, not an audited inventory.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SPEND_FACTORS.map(f => (
            <div key={f.id}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{f.label} - annual ₹</label>
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
      <p className="text-[10px] text-[var(--color-muted)]">Spend-based (EEIO-style) screening factors for India. For BRSR or CBAM you'll need activity-based data - use the Scope 1/2/3 calculator for that.</p>
    </div>
  );
}

// ── #2 Scope 1/2/3 Calculator (activity-based) ──────────────────────────────────
function ScopeCalculator() {
  const { store } = useApp();
  // Scope 1 - direct combustion
  const [diesel, setDiesel] = useState("");
  const [petrol, setPetrol] = useState("");
  const [lpg, setLpg] = useState("");
  // Scope 2 - purchased electricity
  const [kwh, setKwh] = useState("");
  const [stateCode, setStateCode] = useState("");
  // Scope 3 - value chain (spend-based proxy)
  const [purchased, setPurchased] = useState("");
  const [logistics, setLogistics] = useState("");
  const [businessTravel, setBusinessTravel] = useState("");

  // State-specific grid factor, defaulting to national average when unset.
  const gridFactor = (STATE_GRID_FACTORS.find(s => s.code === stateCode) ?? STATE_GRID_FACTORS[0]).factor;

  // Auto-populate fuel & power from the books as a starting estimate (overridable).
  const autofill = () => {
    try {
      const est = estimateFuelPowerFromBooks(store.transactions ?? []);
      if (est.matched === 0) {
        toast.error("No fuel/power expense rows found in your books");
        return;
      }
      if (est.diesel > 0) setDiesel(String(est.diesel));
      if (est.petrol > 0) setPetrol(String(est.petrol));
      if (est.kwh > 0) setKwh(String(est.kwh));
      toast.success(`Pre-filled from ${est.matched} book entr${est.matched === 1 ? "y" : "ies"} - adjust as needed`);
    } catch {
      toast.error("Could not estimate from books");
    }
  };

  const n = (v: string) => parseFloat(v) || 0;
  const scope1 = n(diesel) * DIESEL_FACTOR + n(petrol) * PETROL_FACTOR + n(lpg) * LPG_FACTOR;
  const scope2 = n(kwh) * gridFactor;
  const scope3 =
    (n(purchased) / 1000) * 30 + (n(logistics) / 1000) * 50 + (n(businessTravel) / 1000) * 40;
  const total = scope1 + scope2 + scope3;
  const has = total > 0;

  const scopes = [
    { label: "Scope 1 - Direct", kg: scope1, color: "#ef4444", desc: "Fuel burned in your own vehicles & equipment" },
    { label: "Scope 2 - Energy", kg: scope2, color: "#f97316", desc: "Purchased grid electricity (state CEA factor)" },
    { label: "Scope 3 - Value chain", kg: scope3, color: "#eab308", desc: "Purchased goods, freight, business travel" },
  ];

  // Export the inventory + intensity as a CSV download, plus a printable summary.
  const annualRevenue = (store.transactions ?? []).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const intensity = annualRevenue > 0 ? (total / 1000) / (annualRevenue / 1_00_00_000) : 0;
  const stateLabel = (STATE_GRID_FACTORS.find(s => s.code === stateCode) ?? STATE_GRID_FACTORS[0]).label;

  const exportCsv = () => {
    try {
      if (!has) { toast.error("Enter at least one activity figure first"); return; }
      const rows: string[][] = [
        ["Headroom ESG - Scope 1/2/3 GHG Inventory"],
        ["Generated", new Date().toISOString().slice(0, 10)],
        ["Grid region", stateLabel, `${gridFactor} kgCO2e/kWh`],
        [],
        ["Scope", "Source", "Activity", "Unit", "Emission factor", "tCO2e"],
        ["Scope 1", "Diesel", diesel || "0", "litres", `${DIESEL_FACTOR} kg/L`, (n(diesel) * DIESEL_FACTOR / 1000).toFixed(3)],
        ["Scope 1", "Petrol", petrol || "0", "litres", `${PETROL_FACTOR} kg/L`, (n(petrol) * PETROL_FACTOR / 1000).toFixed(3)],
        ["Scope 1", "LPG", lpg || "0", "kg", `${LPG_FACTOR} kg/kg`, (n(lpg) * LPG_FACTOR / 1000).toFixed(3)],
        ["Scope 2", "Grid electricity", kwh || "0", "kWh", `${gridFactor} kg/kWh`, (scope2 / 1000).toFixed(3)],
        ["Scope 3", "Purchased goods", purchased || "0", "INR", "30 kg/1000", ((n(purchased) / 1000) * 30 / 1000).toFixed(3)],
        ["Scope 3", "Freight & logistics", logistics || "0", "INR", "50 kg/1000", ((n(logistics) / 1000) * 50 / 1000).toFixed(3)],
        ["Scope 3", "Business travel", businessTravel || "0", "INR", "40 kg/1000", ((n(businessTravel) / 1000) * 40 / 1000).toFixed(3)],
        [],
        ["Totals", "", "", "", "", ""],
        ["Scope 1 total", "", "", "", "", (scope1 / 1000).toFixed(3)],
        ["Scope 2 total", "", "", "", "", (scope2 / 1000).toFixed(3)],
        ["Scope 3 total", "", "", "", "", (scope3 / 1000).toFixed(3)],
        ["Total GHG inventory (tCO2e)", "", "", "", "", (total / 1000).toFixed(3)],
        ["Annual revenue (INR)", "", "", "", "", String(Math.round(annualRevenue))],
        ["Carbon intensity (tCO2e / INR crore)", "", "", "", "", intensity.toFixed(3)],
      ];
      downloadEsgCsv(rows, `esg-ghg-inventory-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("ESG report CSV downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  const printSummary = () => {
    try {
      if (!has) { toast.error("Enter at least one activity figure first"); return; }
      window.print();
    } catch {
      toast.error("Print failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-3 flex items-center justify-between flex-wrap gap-2`}>
        <p className="text-xs text-[var(--color-muted)]">
          Build a GHG Protocol inventory. Auto-fill fuel & power from your books, then refine - values are yours to override.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={autofill} className="flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-lg px-3 py-1.5 text-xs font-medium">
            <Gauge size={12} /> Auto-fill from books
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-lg px-3 py-1.5 text-xs font-medium">
            <FileText size={12} /> Export ESG report (CSV)
          </button>
          <button onClick={printSummary} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-1.5 text-xs font-medium">
            <ClipboardCheck size={12} /> Print summary
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${CARD} p-4 space-y-3`}>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Factory size={13} className="text-red-400" /> Scope 1 - Direct</h3>
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
          <h3 className="text-sm font-semibold flex items-center gap-2"><Zap size={13} className="text-orange-400" /> Scope 2 - Energy</h3>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">State / grid region</label>
            <select value={stateCode} onChange={e => setStateCode(e.target.value)} className={INP}>
              {STATE_GRID_FACTORS.map(s => (
                <option key={s.code || "national"} value={s.code}>{s.label} - {s.factor} kg/kWh</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Grid electricity (kWh/yr)</label>
            <input type="number" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="0" className={INP} />
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Grid factor {gridFactor} kg CO₂e/kWh ({stateLabel}). Coal-heavy state grids emit more; hydro/renewable grids less. Subtract renewable/REC-backed units.</p>
        </div>
        <div className={`${CARD} p-4 space-y-3`}>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Truck size={13} className="text-yellow-400" /> Scope 3 - Value chain (₹)</h3>
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
                {s.label} - {s.desc}
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
      <p className="text-[10px] text-[var(--color-muted)]">A directional self-assessment across Environment, Social and Governance - useful for investor/lender ESG questionnaires. Not a certified rating.</p>
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
          <p className="text-sm font-bold text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> All BRSR-lite data points are in place - you can respond to a value-chain disclosure request with confidence.</p>
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
        <p className="text-xs text-[var(--color-muted)]">Tag the spend that advances sustainability - useful for green-finance applications and impact reporting.</p>
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
              { label: "YoY change", value: delta === null ? "-" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`, sub: delta === null ? "Add prior year" : delta < 0 ? "Improving" : "Worsening", color: delta === null ? "text-[var(--color-muted)]" : delta < 0 ? "text-green-400" : "text-red-400" },
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
                Your carbon intensity {delta < 0 ? "fell" : "rose"} {Math.abs(delta).toFixed(1)}% YoY - {delta < 0 ? "real decarbonisation, not just lower output." : "emissions are growing faster than revenue; review your biggest sources."}
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
        <p className="text-xs text-[var(--color-muted)]">Rate each key supplier 1-5 on three ESG dimensions to surface supply-chain risk and prioritise engagement.</p>
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
                      <td className="px-3 py-2.5">{s.certified ? <CheckCircle2 size={13} className="text-green-400" /> : <span className="text-[var(--color-muted)] text-xs">-</span>}</td>
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
    { id: "basic", label: "Basic / avoidance", desc: "REDD+, cookstoves - lower price, higher scrutiny" },
    { id: "verified", label: "Verified (Verra/Gold Std)", desc: "Independently audited, India afforestation/biogas" },
    { id: "removal", label: "Carbon removal", desc: "Biochar, DAC - highest integrity, premium price" },
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
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative only - voluntary carbon market prices vary widely by vintage, project and registry. Verify credit serial numbers to avoid double-counting. Offsetting is no substitute for cutting emissions at source.</p>
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
                {achieved && <p className="text-[11px] text-green-400 flex items-center gap-1"><CheckCircle2 size={11} /> Target achieved - set a more ambitious next milestone.</p>}
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
    { label: "Screening footprint", value: fmtT(screeningKg), color: "text-orange-400", sub: "Rough estimate - refine in Footprint" },
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
          Most of these tools estimate carbon, energy and ESG metrics straight from the spend already in your books - no duplicate data entry.
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

// ── Commute & travel mode factors (kg CO2e per passenger-km) ─────────────────────
const COMMUTE_MODES: { id: string; label: string; factor: number }[] = [
  { id: "car", label: "Private car (petrol)", factor: 0.171 },
  { id: "bike", label: "Two-wheeler", factor: 0.061 },
  { id: "bus", label: "Bus", factor: 0.082 },
  { id: "metro", label: "Metro / local train", factor: 0.041 },
  { id: "auto", label: "Auto / cab", factor: 0.131 },
  { id: "active", label: "Walk / cycle / WFH", factor: 0 },
];
const WORK_DAYS = 22; // working days per month

// ── #11 Employee Commute Emissions (Scope 3, cat 7) ─────────────────────────────
type CommuteRow = { id: string; mode: string; employees: number; km: number };
function CommuteEmissions() {
  const [rows, setRows] = useFeatureState<CommuteRow[]>("esg-commute", []);
  const [mode, setMode] = useState(COMMUTE_MODES[0].id);
  const [employees, setEmployees] = useState("");
  const [km, setKm] = useState("");

  const add = () => {
    const e = parseFloat(employees), d = parseFloat(km);
    if (isNaN(e) || e <= 0 || isNaN(d) || d <= 0) { toast.error("Enter employees and one-way km"); return; }
    setRows([...rows, { id: crypto.randomUUID(), mode, employees: e, km: d }]);
    setEmployees(""); setKm("");
    toast.success("Commute leg added");
  };

  // round trip × working days × 12 months
  const annualKg = (r: CommuteRow) => {
    const f = COMMUTE_MODES.find(m => m.id === r.mode)?.factor ?? 0;
    return r.employees * r.km * 2 * WORK_DAYS * 12 * f;
  };
  const totalKg = rows.reduce((s, r) => s + annualKg(r), 0);
  const totalEmp = rows.reduce((s, r) => s + r.employees, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Employee Commute Emissions</h3>
        <p className="text-xs text-[var(--color-muted)]">GHG Protocol Scope 3 category 7. Add a leg per transport mode - annualised over {WORK_DAYS} working days/month, round trips.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)} className={INP}>
              {COMMUTE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1"># Employees</label>
            <input type="number" value={employees} onChange={e => setEmployees(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">One-way km</label>
            <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="0" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Annual commute footprint", value: fmtT(totalKg), color: "text-orange-400" },
              { label: "Employees covered", value: `${totalEmp}`, color: "text-[var(--color-text)]" },
              { label: "Per employee / yr", value: totalEmp > 0 ? fmtT(totalKg / totalEmp) : "-", color: "text-[var(--color-primary)]" },
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
                  <tr>{["Mode", "Employees", "One-way km", "Annual CO₂e", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5">{COMMUTE_MODES.find(m => m.id === r.mode)?.label}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.employees}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.km}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400">{fmtT(annualKg(r))}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">Per-passenger-km factors (India-typical). Shifting staff to metro, bus or WFH days cuts this fastest - model it by editing the leg.</p>
    </div>
  );
}

// ── #12 Business Travel (flight/rail/road) CO2 ──────────────────────────────────
function BusinessTravelEmissions() {
  // Flight factors kg CO2e per passenger-km by haul; rail & road per km.
  const [shortHaul, setShortHaul] = useState("");   // < 1000 km flights, total pax-km
  const [longHaul, setLongHaul] = useState("");      // domestic/intl long flights
  const [rail, setRail] = useState("");
  const [roadKm, setRoadKm] = useState("");
  const [hotelNights, setHotelNights] = useState("");

  const F_SHORT = 0.158, F_LONG = 0.195, F_RAIL = 0.041, F_ROAD = 0.171, F_HOTEL = 12; // kg/night
  const n = (v: string) => parseFloat(v) || 0;
  const flightKg = n(shortHaul) * F_SHORT + n(longHaul) * F_LONG;
  const railKg = n(rail) * F_RAIL;
  const roadKg = n(roadKm) * F_ROAD;
  const hotelKg = n(hotelNights) * F_HOTEL;
  const total = flightKg + railKg + roadKg + hotelKg;

  const inputs: [string, string, (v: string) => void, string][] = [
    ["Short-haul flights (pax-km)", shortHaul, setShortHaul, "< 1,000 km legs"],
    ["Long-haul flights (pax-km)", longHaul, setLongHaul, "domestic long / intl"],
    ["Rail travel (km)", rail, setRail, "AC train per pax"],
    ["Road / cab (km)", roadKm, setRoadKm, "car/taxi per pax"],
    ["Hotel nights", hotelNights, setHotelNights, "accommodation"],
  ];
  const breakdown = [
    { label: "Flights", kg: flightKg, color: "#ef4444" },
    { label: "Rail", kg: railKg, color: "#22c55e" },
    { label: "Road / cab", kg: roadKg, color: "#f97316" },
    { label: "Hotels", kg: hotelKg, color: "#3b82f6" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Plane size={14} className="text-[var(--color-primary)]" /> Business Travel Emissions</h3>
        <p className="text-xs text-[var(--color-muted)]">Scope 3 category 6. Enter annual passenger-km by mode. Rail is ~4× lower than flying for the same trip.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {inputs.map(([label, val, setter, hint]) => (
            <div key={label}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder="0" className={INP} />
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {total > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {breakdown.map(b => (
              <div key={b.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{b.label}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: b.color }}>{fmtT(b.kg)}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{total > 0 ? `${((b.kg / total) * 100).toFixed(0)}%` : ""}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-4 space-y-2`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Total travel footprint</p>
              <p className="text-lg font-bold tabular-nums text-orange-400">{fmtT(total)}</p>
            </div>
            <div className="flex h-4 w-full rounded-full overflow-hidden bg-[var(--color-bg)]">
              {breakdown.map(b => (
                <div key={b.label} style={{ width: `${(b.kg / total) * 100}%`, background: b.color }} title={`${b.label}: ${fmtT(b.kg)}`} />
              ))}
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Factors are screening estimates; flight figures exclude radiative-forcing uplift. For a journey of n km per pax, pax-km = n. Prefer rail and video calls to cut the largest source.</p>
    </div>
  );
}

// ── #13 Waste & Recycling Tracker ───────────────────────────────────────────────
type WasteRow = { id: string; stream: string; generatedKg: number; recycledKg: number };
const WASTE_STREAMS = ["Paper / cardboard", "Plastic", "E-waste", "Organic / food", "Metal", "Hazardous", "General / landfill"];
function WasteTracker() {
  const [rows, setRows] = useFeatureState<WasteRow[]>("esg-waste", []);
  const [stream, setStream] = useState(WASTE_STREAMS[0]);
  const [generatedKg, setGeneratedKg] = useState("");
  const [recycledKg, setRecycledKg] = useState("");

  const add = () => {
    const g = parseFloat(generatedKg), r = parseFloat(recycledKg) || 0;
    if (isNaN(g) || g <= 0) { toast.error("Enter waste generated (kg)"); return; }
    if (r > g) { toast.error("Recycled can't exceed generated"); return; }
    setRows([...rows, { id: crypto.randomUUID(), stream, generatedKg: g, recycledKg: r }]);
    setGeneratedKg(""); setRecycledKg("");
    toast.success("Waste stream logged");
  };

  const totalGen = rows.reduce((s, r) => s + r.generatedKg, 0);
  const totalRec = rows.reduce((s, r) => s + r.recycledKg, 0);
  const diversion = totalGen > 0 ? (totalRec / totalGen) * 100 : 0;
  const toLandfill = totalGen - totalRec;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Trash2 size={14} className="text-[var(--color-primary)]" /> Waste & Recycling Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Log waste generated vs recycled per stream - the diversion rate is a core BRSR and circularity metric, and the data behind EPR obligations.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stream</label>
            <select value={stream} onChange={e => setStream(e.target.value)} className={INP}>
              {WASTE_STREAMS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Generated (kg/yr)</label>
            <input type="number" value={generatedKg} onChange={e => setGeneratedKg(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Recycled (kg/yr)</label>
            <input type="number" value={recycledKg} onChange={e => setRecycledKg(e.target.value)} placeholder="0" className={INP} />
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
              { label: "Total generated", value: `${totalGen.toLocaleString("en-IN")} kg`, color: "text-[var(--color-text)]" },
              { label: "Recycled / recovered", value: `${totalRec.toLocaleString("en-IN")} kg`, color: "text-green-400" },
              { label: "To landfill", value: `${toLandfill.toLocaleString("en-IN")} kg`, color: "text-orange-400" },
              { label: "Diversion rate", value: `${diversion.toFixed(1)}%`, color: diversion >= 75 ? "text-green-400" : diversion >= 50 ? "text-yellow-400" : "text-red-400" },
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
                  <tr>{["Stream", "Generated", "Recycled", "Diversion", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const d = r.generatedKg > 0 ? (r.recycledKg / r.generatedKg) * 100 : 0;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.stream}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.generatedKg.toLocaleString("en-IN")} kg</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-400">{r.recycledKg.toLocaleString("en-IN")} kg</td>
                        <td className="px-4 py-2.5 tabular-nums">{d.toFixed(0)}%</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Diversion rate = recycled ÷ generated. Plastic, e-waste and battery streams here also drive your EPR targets - see the EPR Tracker.</p>
    </div>
  );
}

// ── #14 Renewable Energy Switch ROI (rooftop solar) ─────────────────────────────
function RenewableSwitchRoi() {
  const [monthlyKwh, setMonthlyKwh] = useState("");
  const [tariff, setTariff] = useState("8");          // ₹ per kWh grid
  const [systemKw, setSystemKw] = useState("");        // proposed solar capacity
  const [capexPerKw, setCapexPerKw] = useState("55000"); // ₹ per kW installed

  const n = (v: string) => parseFloat(v) || 0;
  const kw = n(systemKw);
  const capex = kw * n(capexPerKw);
  // India: ~4 peak sun hours/day → ~1460 kWh per kW per year
  const annualGen = kw * 1460;
  const annualConsumption = n(monthlyKwh) * 12;
  const usableGen = annualConsumption > 0 ? Math.min(annualGen, annualConsumption) : annualGen;
  const annualSaving = usableGen * n(tariff);
  const payback = annualSaving > 0 ? capex / annualSaving : 0;
  const co2Saved = usableGen * GRID_FACTOR;
  const lifetime25 = annualSaving * 25 - capex;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Sun size={14} className="text-yellow-400" /> Renewable Switch ROI (Rooftop Solar)</h3>
        <p className="text-xs text-[var(--color-muted)]">Models savings, payback and emission cuts from rooftop solar. Assumes ~1,460 kWh per installed kW/year (≈4 peak-sun-hours, India average).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly grid use (kWh)</label>
            <input type="number" value={monthlyKwh} onChange={e => setMonthlyKwh(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Grid tariff (₹/kWh)</label>
            <input type="number" value={tariff} onChange={e => setTariff(e.target.value)} placeholder="8" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Solar size (kW)</label>
            <input type="number" value={systemKw} onChange={e => setSystemKw(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Capex (₹/kW)</label>
            <input type="number" value={capexPerKw} onChange={e => setCapexPerKw(e.target.value)} placeholder="55000" className={INP} />
          </div>
        </div>
      </div>

      {kw > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "System cost (capex)", value: formatCurrency(Math.round(capex)), color: "text-[var(--color-text)]" },
              { label: "Annual generation", value: `${Math.round(annualGen).toLocaleString("en-IN")} kWh`, color: "text-yellow-400" },
              { label: "Annual bill saving", value: formatCurrency(Math.round(annualSaving)), color: "text-green-400" },
              { label: "Simple payback", value: payback > 0 ? `${payback.toFixed(1)} yrs` : "-", color: "text-[var(--color-primary)]" },
              { label: "CO₂e avoided / yr", value: fmtT(co2Saved), color: "text-green-400" },
              { label: "25-yr net benefit", value: formatCurrency(Math.round(lifetime25)), color: lifetime25 > 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {payback > 0 && payback <= 6 && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm font-bold text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> Payback under ~6 years - strong case. Check accelerated depreciation and state net-metering before committing.</p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative; excludes O&amp;M, degradation, financing and net-metering credits. Generation usable only up to your own consumption unless you have net-metering / open access.</p>
    </div>
  );
}

// ── #15 EV-Fleet Transition Calculator ──────────────────────────────────────────
function EvFleetCalculator() {
  const [vehicles, setVehicles] = useState("");
  const [kmPerYear, setKmPerYear] = useState("15000");
  const [mileage, setMileage] = useState("15");       // km per litre (ICE)
  const [fuelPrice, setFuelPrice] = useState("100");   // ₹ per litre
  const [evEfficiency, setEvEfficiency] = useState("7"); // km per kWh
  const [chargeTariff, setChargeTariff] = useState("9"); // ₹ per kWh

  const n = (v: string) => parseFloat(v) || 0;
  const fleet = n(vehicles);
  const totalKm = fleet * n(kmPerYear);
  const litres = n(mileage) > 0 ? totalKm / n(mileage) : 0;
  const iceCost = litres * n(fuelPrice);
  const iceKg = litres * PETROL_FACTOR;
  const kwhNeeded = n(evEfficiency) > 0 ? totalKm / n(evEfficiency) : 0;
  const evCost = kwhNeeded * n(chargeTariff);
  const evKg = kwhNeeded * GRID_FACTOR;
  const costSaving = iceCost - evCost;
  const co2Saving = iceKg - evKg;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Car size={14} className="text-[var(--color-primary)]" /> EV-Fleet Transition Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Compares running an ICE fleet vs going electric - fuel/energy cost and emissions. EV emissions use the CEA grid factor ({GRID_FACTOR} kg/kWh).</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ["Vehicles in fleet", vehicles, setVehicles, "0"],
            ["km / vehicle / yr", kmPerYear, setKmPerYear, "15000"],
            ["ICE mileage (km/L)", mileage, setMileage, "15"],
            ["Fuel price (₹/L)", fuelPrice, setFuelPrice, "100"],
            ["EV efficiency (km/kWh)", evEfficiency, setEvEfficiency, "7"],
            ["Charging tariff (₹/kWh)", chargeTariff, setChargeTariff, "9"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      {fleet > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "ICE running cost / yr", value: formatCurrency(Math.round(iceCost)), color: "text-red-400" },
              { label: "EV running cost / yr", value: formatCurrency(Math.round(evCost)), color: "text-green-400" },
              { label: "Cost saving / yr", value: formatCurrency(Math.round(costSaving)), color: costSaving > 0 ? "text-green-400" : "text-red-400" },
              { label: "CO₂e cut / yr", value: fmtT(co2Saving), color: co2Saving > 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)]">
              Across {fleet} vehicle{fleet > 1 ? "s" : ""} ({totalKm.toLocaleString("en-IN")} km/yr): switching to EV {costSaving > 0 ? "saves" : "adds"} {formatCurrency(Math.abs(Math.round(costSaving)))}/yr in energy and {co2Saving > 0 ? "cuts" : "adds"} {fmtT(Math.abs(co2Saving))}. Excludes purchase price, batteries and FAME/state incentives.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Operating comparison only - model upfront EV cost separately. As the grid greens, EV emissions fall further; ICE stays flat.</p>
    </div>
  );
}

// ── #16 Diversity & Social Metrics Tracker ──────────────────────────────────────
type DiversityState = {
  totalEmp: string; women: string; mgmtTotal: string; mgmtWomen: string;
  pwd: string; contractual: string; trainingHrs: string; safetyIncidents: string;
};
const DIV_DEFAULT: DiversityState = { totalEmp: "", women: "", mgmtTotal: "", mgmtWomen: "", pwd: "", contractual: "", trainingHrs: "", safetyIncidents: "" };
function DiversityMetrics() {
  const [s, setS] = useFeatureState<DiversityState>("esg-diversity", DIV_DEFAULT);
  const set = (k: keyof DiversityState, v: string) => setS({ ...s, [k]: v });
  const n = (v: string) => parseFloat(v) || 0;

  const total = n(s.totalEmp);
  const womenPct = total > 0 ? (n(s.women) / total) * 100 : 0;
  const mgmtWomenPct = n(s.mgmtTotal) > 0 ? (n(s.mgmtWomen) / n(s.mgmtTotal)) * 100 : 0;
  const pwdPct = total > 0 ? (n(s.pwd) / total) * 100 : 0;
  const contractPct = total > 0 ? (n(s.contractual) / total) * 100 : 0;
  const trainingPerEmp = total > 0 ? n(s.trainingHrs) / total : 0;

  const fields: [keyof DiversityState, string][] = [
    ["totalEmp", "Total employees"],
    ["women", "Women employees"],
    ["mgmtTotal", "Management roles (total)"],
    ["mgmtWomen", "Women in management"],
    ["pwd", "Persons with disability"],
    ["contractual", "Contractual / gig workers"],
    ["trainingHrs", "Total training hours / yr"],
    ["safetyIncidents", "Safety incidents / yr"],
  ];
  const kpis = [
    { label: "Women in workforce", value: `${womenPct.toFixed(1)}%`, color: womenPct >= 30 ? "text-green-400" : "text-yellow-400" },
    { label: "Women in management", value: `${mgmtWomenPct.toFixed(1)}%`, color: mgmtWomenPct >= 30 ? "text-green-400" : "text-yellow-400" },
    { label: "PwD share", value: `${pwdPct.toFixed(1)}%`, color: "text-[var(--color-primary)]" },
    { label: "Contractual share", value: `${contractPct.toFixed(1)}%`, color: "text-[var(--color-text)]" },
    { label: "Training hrs / employee", value: trainingPerEmp.toFixed(1), color: "text-[var(--color-primary)]" },
    { label: "Safety incidents", value: `${n(s.safetyIncidents)}`, color: n(s.safetyIncidents) > 0 ? "text-red-400" : "text-green-400" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> Diversity & Social Metrics</h3>
        <p className="text-xs text-[var(--color-muted)]">The 'S' in ESG and BRSR Section C, Principle 3/5. Enter your headcount mix - figures auto-save and feed disclosure requests.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {fields.map(([k, label]) => (
            <div key={k}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
              <input type="number" value={s[k]} onChange={e => set(k, e.target.value)} placeholder="0" className={INP} />
            </div>
          ))}
        </div>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {kpis.map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Self-reported social metrics. Maintain the underlying registers (payroll, POSH, safety log) so each figure is auditable for BRSR or investor diligence.</p>
    </div>
  );
}

// ── #17 Governance Checklist ────────────────────────────────────────────────────
type GovItem = { id: string; group: string; label: string };
const GOV_ITEMS: GovItem[] = [
  { id: "gv1", group: "Board & oversight", label: "Defined board / advisory body with meeting minutes" },
  { id: "gv2", group: "Board & oversight", label: "Separation of ownership and key financial controls" },
  { id: "gv3", group: "Board & oversight", label: "Conflict-of-interest / related-party policy" },
  { id: "gv4", group: "Ethics & compliance", label: "Written code of conduct shared with all staff" },
  { id: "gv5", group: "Ethics & compliance", label: "Anti-bribery & anti-corruption policy" },
  { id: "gv6", group: "Ethics & compliance", label: "Whistleblower / grievance redressal channel" },
  { id: "gv7", group: "Risk & controls", label: "Statutory & tax filings up to date (GST, ROC, IT)" },
  { id: "gv8", group: "Risk & controls", label: "Annual financial statements audited" },
  { id: "gv9", group: "Risk & controls", label: "Documented risk register reviewed periodically" },
  { id: "gv10", group: "Data & privacy", label: "Data-privacy practice aligned to DPDP Act 2023" },
  { id: "gv11", group: "Data & privacy", label: "Cyber-security controls & incident plan documented" },
  { id: "gv12", group: "Data & privacy", label: "Customer/vendor consent & retention policy" },
];
function GovernanceChecklist() {
  const [done, setDone] = useFeatureState<Record<string, boolean>>("esg-governance", {});
  const toggle = (id: string) => setDone({ ...done, [id]: !done[id] });
  const groups = Array.from(new Set(GOV_ITEMS.map(i => i.group)));
  const completed = GOV_ITEMS.filter(i => done[i.id]).length;
  const pct = Math.round((completed / GOV_ITEMS.length) * 100);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Governance Checklist</h3>
          <span className={`text-sm font-bold tabular-nums ${pct === 100 ? "text-green-400" : "text-yellow-400"}`}>{completed}/{GOV_ITEMS.length} · {pct}%</span>
        </div>
        <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-[var(--color-muted)]">The 'G' that lenders and acquirers scrutinise first. Tick controls you can evidence today; gaps here often block green credit and diligence.</p>
      </div>

      {groups.map(g => (
        <div key={g} className={`${CARD} p-4 space-y-2`}>
          <p className="text-sm font-semibold">{g}</p>
          {GOV_ITEMS.filter(i => i.group === g).map(i => (
            <label key={i.id} className="flex items-center gap-2.5 cursor-pointer text-sm py-1">
              <input type="checkbox" checked={!!done[i.id]} onChange={() => toggle(i.id)} className="accent-[var(--color-primary)]" />
              <span className={done[i.id] ? "text-[var(--color-text)] line-through opacity-70" : "text-[var(--color-text)]"}>{i.label}</span>
            </label>
          ))}
        </div>
      ))}
      <p className="text-[10px] text-[var(--color-muted)]">A practical governance baseline for an Indian SMB (Companies Act, DPDP 2023). Not legal advice - confirm statutory obligations with your CA / company secretary.</p>
    </div>
  );
}

// ── #18 CBAM Export-Exposure Estimator ──────────────────────────────────────────
// EU CBAM transitional embedded-emission intensities (tCO2e per tonne of product).
const CBAM_GOODS: { id: string; label: string; intensity: number }[] = [
  { id: "steel", label: "Steel / iron", intensity: 2.1 },
  { id: "aluminium", label: "Aluminium", intensity: 8.6 },
  { id: "cement", label: "Cement / clinker", intensity: 0.87 },
  { id: "fertiliser", label: "Fertiliser", intensity: 1.6 },
  { id: "hydrogen", label: "Hydrogen", intensity: 10 },
];
type CbamRow = { id: string; good: string; tonnes: number };
function CbamExportEstimator() {
  const [rows, setRows] = useFeatureState<CbamRow[]>("esg-cbam", []);
  const [good, setGood] = useState(CBAM_GOODS[0].id);
  const [tonnes, setTonnes] = useState("");
  const [euPrice, setEuPrice] = useState("75"); // € per tCO2e (EU ETS proxy)
  const [eurInr, setEurInr] = useState("90");

  const add = () => {
    const t = parseFloat(tonnes);
    if (isNaN(t) || t <= 0) { toast.error("Enter tonnes exported"); return; }
    setRows([...rows, { id: crypto.randomUUID(), good, tonnes: t }]);
    setTonnes("");
    toast.success("Export line added");
  };

  const embeddedT = (r: CbamRow) => (CBAM_GOODS.find(g => g.id === r.good)?.intensity ?? 0) * r.tonnes;
  const totalEmbedded = rows.reduce((s, r) => s + embeddedT(r), 0);
  const priceInr = (parseFloat(euPrice) || 0) * (parseFloat(eurInr) || 0);
  const liability = totalEmbedded * priceInr;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> CBAM Export-Exposure Estimator</h3>
        <p className="text-xs text-[var(--color-muted)]">EU's Carbon Border Adjustment hits steel, aluminium, cement, fertiliser & hydrogen from 2026. Estimate embedded emissions and the certificate cost on your EU exports.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Product</label>
            <select value={good} onChange={e => setGood(e.target.value)} className={INP}>
              {CBAM_GOODS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tonnes to EU/yr</label>
            <input type="number" value={tonnes} onChange={e => setTonnes(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">CO₂ price (€/t)</label>
            <input type="number" value={euPrice} onChange={e => setEuPrice(e.target.value)} placeholder="75" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">€ → ₹</label>
            <input type="number" value={eurInr} onChange={e => setEurInr(e.target.value)} placeholder="90" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Embedded emissions", value: `${totalEmbedded.toFixed(1)} tCO₂e`, color: "text-orange-400" },
              { label: "CBAM price / tonne", value: formatCurrency(Math.round(priceInr)), color: "text-[var(--color-text)]" },
              { label: "Est. annual liability", value: formatCurrency(Math.round(liability)), color: "text-red-400" },
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
                  <tr>{["Product", "Tonnes/yr", "Intensity", "Embedded CO₂e", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const gd = CBAM_GOODS.find(g => g.id === r.good);
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{gd?.label}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.tonnes.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{gd?.intensity} t/t</td>
                        <td className="px-4 py-2.5 tabular-nums text-orange-400">{embeddedT(r).toFixed(1)} tCO₂e</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Uses default embedded-emission intensities; actuals from a verified product carbon footprint usually lower your liability. Transitional reporting is underway - definitive certificates phase in from 2026.</p>
    </div>
  );
}

// ── #19 EPR (Extended Producer Responsibility) Tracker ──────────────────────────
type EprRow = { id: string; category: string; obligationKg: number; fulfilledKg: number };
const EPR_CATEGORIES = ["Plastic packaging", "E-waste", "Battery waste", "Tyre waste", "Used oil"];
function EprTracker() {
  const [rows, setRows] = useFeatureState<EprRow[]>("esg-epr", []);
  const [category, setCategory] = useState(EPR_CATEGORIES[0]);
  const [obligationKg, setObligationKg] = useState("");
  const [fulfilledKg, setFulfilledKg] = useState("");
  const [certPrice, setCertPrice] = useState("15"); // ₹ per kg certificate

  const add = () => {
    const o = parseFloat(obligationKg), f = parseFloat(fulfilledKg) || 0;
    if (isNaN(o) || o <= 0) { toast.error("Enter your EPR obligation (kg)"); return; }
    setRows([...rows, { id: crypto.randomUUID(), category, obligationKg: o, fulfilledKg: f }]);
    setObligationKg(""); setFulfilledKg("");
    toast.success("EPR target added");
  };

  const totalOb = rows.reduce((s, r) => s + r.obligationKg, 0);
  const totalFul = rows.reduce((s, r) => s + r.fulfilledKg, 0);
  const shortfall = Math.max(0, totalOb - totalFul);
  const compliance = totalOb > 0 ? (totalFul / totalOb) * 100 : 0;
  const certCost = shortfall * (parseFloat(certPrice) || 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Recycle size={14} className="text-[var(--color-primary)]" /> EPR Compliance Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Track Extended Producer Responsibility targets under CPCB rules (plastic, e-waste, battery). Shortfalls must be met by buying EPR certificates - or face environmental compensation.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={INP}>
              {EPR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Obligation (kg/yr)</label>
            <input type="number" value={obligationKg} onChange={e => setObligationKg(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Fulfilled (kg)</label>
            <input type="number" value={fulfilledKg} onChange={e => setFulfilledKg(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cert price (₹/kg)</label>
            <input type="number" value={certPrice} onChange={e => setCertPrice(e.target.value)} placeholder="15" className={INP} />
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
              { label: "Total obligation", value: `${totalOb.toLocaleString("en-IN")} kg`, color: "text-[var(--color-text)]" },
              { label: "Fulfilled", value: `${totalFul.toLocaleString("en-IN")} kg`, color: "text-green-400" },
              { label: "Compliance", value: `${compliance.toFixed(0)}%`, color: compliance >= 100 ? "text-green-400" : compliance >= 60 ? "text-yellow-400" : "text-red-400" },
              { label: "Cost to close gap", value: formatCurrency(Math.round(certCost)), color: shortfall > 0 ? "text-orange-400" : "text-green-400" },
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
                  <tr>{["Category", "Obligation", "Fulfilled", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const met = r.fulfilledKg >= r.obligationKg;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.category}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.obligationKg.toLocaleString("en-IN")} kg</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-400">{r.fulfilledKg.toLocaleString("en-IN")} kg</td>
                        <td className="px-4 py-2.5">{met ? <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle2 size={12} /> Met</span> : <span className="text-orange-400 text-xs flex items-center gap-1"><AlertTriangle size={12} /> Short {(r.obligationKg - r.fulfilledKg).toLocaleString("en-IN")} kg</span>}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Obligations are set by CPCB rules as a percentage of what you introduced to market. Buy certificates from registered recyclers/PROs on the EPR portal before the annual return deadline.</p>
    </div>
  );
}

// ── #20 Green-Loan Eligibility Score ────────────────────────────────────────────
type GreenCriterion = { id: string; label: string; weight: number };
const GREEN_CRITERIA: GreenCriterion[] = [
  { id: "c1", label: "Measured carbon footprint (any scope)", weight: 15 },
  { id: "c2", label: "Set a quantified reduction target", weight: 15 },
  { id: "c3", label: "Track energy & water consumption", weight: 10 },
  { id: "c4", label: "Using or planning renewable energy", weight: 15 },
  { id: "c5", label: "Loan funds a clear green use (solar/EV/efficiency)", weight: 20 },
  { id: "c6", label: "Waste / EPR compliance in place", weight: 10 },
  { id: "c7", label: "Audited financials & clean repayment record", weight: 10 },
  { id: "c8", label: "Can report KPI progress to the lender annually", weight: 5 },
];
function GreenLoanEligibility() {
  const [checks, setChecks] = useFeatureState<Record<string, boolean>>("esg-greenloan", {});
  const [amount, setAmount] = useState("");
  const toggle = (id: string) => setChecks({ ...checks, [id]: !checks[id] });

  const score = GREEN_CRITERIA.reduce((s, c) => s + (checks[c.id] ? c.weight : 0), 0);
  const band = score >= 75
    ? { label: "Strong candidate", color: "text-green-400", note: "Approach SIDBI / bank green lines and sustainability-linked loans with confidence.", rate: "-0.5% to -1.0%" }
    : score >= 50
      ? { label: "Eligible with gaps", color: "text-yellow-400", note: "Close the unchecked items to unlock better rate step-downs.", rate: "-0.25%" }
      : { label: "Not yet ready", color: "text-orange-400", note: "Build a footprint and a reduction target first - these are table-stakes for green credit.", rate: "standard" };
  const loanAmt = parseFloat(amount) || 0;
  // illustrative annual interest saving from a rate step-down tied to band
  const stepDown = score >= 75 ? 0.0075 : score >= 50 ? 0.0025 : 0;
  const annualSaving = loanAmt * stepDown;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> Green-Loan Eligibility Score</h3>
        <p className="text-xs text-[var(--color-muted)]">Self-assess readiness for green / sustainability-linked finance (SIDBI, bank green lines). Tick what you can evidence - lenders often offer a rate step-down for strong ESG profiles.</p>
        <div className="space-y-1.5">
          {GREEN_CRITERIA.map(c => (
            <label key={c.id} className="flex items-center justify-between gap-2.5 cursor-pointer text-sm py-1">
              <span className="flex items-center gap-2.5">
                <input type="checkbox" checked={!!checks[c.id]} onChange={() => toggle(c.id)} className="accent-[var(--color-primary)]" />
                <span className={checks[c.id] ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}>{c.label}</span>
              </span>
              <span className="text-[10px] text-[var(--color-muted)] tabular-nums shrink-0">{c.weight} pts</span>
            </label>
          ))}
        </div>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Loan amount sought (₹, optional)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 5000000" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Eligibility score</p>
          <p className={`text-2xl font-bold tabular-nums ${band.color}`}>{score}<span className="text-sm">/100</span></p>
          <p className={`text-[10px] mt-0.5 ${band.color}`}>{band.label}</p>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative rate step-down</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">{band.rate}</p>
          <p className="text-[10px] text-[var(--color-muted)] mt-0.5">vs standard term loan</p>
        </div>
        {loanAmt > 0 && (
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Est. annual interest saving</p>
            <p className="text-2xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(annualSaving))}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">at {(stepDown * 100).toFixed(2)}% step-down</p>
          </div>
        )}
        <div className={`${CARD} p-4 ${loanAmt > 0 ? "" : "md:col-span-2"}`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Next step</p>
          <p className="text-xs text-[var(--color-text)] mt-1">{band.note}</p>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative screening only - actual eligibility, rates and step-downs are set by the lender. Use this to prioritise which ESG gaps to close before applying.</p>
    </div>
  );
}

// ── #21 Net-Zero Pathway Planner (linear glide-path to target year) ──────────────
function NetZeroPathwayPlanner() {
  const [baselineT, setBaselineT] = useState("");
  const [baseYear, setBaseYear] = useState("2024");
  const [targetYear, setTargetYear] = useState("2050");
  const [residualPct, setResidualPct] = useState("10"); // % of baseline left to offset at net-zero

  const n = (v: string) => parseFloat(v) || 0;
  const base = n(baselineT);
  const by = Math.round(n(baseYear));
  const ty = Math.round(n(targetYear));
  const residual = base * (n(residualPct) / 100);
  const span = ty - by;
  const valid = base > 0 && span > 0;

  const rows = useMemo(() => {
    if (!valid) return [] as { year: number; cap: number; cut: number }[];
    const out: { year: number; cap: number; cut: number }[] = [];
    for (let y = by; y <= ty; y++) {
      const frac = (y - by) / span;
      const cap = base - (base - residual) * frac;
      out.push({ year: y, cap, cut: base - cap });
    }
    return out;
  }, [valid, by, ty, span, base, residual]);

  const annualCut = valid && span > 0 ? (base - residual) / span : 0;
  const annualCutPct = base > 0 ? (annualCut / base) * 100 : 0;
  const sbtiAligned = annualCutPct >= 4.2; // ~1.5°C linear pace

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Route size={14} className="text-[var(--color-primary)]" /> Net-Zero Pathway Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">Build a year-by-year glide path from your baseline to a chosen net-zero year. The plan caps absolute emissions each year; residual is what you offset rather than cut.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Baseline (tCO₂e)</label>
            <input type="number" value={baselineT} onChange={e => setBaselineT(e.target.value)} placeholder="e.g. 500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base year</label>
            <input type="number" value={baseYear} onChange={e => setBaseYear(e.target.value)} placeholder="2024" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Net-zero by</label>
            <input type="number" value={targetYear} onChange={e => setTargetYear(e.target.value)} placeholder="2050" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Residual to offset (%)</label>
            <input type="number" value={residualPct} onChange={e => setResidualPct(e.target.value)} placeholder="10" className={INP} />
          </div>
        </div>
      </div>

      {valid && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Required annual cut", value: `${annualCut.toFixed(1)} tCO₂e`, color: "text-orange-400" },
              { label: "As % of baseline / yr", value: `${annualCutPct.toFixed(1)}%`, color: sbtiAligned ? "text-green-400" : "text-yellow-400" },
              { label: "Residual to offset", value: fmtT(residual * 1000), color: "text-[var(--color-text)]" },
              { label: "Years to net-zero", value: `${span}`, color: "text-[var(--color-primary)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${sbtiAligned ? "border-green-800/40 bg-green-950/20" : "border-yellow-800/40 bg-yellow-950/20"}`}>
            <p className={`text-sm font-bold flex items-center gap-2 ${sbtiAligned ? "text-green-400" : "text-yellow-400"}`}>
              {sbtiAligned ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {sbtiAligned ? "Pace meets the ~4.2%/yr linear cut a 1.5°C SBTi pathway expects." : "Pace is below the ~4.2%/yr a 1.5°C SBTi pathway expects - bring the target year forward or cut deeper early."}
            </p>
          </div>
          <div className={`${CARD} p-4 space-y-2`}>
            <p className="text-sm font-semibold mb-1">Emission cap by year</p>
            {rows.filter((_, i) => i % Math.max(1, Math.ceil(rows.length / 12)) === 0 || _.year === ty).map(r => {
              const pct = base > 0 ? (r.cap / base) * 100 : 0;
              return (
                <div key={r.year}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium tabular-nums">{r.year}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">{r.cap.toFixed(0)} tCO₂e · −{r.cut.toFixed(0)}</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-primary)]/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A simple linear glide path. Real plans front-load cuts via marginal-abatement-cost ordering and verify residual offsets - treat this as a directional target, not a committed SBTi submission.</p>
    </div>
  );
}

// ── #22 Supplier ESG Questionnaire Tracker ──────────────────────────────────────
type SurveyStatus = "not_sent" | "sent" | "responded" | "verified";
type SurveyRow = { id: string; supplier: string; sentOn: string; status: SurveyStatus };
const SURVEY_FLOW: { id: SurveyStatus; label: string; color: string }[] = [
  { id: "not_sent", label: "Not sent", color: "text-[var(--color-muted)]" },
  { id: "sent", label: "Sent", color: "text-yellow-400" },
  { id: "responded", label: "Responded", color: "text-blue-400" },
  { id: "verified", label: "Verified", color: "text-green-400" },
];
function SupplierQuestionnaireTracker() {
  const [rows, setRows] = useFeatureState<SurveyRow[]>("esg-supplier-survey", []);
  const [supplier, setSupplier] = useState("");

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter a supplier name"); return; }
    setRows([...rows, { id: crypto.randomUUID(), supplier: supplier.trim(), sentOn: new Date().toISOString().slice(0, 10), status: "not_sent" }]);
    setSupplier("");
    toast.success("Supplier added to survey list");
  };
  const advance = (id: string) => setRows(rows.map(r => {
    if (r.id !== id) return r;
    const idx = SURVEY_FLOW.findIndex(f => f.id === r.status);
    const next = SURVEY_FLOW[Math.min(idx + 1, SURVEY_FLOW.length - 1)].id;
    return { ...r, status: next, sentOn: next === "sent" ? new Date().toISOString().slice(0, 10) : r.sentOn };
  }));

  const count = (s: SurveyStatus) => rows.filter(r => r.status === s).length;
  const responded = count("responded") + count("verified");
  const responseRate = rows.length > 0 ? (responded / rows.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} className="text-[var(--color-primary)]" /> Supplier ESG Questionnaire Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Track who you've asked for primary ESG / emissions data and how far each has progressed - the response rate is what turns Scope 3 estimates into assurance-grade figures.</p>
        <div className="flex gap-2 items-end max-w-md">
          <div className="flex-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Supplier name</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Acme Components Pvt Ltd" className={INP} />
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
              { label: "Suppliers tracked", value: `${rows.length}`, color: "text-[var(--color-text)]" },
              { label: "Sent / awaiting", value: `${count("sent")}`, color: "text-yellow-400" },
              { label: "Verified responses", value: `${count("verified")}`, color: "text-green-400" },
              { label: "Response rate", value: `${responseRate.toFixed(0)}%`, color: responseRate >= 60 ? "text-green-400" : "text-orange-400" },
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
                  <tr>{["Supplier", "Last updated", "Status", "Action", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const st = SURVEY_FLOW.find(f => f.id === r.status)!;
                    const isFinal = r.status === "verified";
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.supplier}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)] tabular-nums">{r.sentOn}</td>
                        <td className={`px-4 py-2.5 text-xs font-semibold ${st.color}`}>{st.label}</td>
                        <td className="px-4 py-2.5">
                          {!isFinal && <button onClick={() => advance(r.id)} className="text-[10px] text-[var(--color-primary)] hover:underline">Advance →</button>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Advance each supplier as you send, receive and verify their questionnaire. Prioritise your highest-spend vendors - they usually drive most of your Scope 3.</p>
    </div>
  );
}

// ── #23 ESG Report Builder (sections → export) ──────────────────────────────────
type ReportSections = Record<string, boolean>;
const REPORT_SECTIONS: { id: string; title: string; body: string }[] = [
  { id: "about", title: "About the business", body: "Overview, locations, products/services and reporting boundary." },
  { id: "footprint", title: "Carbon footprint (Scope 1/2/3)", body: "GHG inventory by scope with methodology and emission factors used." },
  { id: "energy", title: "Energy & water", body: "Electricity, fuel and water consumption with year-on-year trend." },
  { id: "waste", title: "Waste & circularity", body: "Waste streams, recycling/diversion rate and EPR compliance." },
  { id: "social", title: "People & social", body: "Workforce diversity, training, safety and community/CSR initiatives." },
  { id: "governance", title: "Governance & ethics", body: "Board oversight, code of conduct, data privacy and risk controls." },
  { id: "targets", title: "Targets & progress", body: "Reduction targets, net-zero pathway and progress against baseline." },
  { id: "green", title: "Green finance & spend", body: "Sustainability-linked spend, green loans and certificates." },
];
function EsgReportBuilder() {
  const [sel, setSel] = useFeatureState<ReportSections>("esg-report-sections", {});
  const [orgName, setOrgName] = useState("");
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const toggle = (id: string) => setSel({ ...sel, [id]: !sel[id] });

  const chosen = REPORT_SECTIONS.filter(s => sel[s.id]);

  const exportReport = () => {
    if (chosen.length === 0) { toast.error("Select at least one section"); return; }
    const lines: string[] = [];
    lines.push(`${orgName.trim() || "Our Business"} - Sustainability Report ${year}`);
    lines.push("=".repeat(60), "");
    chosen.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.title}`);
      lines.push(s.body, "");
    });
    lines.push("Generated from your books - figures should be reviewed before publication.");
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sustainability-report-${year}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report outline exported");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> ESG Report Builder</h3>
        <p className="text-xs text-[var(--color-muted)]">Pick the sections to include in your annual sustainability report, then export a structured outline you can fill with the figures from the other tools.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Business name</label>
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Your business name" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reporting year</label>
            <input value={year} onChange={e => setYear(e.target.value)} placeholder="2026" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {REPORT_SECTIONS.map(s => (
            <label key={s.id} className={`flex items-start gap-2.5 cursor-pointer text-sm p-2.5 rounded-lg border transition-colors ${sel[s.id] ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"}`}>
              <input type="checkbox" checked={!!sel[s.id]} onChange={() => toggle(s.id)} className="accent-[var(--color-primary)] mt-0.5" />
              <span>
                <span className="font-medium block">{s.title}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{s.body}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-[var(--color-muted)]">{chosen.length} of {REPORT_SECTIONS.length} sections selected</span>
          <button onClick={exportReport} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <FileText size={13} /> Export outline (.txt)
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Exports a plain-text skeleton, not a designed PDF. Map sections to GRI/BRSR principles with your CA before any external publication.</p>
    </div>
  );
}

// ── #24 Climate-Risk Assessment (physical + transition) ─────────────────────────
type RiskState = Record<string, number>; // 0 none, 1 low, 2 med, 3 high
const RISK_ITEMS: { id: string; type: "Physical" | "Transition"; label: string }[] = [
  { id: "flood", type: "Physical", label: "Flooding / waterlogging of premises" },
  { id: "heat", type: "Physical", label: "Extreme heat affecting operations / workers" },
  { id: "cyclone", type: "Physical", label: "Cyclone / storm exposure of sites" },
  { id: "water", type: "Physical", label: "Water scarcity / drought in operating basin" },
  { id: "carbonprice", type: "Transition", label: "Carbon pricing / CBAM on products" },
  { id: "policy", type: "Transition", label: "Tighter emission / disclosure regulation" },
  { id: "market", type: "Transition", label: "Customers shifting to low-carbon suppliers" },
  { id: "tech", type: "Transition", label: "Tech / asset obsolescence (stranded capex)" },
];
const RISK_LEVELS = ["None", "Low", "Medium", "High"];
function ClimateRiskAssessment() {
  const [state, setState] = useFeatureState<RiskState>("esg-climate-risk", {});
  const set = (id: string, v: number) => setState({ ...state, [id]: v });

  const score = (type: "Physical" | "Transition") => {
    const items = RISK_ITEMS.filter(i => i.type === type);
    const sum = items.reduce((s, i) => s + (state[i.id] ?? 0), 0);
    return { sum, max: items.length * 3, pct: items.length > 0 ? (sum / (items.length * 3)) * 100 : 0 };
  };
  const phys = score("Physical"), trans = score("Transition");
  const overall = Math.round((phys.pct + trans.pct) / 2);
  const band = overall >= 60 ? { label: "High exposure", color: "text-red-400" } : overall >= 30 ? { label: "Moderate exposure", color: "text-yellow-400" } : { label: "Low exposure", color: "text-green-400" };
  const types: ("Physical" | "Transition")[] = ["Physical", "Transition"];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-2`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Climate-Risk Assessment</h3>
        <p className="text-xs text-[var(--color-muted)]">A TCFD-style screen of physical (acute/chronic) and transition risks. Rate each from None to High - the result frames the climate-risk section of disclosures and lender questionnaires.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Overall exposure</p>
          <p className={`text-2xl font-bold tabular-nums ${band.color}`}>{overall}<span className="text-sm">/100</span></p>
          <p className={`text-[10px] mt-0.5 ${band.color}`}>{band.label}</p>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Physical risk</p>
          <p className="text-2xl font-bold tabular-nums text-orange-400">{phys.pct.toFixed(0)}%</p>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Transition risk</p>
          <p className="text-2xl font-bold tabular-nums text-blue-400">{trans.pct.toFixed(0)}%</p>
        </div>
      </div>

      {types.map(type => (
        <div key={type} className={`${CARD} p-4 space-y-3`}>
          <p className="text-sm font-semibold">{type} risks</p>
          {RISK_ITEMS.filter(i => i.type === type).map(i => {
            const v = state[i.id] ?? 0;
            return (
              <div key={i.id}>
                <label className="text-xs flex justify-between mb-1">
                  <span>{i.label}</span>
                  <strong className={v >= 3 ? "text-red-400" : v === 2 ? "text-yellow-400" : "text-[var(--color-muted)]"}>{RISK_LEVELS[v]}</strong>
                </label>
                <input type="range" min={0} max={3} step={1} value={v} onChange={e => set(i.id, Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
              </div>
            );
          })}
        </div>
      ))}
      <p className="text-[10px] text-[var(--color-muted)]">A qualitative self-assessment. For TCFD-aligned reporting, pair each rated risk with a financial-impact estimate and a mitigation/adaptation action.</p>
    </div>
  );
}

// ── #25 Sustainable Procurement Scorecard ───────────────────────────────────────
type ProcRow = { id: string; category: string; spend: number; sustainable: number };
function SustainableProcurementScorecard() {
  const [rows, setRows] = useFeatureState<ProcRow[]>("esg-procurement", []);
  const [category, setCategory] = useState("");
  const [spend, setSpend] = useState("");
  const [sustainable, setSustainable] = useState("");

  const add = () => {
    const sp = parseFloat(spend), su = parseFloat(sustainable) || 0;
    if (!category.trim() || isNaN(sp) || sp <= 0) { toast.error("Enter a category and total spend"); return; }
    if (su > sp) { toast.error("Sustainable spend can't exceed total"); return; }
    setRows([...rows, { id: crypto.randomUUID(), category: category.trim(), spend: sp, sustainable: su }]);
    setCategory(""); setSpend(""); setSustainable("");
    toast.success("Procurement category added");
  };

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalSust = rows.reduce((s, r) => s + r.sustainable, 0);
  const greenShare = totalSpend > 0 ? (totalSust / totalSpend) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShoppingCart size={14} className="text-[var(--color-primary)]" /> Sustainable Procurement Scorecard</h3>
        <p className="text-xs text-[var(--color-muted)]">For each spend category, log how much went to certified / lower-carbon / local suppliers. The green-procurement share is a headline circularity and supply-chain metric.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Category</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Packaging" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total spend (₹)</label>
            <input type="number" value={spend} onChange={e => setSpend(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sustainable (₹)</label>
            <input type="number" value={sustainable} onChange={e => setSustainable(e.target.value)} placeholder="0" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Total procurement", value: formatCurrency(Math.round(totalSpend)), color: "text-[var(--color-text)]" },
              { label: "Sustainable spend", value: formatCurrency(Math.round(totalSust)), color: "text-green-400" },
              { label: "Green procurement share", value: `${greenShare.toFixed(1)}%`, color: greenShare >= 50 ? "text-green-400" : greenShare >= 25 ? "text-yellow-400" : "text-orange-400" },
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
                  <tr>{["Category", "Total spend", "Sustainable", "Share", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const share = r.spend > 0 ? (r.sustainable / r.spend) * 100 : 0;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.category}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.spend))}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.sustainable))}</td>
                        <td className="px-4 py-2.5 tabular-nums">{share.toFixed(0)}%</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">"Sustainable" is what you define - certified (ISO 14001/FSC), recycled-content, local or low-carbon. Document the criteria so the share is defensible.</p>
    </div>
  );
}

// ── #26 Community / CSR Impact Tracker ──────────────────────────────────────────
type CsrRow = { id: string; project: string; theme: string; spend: number; beneficiaries: number };
const CSR_THEMES = ["Education", "Healthcare", "Environment", "Livelihoods / skilling", "Rural development", "Other"];
function CsrImpactTracker() {
  const { store } = useApp();
  const annualProfit = useMemo(() => {
    let rev = 0, exp = 0;
    for (const t of store.transactions) { if (t.amount > 0) rev += t.amount; else exp += Math.abs(t.amount); }
    return rev - exp;
  }, [store.transactions]);
  const csrGuide = annualProfit > 0 ? annualProfit * 0.02 : 0; // 2% indicative (Sec 135 applies above thresholds)

  const [rows, setRows] = useFeatureState<CsrRow[]>("esg-csr", []);
  const [project, setProject] = useState("");
  const [theme, setTheme] = useState(CSR_THEMES[0]);
  const [spend, setSpend] = useState("");
  const [beneficiaries, setBeneficiaries] = useState("");

  const add = () => {
    const sp = parseFloat(spend), b = parseFloat(beneficiaries) || 0;
    if (!project.trim() || isNaN(sp) || sp <= 0) { toast.error("Enter a project and spend"); return; }
    setRows([...rows, { id: crypto.randomUUID(), project: project.trim(), theme, spend: sp, beneficiaries: b }]);
    setProject(""); setSpend(""); setBeneficiaries("");
    toast.success("CSR project logged");
  };

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalBen = rows.reduce((s, r) => s + r.beneficiaries, 0);
  const costPerBen = totalBen > 0 ? totalSpend / totalBen : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><HeartHandshake size={14} className="text-[var(--color-primary)]" /> Community / CSR Impact Tracker</h3>
          {csrGuide > 0 && <span className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />2% of profit (indicative CSR): {formatCurrency(Math.round(csrGuide))}</span>}
        </div>
        <p className="text-xs text-[var(--color-muted)]">Log community and CSR projects with spend and reach - the 'S' that BRSR Principle 8 and investors ask for. (Companies Act Sec 135 mandates 2% CSR above ₹5cr profit / ₹500cr turnover thresholds.)</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Project</label>
            <input value={project} onChange={e => setProject(e.target.value)} placeholder="e.g. School supplies" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Theme</label>
            <select value={theme} onChange={e => setTheme(e.target.value)} className={INP}>
              {CSR_THEMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Spend (₹)</label>
            <input type="number" value={spend} onChange={e => setSpend(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Beneficiaries</label>
            <input type="number" value={beneficiaries} onChange={e => setBeneficiaries(e.target.value)} placeholder="0" className={INP} />
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
              { label: "Total CSR spend", value: formatCurrency(Math.round(totalSpend)), color: "text-green-400" },
              { label: "People reached", value: totalBen.toLocaleString("en-IN"), color: "text-[var(--color-primary)]" },
              { label: "Cost per beneficiary", value: costPerBen > 0 ? formatCurrency(Math.round(costPerBen)) : "-", color: "text-[var(--color-text)]" },
              { label: "Projects", value: `${rows.length}`, color: "text-[var(--color-text)]" },
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
                  <tr>{["Project", "Theme", "Spend", "Beneficiaries", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.project}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.theme}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.spend))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.beneficiaries.toLocaleString("en-IN")}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />The 2% figure is indicative - statutory CSR under Sec 135 only applies above net-worth/turnover/profit thresholds. Confirm applicability with your CA.</p>
    </div>
  );
}

// ── #27 Energy Cost-Savings Tracker (efficiency measures) ───────────────────────
type SavingRow = { id: string; measure: string; capex: number; annualSaving: number; co2Saving: number };
function EnergySavingsTracker() {
  const [rows, setRows] = useFeatureState<SavingRow[]>("esg-energy-savings", []);
  const [measure, setMeasure] = useState("");
  const [capex, setCapex] = useState("");
  const [annualSaving, setAnnualSaving] = useState("");
  const [co2Saving, setCo2Saving] = useState("");

  const add = () => {
    const cp = parseFloat(capex) || 0, sv = parseFloat(annualSaving), co2 = parseFloat(co2Saving) || 0;
    if (!measure.trim() || isNaN(sv) || sv <= 0) { toast.error("Enter a measure and its annual saving"); return; }
    setRows([...rows, { id: crypto.randomUUID(), measure: measure.trim(), capex: cp, annualSaving: sv, co2Saving: co2 }]);
    setMeasure(""); setCapex(""); setAnnualSaving(""); setCo2Saving("");
    toast.success("Efficiency measure logged");
  };

  const totalCapex = rows.reduce((s, r) => s + r.capex, 0);
  const totalSaving = rows.reduce((s, r) => s + r.annualSaving, 0);
  const totalCo2 = rows.reduce((s, r) => s + r.co2Saving, 0);
  const blendedPayback = totalSaving > 0 ? totalCapex / totalSaving : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Energy Cost-Savings Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Log energy-efficiency measures (LED retrofit, VFDs, insulation, BEE-5-star upgrades) with their capex, annual ₹ saving and CO₂e cut. Tracks both the money and the carbon return.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Measure</label>
            <input value={measure} onChange={e => setMeasure(e.target.value)} placeholder="e.g. LED retrofit" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Capex (₹)</label>
            <input type="number" value={capex} onChange={e => setCapex(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual saving (₹)</label>
            <input type="number" value={annualSaving} onChange={e => setAnnualSaving(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">CO₂e cut (t/yr)</label>
            <input type="number" value={co2Saving} onChange={e => setCo2Saving(e.target.value)} placeholder="0" className={INP} />
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
              { label: "Total capex", value: formatCurrency(Math.round(totalCapex)), color: "text-[var(--color-text)]" },
              { label: "Annual ₹ saving", value: formatCurrency(Math.round(totalSaving)), color: "text-green-400" },
              { label: "Blended payback", value: blendedPayback > 0 ? `${blendedPayback.toFixed(1)} yrs` : "Immediate", color: "text-[var(--color-primary)]" },
              { label: "CO₂e cut / yr", value: `${totalCo2.toFixed(1)} tCO₂e`, color: "text-green-400" },
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
                  <tr>{["Measure", "Capex", "Annual saving", "Payback", "CO₂e/yr", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {[...rows].sort((a, b) => {
                    const pa = a.annualSaving > 0 ? a.capex / a.annualSaving : 0;
                    const pb = b.annualSaving > 0 ? b.capex / b.annualSaving : 0;
                    return pa - pb;
                  }).map(r => {
                    const pay = r.annualSaving > 0 ? r.capex / r.annualSaving : 0;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.measure}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.capex))}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.annualSaving))}</td>
                        <td className="px-4 py-2.5 tabular-nums">{pay > 0 ? `${pay.toFixed(1)} yrs` : "-"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-400">{r.co2Saving.toFixed(1)} t</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Measures are ranked by payback - fastest first. Energy efficiency is usually the cheapest abatement; many measures also qualify for accelerated depreciation.</p>
    </div>
  );
}

// ── Emissions per Employee ──────────────────────────────────────────────────────
function EmissionsPerEmployee() {
  const [emissionsT, setEmissionsT] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [prevPerHead, setPrevPerHead] = useState("");

  const tonnes = parseFloat(emissionsT) || 0;
  const heads = parseFloat(headcount) || 0;
  const perHead = heads > 0 ? tonnes / heads : 0;
  const prev = parseFloat(prevPerHead) || 0;
  const delta = prev > 0 && perHead > 0 ? ((perHead - prev) / prev) * 100 : null;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserCheck size={14} className="text-[var(--color-primary)]" /> Emissions per Employee</h3>
        <p className="text-xs text-[var(--color-muted)]">Per-head intensity is the headcount-normalised metric investors use to compare service firms. Pull total emissions from the Scope calculator.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total emissions (tCO₂e/yr)</label>
            <input type="number" value={emissionsT} onChange={e => setEmissionsT(e.target.value)} placeholder="e.g. 120" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Full-time-equivalent headcount</label>
            <input type="number" value={headcount} onChange={e => setHeadcount(e.target.value)} placeholder="e.g. 45" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Prior-year per-head (optional)</label>
            <input type="number" value={prevPerHead} onChange={e => setPrevPerHead(e.target.value)} placeholder="tCO₂e / FTE" className={INP} />
          </div>
        </div>
      </div>

      {tonnes > 0 && heads > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Per employee", value: `${perHead.toFixed(2)}`, sub: "tCO₂e / FTE", color: "text-orange-400" },
              { label: "Per employee (kg)", value: `${Math.round(perHead * 1000).toLocaleString("en-IN")}`, sub: "kg CO₂e / FTE", color: "text-[var(--color-text)]" },
              { label: "YoY change", value: delta === null ? "-" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`, sub: delta === null ? "Add prior year" : delta < 0 ? "Improving" : "Worsening", color: delta === null ? "text-[var(--color-muted)]" : delta < 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Per-FTE emissions normalise for company size - useful for benchmarking against peers and for office-based businesses where revenue intensity is less comparable.</p>
    </div>
  );
}

// ── Renewable vs Grid Mix ───────────────────────────────────────────────────────
function RenewableGridMix() {
  const [grid, setGrid] = useState("");
  const [solar, setSolar] = useState("");
  const [rec, setRec] = useState("");

  const n = (v: string) => parseFloat(v) || 0;
  const gridKwh = n(grid), solarKwh = n(solar), recKwh = n(rec);
  const total = gridKwh + solarKwh + recKwh;
  const renewable = solarKwh + recKwh;
  const renewablePct = total > 0 ? (renewable / total) * 100 : 0;
  // Grid emissions only on the grid portion; renewables assumed zero-emission.
  const gridEmissions = gridKwh * GRID_FACTOR;
  const avoided = renewable * GRID_FACTOR;

  const segs = [
    { label: "On-site solar", kwh: solarKwh, color: "#22c55e" },
    { label: "RECs / green tariff", kwh: recKwh, color: "#3b82f6" },
    { label: "Grid (fossil-heavy)", kwh: gridKwh, color: "#ef4444" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BatteryCharging size={14} className="text-green-400" /> Renewable vs Grid Mix</h3>
        <p className="text-xs text-[var(--color-muted)]">Split your annual electricity into grid, on-site solar and REC/green-tariff units to compute your renewable share - the headline number for RE100-style commitments.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Grid electricity (kWh/yr)</label>
            <input type="number" value={grid} onChange={e => setGrid(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">On-site solar (kWh/yr)</label>
            <input type="number" value={solar} onChange={e => setSolar(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">RECs / green tariff (kWh/yr)</label>
            <input type="number" value={rec} onChange={e => setRec(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {total > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Renewable share", value: `${renewablePct.toFixed(1)}%`, color: renewablePct >= 50 ? "text-green-400" : "text-orange-400" },
              { label: "Total consumption", value: `${total.toLocaleString("en-IN")} kWh`, color: "text-[var(--color-text)]" },
              { label: "Grid emissions", value: fmtT(gridEmissions), color: "text-red-400" },
              { label: "Emissions avoided", value: fmtT(avoided), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-4 space-y-2`}>
            <p className="text-sm font-semibold mb-1">Energy mix</p>
            <div className="flex h-4 w-full rounded-full overflow-hidden bg-[var(--color-bg)]">
              {segs.map(s => (
                <div key={s.label} style={{ width: `${total > 0 ? (s.kwh / total) * 100 : 0}%`, background: s.color }} title={`${s.label}: ${s.kwh.toLocaleString("en-IN")} kWh`} />
              ))}
            </div>
            {segs.filter(s => s.kwh > 0).map(s => (
              <p key={s.label} className="text-[11px] text-[var(--color-muted)]">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: s.color }} />
                {s.label} - {s.kwh.toLocaleString("en-IN")} kWh · {((s.kwh / total) * 100).toFixed(0)}%
              </p>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">RECs and green tariffs count toward your renewable share only if retired/unbundled in your name. On-site generation is the most defensible. Grid factor {GRID_FACTOR} kg CO₂e/kWh.</p>
    </div>
  );
}

// ── Green Certification Checklist ───────────────────────────────────────────────
type CertItem = { id: string; name: string; group: string; note: string };
const CERT_ITEMS: CertItem[] = [
  { id: "c1", group: "Environment", name: "ISO 14001 - Environmental management", note: "Most-requested by procurement teams" },
  { id: "c2", group: "Environment", name: "ISO 50001 - Energy management", note: "Pairs well with energy audits" },
  { id: "c3", group: "Environment", name: "IGBC / GRIHA green building rating", note: "For owned/leased premises" },
  { id: "c4", group: "Product", name: "BIS / Ecomark eco-label", note: "Indian product environmental label" },
  { id: "c5", group: "Product", name: "EPR registration (CPCB)", note: "Mandatory for plastic/e-waste producers" },
  { id: "c6", group: "Social", name: "ISO 45001 - Occupational health & safety", note: "Worker safety assurance" },
  { id: "c7", group: "Social", name: "SA8000 - Social accountability", note: "Labour-rights audit for exporters" },
  { id: "c8", group: "Governance", name: "ISO 27001 - Information security", note: "Often bundled in ESG questionnaires" },
];
function GreenCertificationChecklist() {
  const [status, setStatus] = useFeatureState<Record<string, "none" | "progress" | "held">>("esg-certifications", {});
  const cycle = (id: string) => {
    const cur = status[id] ?? "none";
    const next = cur === "none" ? "progress" : cur === "progress" ? "held" : "none";
    setStatus({ ...status, [id]: next });
  };
  const groups = Array.from(new Set(CERT_ITEMS.map(i => i.group)));
  const held = CERT_ITEMS.filter(i => status[i.id] === "held").length;
  const progress = CERT_ITEMS.filter(i => status[i.id] === "progress").length;
  const STYLE = {
    none: { label: "Not started", cls: "text-[var(--color-muted)] border-[var(--color-border)]" },
    progress: { label: "In progress", cls: "text-yellow-400 border-yellow-800/40" },
    held: { label: "Certified", cls: "text-green-400 border-green-800/40" },
  } as const;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Award size={14} className="text-[var(--color-primary)]" /> Green Certification Checklist</h3>
          <span className="text-sm font-bold tabular-nums text-green-400">{held} held · <span className="text-yellow-400">{progress} in progress</span></span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Track the certifications buyers and lenders ask for. Click a row to cycle Not started → In progress → Certified.</p>
      </div>

      {groups.map(g => (
        <div key={g} className={`${CARD} p-4 space-y-2`}>
          <p className="text-sm font-semibold">{g}</p>
          {CERT_ITEMS.filter(i => i.group === g).map(i => {
            const st = STYLE[status[i.id] ?? "none"];
            return (
              <button key={i.id} onClick={() => cycle(i.id)}
                className={`w-full text-left flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors hover:border-[var(--color-primary)]/40 ${st.cls}`}>
                <span>
                  <span className="text-sm font-medium text-[var(--color-text)] block">{i.name}</span>
                  <span className="text-[10px] text-[var(--color-muted)]">{i.note}</span>
                </span>
                <span className={`text-xs font-semibold whitespace-nowrap ${st.cls.split(" ")[0]}`}>{st.label}</span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />An indicative shortlist of common India-relevant certifications. Scope, cost and applicability vary - confirm requirements with the issuing body or your auditor before applying.</p>
    </div>
  );
}

// ── ESG Rating Improvement Planner ──────────────────────────────────────────────
type RatingAction = { id: string; pillar: "E" | "S" | "G"; action: string; points: number; effort: "Low" | "Medium" | "High" };
const RATING_ACTIONS: RatingAction[] = [
  { id: "r1", pillar: "E", action: "Complete a Scope 1 & 2 GHG inventory", points: 12, effort: "Medium" },
  { id: "r2", pillar: "E", action: "Publish a net-zero / reduction target", points: 8, effort: "Low" },
  { id: "r3", pillar: "E", action: "Source 25%+ electricity from renewables", points: 10, effort: "High" },
  { id: "r4", pillar: "E", action: "Implement a waste-segregation & recycling process", points: 6, effort: "Low" },
  { id: "r5", pillar: "S", action: "Formalise health, safety & POSH policies", points: 8, effort: "Low" },
  { id: "r6", pillar: "S", action: "Track and disclose gender diversity ratios", points: 6, effort: "Low" },
  { id: "r7", pillar: "S", action: "Run a measurable CSR / community programme", points: 7, effort: "Medium" },
  { id: "r8", pillar: "G", action: "Adopt a board-approved code of conduct", points: 7, effort: "Low" },
  { id: "r9", pillar: "G", action: "Document a whistleblower / grievance mechanism", points: 6, effort: "Low" },
  { id: "r10", pillar: "G", action: "Obtain independent assurance on ESG data", points: 10, effort: "High" },
];
function EsgRatingPlanner() {
  const [done, setDone] = useFeatureState<Record<string, boolean>>("esg-rating-plan", {});
  const toggle = (id: string) => setDone({ ...done, [id]: !done[id] });

  const maxPoints = RATING_ACTIONS.reduce((s, a) => s + a.points, 0);
  const earned = RATING_ACTIONS.filter(a => done[a.id]).reduce((s, a) => s + a.points, 0);
  const score = Math.round((earned / maxPoints) * 100);
  const open = RATING_ACTIONS.filter(a => !done[a.id]);
  // Quick wins: highest points per effort, low effort first.
  const effortRank = { Low: 1, Medium: 2, High: 3 } as const;
  const quickWins = [...open].sort((a, b) => effortRank[a.effort] - effortRank[b.effort] || b.points - a.points).slice(0, 3);
  const band = score >= 75 ? { label: "Strong", color: "text-green-400" } : score >= 50 ? { label: "Moderate", color: "text-yellow-400" } : { label: "Emerging", color: "text-orange-400" };

  const PILLAR_NAME = { E: "Environment", S: "Social", G: "Governance" } as const;
  const pillars: ("E" | "S" | "G")[] = ["E", "S", "G"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Projected rating", value: `${score}/100`, sub: band.label, color: band.color },
          { label: "Points earned", value: `${earned}`, sub: `of ${maxPoints}`, color: "text-[var(--color-text)]" },
          { label: "Actions done", value: `${RATING_ACTIONS.filter(a => done[a.id]).length}`, sub: `of ${RATING_ACTIONS.length}`, color: "text-[var(--color-primary)]" },
          { label: "Open actions", value: `${open.length}`, sub: "to close gaps", color: "text-orange-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {quickWins.length > 0 && (
        <div className={`${CARD} p-4 space-y-2`}>
          <p className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Recommended quick wins</p>
          {quickWins.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text)]">{a.action}</span>
              <span className="tabular-nums text-[var(--color-muted)]">+{a.points} pts · {a.effort} effort</span>
            </div>
          ))}
        </div>
      )}

      {pillars.map(p => (
        <div key={p} className={`${CARD} p-4 space-y-2`}>
          <p className="text-sm font-semibold">{PILLAR_NAME[p]}</p>
          {RATING_ACTIONS.filter(a => a.pillar === p).map(a => (
            <label key={a.id} className="flex items-center justify-between gap-3 cursor-pointer text-sm py-1">
              <span className="flex items-center gap-2.5">
                <input type="checkbox" checked={!!done[a.id]} onChange={() => toggle(a.id)} className="accent-[var(--color-primary)]" />
                <span className={done[a.id] ? "text-[var(--color-text)] line-through opacity-70" : "text-[var(--color-text)]"}>{a.action}</span>
              </span>
              <span className="text-[10px] text-[var(--color-muted)] whitespace-nowrap tabular-nums">+{a.points} · {a.effort}</span>
            </label>
          ))}
        </div>
      ))}
      <p className="text-[10px] text-[var(--color-muted)]">A directional planner weighted by typical rater impact and effort - not a substitute for a CRISIL/CDP/EcoVadis methodology. Use it to sequence improvements, not to predict an exact agency score.</p>
    </div>
  );
}
