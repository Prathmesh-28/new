import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  ShieldCheck, Wallet, AlertTriangle, Calculator, HeartPulse, Building2,
  Landmark, FileWarning, GitCompareArrows, UserCheck, Gauge, Plus,
  CheckCircle2, CalendarClock, ShieldAlert, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

type Tab =
  | "overview" | "register" | "gaps" | "suminsured" | "grouphealth"
  | "assetcover" | "tradecredit" | "claims" | "premvscover" | "keyman" | "riskscore";

// shared styles (reused from Tax/Debt pattern)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

export default function InsurancePage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck size={18} className="text-[var(--color-primary)]" /> Insurance & Protection
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Track every policy, size your cover, find protection gaps and price premiums — IRDAI-aware, GST-on-premium included.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", ShieldCheck],
            ["register", "Policy Register", Wallet],
            ["gaps", "Coverage Gaps", FileWarning],
            ["suminsured", "Sum-Insured Calc", Calculator],
            ["grouphealth", "Group Health", HeartPulse],
            ["assetcover", "Asset Cover", Building2],
            ["tradecredit", "Trade-Credit", Landmark],
            ["claims", "Claims Tracker", ShieldAlert],
            ["premvscover", "Premium vs Cover", GitCompareArrows],
            ["keyman", "Key-Man Cover", UserCheck],
            ["riskscore", "Risk Scorecard", Gauge],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview onPick={setTab} />}
      {tab === "register" && <PolicyRegister />}
      {tab === "gaps" && <CoverageGapAnalyzer />}
      {tab === "suminsured" && <SumInsuredCalculator />}
      {tab === "grouphealth" && <GroupHealthEstimator />}
      {tab === "assetcover" && <AssetCoverCalculator />}
      {tab === "tradecredit" && <TradeCreditEstimator />}
      {tab === "claims" && <ClaimsTracker />}
      {tab === "premvscover" && <PremiumVsCover />}
      {tab === "keyman" && <KeyManEstimator />}
      {tab === "riskscore" && <RiskScorecard />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared types & helpers
// ─────────────────────────────────────────────────────────────────────────────
const POLICY_TYPES = [
  "Fire & Allied Perils", "Burglary / Theft", "Marine / Transit", "Public Liability",
  "Product Liability", "Professional Indemnity", "Directors & Officers", "Cyber",
  "Group Health (Mediclaim)", "Group Term Life", "Personal Accident",
  "Business Interruption", "Trade-Credit", "Key-Man", "Motor (Commercial)",
  "Equipment Breakdown", "Other",
] as const;
type PolicyType = typeof POLICY_TYPES[number];

interface Policy {
  id: string;
  insurer: string;
  type: PolicyType;
  policyNo: string;
  sumInsured: number;
  premium: number; // annual, incl. GST
  startDate: string;
  renewalDate: string;
}

function daysToRenewal(p: Policy, today: Date): number | null {
  if (!p.renewalDate) return null;
  try { return differenceInCalendarDays(parseISO(p.renewalDate), today); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────
function Overview({ onPick }: { onPick: (t: Tab) => void }) {
  const { store } = useApp();
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const today = new Date();

  const totalSum = policies.reduce((s, p) => s + p.sumInsured, 0);
  const totalPremium = policies.reduce((s, p) => s + p.premium, 0);
  const annualRevenue = store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const premiumPctRevenue = annualRevenue > 0 ? (totalPremium / annualRevenue) * 100 : 0;
  const renewingSoon = policies.filter(p => {
    const d = daysToRenewal(p, today);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const cards = [
    { label: "Active Policies", value: `${policies.length}`, color: "text-[var(--color-text)]", sub: `${renewingSoon} renewing in 30 days` },
    { label: "Total Sum Insured", value: policies.length ? formatAmount(totalSum) : "—", color: "text-blue-400", sub: "Aggregate cover across policies" },
    { label: "Annual Premium", value: policies.length ? formatAmount(totalPremium) : "—", color: "text-orange-400", sub: "Incl. 18% GST on premium" },
    { label: "Premium / Revenue", value: annualRevenue > 0 && policies.length ? `${premiumPctRevenue.toFixed(2)}%` : "—", color: premiumPctRevenue > 3 ? "text-yellow-400" : "text-green-400", sub: "SMB benchmark 1–3% of turnover" },
  ];

  const tools: { id: Tab; title: string; desc: string }[] = [
    { id: "register", title: "Policy Register & Renewals", desc: "One vault for every policy with renewal countdowns and lapse alerts." },
    { id: "gaps", title: "Coverage-Gap Analyzer", desc: "Find risks on your books — assets, staff, debtors — with no matching cover." },
    { id: "suminsured", title: "Sum-Insured Calculator", desc: "Size cover from turnover, assets and inventory so you aren't under-insured." },
    { id: "grouphealth", title: "Group-Health Estimator", desc: "Indicative mediclaim premium for your team, priced by age band and cover." },
    { id: "assetcover", title: "Business-Asset Cover", desc: "Build a fire/burglary schedule from your asset register at reinstatement value." },
    { id: "tradecredit", title: "Trade-Credit / Receivables", desc: "Estimate trade-credit premium to insure debtors against buyer default." },
    { id: "claims", title: "Claims Tracker", desc: "Log every claim from intimation to settlement and watch your claims ratio." },
    { id: "premvscover", title: "Premium vs Cover", desc: "Compare quotes on rate-on-line and model how deductibles move premium." },
    { id: "keyman", title: "Key-Man Insurance", desc: "Size cover on a founder/key employee from their contribution to profit." },
    { id: "riskscore", title: "Risk-Exposure Scorecard", desc: "A 0–100 protection score from cover breadth, concentration and renewals." },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1">Protect the business, not just the books</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Most Indian SMBs are silently under-insured — a single fire, a defaulting buyer or a key person leaving can wipe out years of profit.
          These tools help you size the right cover, track every policy and avoid overpaying. Figures are indicative; bind cover only through an IRDAI-licensed insurer or broker.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {tools.map(t => (
            <button key={t.id} onClick={() => onPick(t.id)}
              className="text-left bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-primary)]/40 transition-colors">
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Policy Register & Renewal Tracker
// ─────────────────────────────────────────────────────────────────────────────
function PolicyRegister() {
  const [policies, setPolicies] = useFeatureState<Policy[]>("ins-policies", []);
  const today = new Date();

  const [insurer, setInsurer] = useState("");
  const [type, setType] = useState<PolicyType>(POLICY_TYPES[0]);
  const [policyNo, setPolicyNo] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [premium, setPremium] = useState("");
  const [startDate, setStartDate] = useState(() => today.toISOString().split("T")[0]);
  const [renewalDate, setRenewalDate] = useState("");

  const add = () => {
    const si = parseFloat(sumInsured) || 0;
    const pr = parseFloat(premium) || 0;
    if (!insurer.trim() || si <= 0) { toast.error("Enter an insurer and a sum insured"); return; }
    setPolicies([...policies, {
      id: crypto.randomUUID(), insurer: insurer.trim(), type, policyNo: policyNo.trim(),
      sumInsured: si, premium: pr, startDate, renewalDate,
    }]);
    setInsurer(""); setPolicyNo(""); setSumInsured(""); setPremium(""); setRenewalDate("");
    toast.success("Policy added to register");
  };

  const sorted = useMemo(() => [...policies].sort((a, b) => {
    const da = daysToRenewal(a, today) ?? 9999;
    const db = daysToRenewal(b, today) ?? 9999;
    return da - db;
  }), [policies, today]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Policy Register</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Insurer</label>
            <input value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="e.g. ICICI Lombard" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as PolicyType)} className={INP}>
              {POLICY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Policy no.</label>
            <input value={policyNo} onChange={e => setPolicyNo(e.target.value)} placeholder="optional" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sum insured (₹)</label>
            <input type="number" value={sumInsured} onChange={e => setSumInsured(e.target.value)} placeholder="5000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual premium (₹, incl. GST)</label>
            <input type="number" value={premium} onChange={e => setPremium(e.target.value)} placeholder="60000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Start date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Renewal date</label>
            <input type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {policies.length === 0 ? (
        <div className={`${CARD} border-dashed p-10 text-center`}>
          <Wallet size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">No policies yet</p>
          <p className="text-xs text-[var(--color-muted)]">Add your fire, health, liability and motor policies to track renewals in one place.</p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Insurer", "Type", "Policy No.", "Sum Insured", "Premium", "Renewal", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sorted.map(p => {
                  const d = daysToRenewal(p, today);
                  const lapsed = d !== null && d < 0;
                  const urgent = d !== null && d >= 0 && d <= 30;
                  return (
                    <tr key={p.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{p.insurer}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{p.type}</td>
                      <td className="px-3 py-2.5 text-xs">{p.policyNo || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAmount(p.sumInsured)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-orange-400">{p.premium > 0 ? formatAmount(p.premium) : "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{p.renewalDate ? format(parseISO(p.renewalDate), "d MMM yyyy") : "—"}</td>
                      <td className="px-3 py-2.5">
                        {d === null ? <span className="text-xs text-[var(--color-muted)]">No date</span>
                          : lapsed ? <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><AlertTriangle size={11} /> Lapsed {Math.abs(d)}d</span>
                          : urgent ? <span className="inline-flex items-center gap-1 text-xs text-yellow-400 font-semibold"><CalendarClock size={11} /> {d}d left</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={11} /> {d}d left</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => setPolicies(policies.filter(x => x.id !== p.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A lapsed policy means no cover — most insurers allow a 15–30 day grace window for renewal but a fresh policy may need re-underwriting. Premiums on business covers usually attract 18% GST, which is ITC-eligible if used for business.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Coverage-Gap Analyzer
// ─────────────────────────────────────────────────────────────────────────────
function CoverageGapAnalyzer() {
  const { store } = useApp();
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const held = new Set(policies.map(p => p.type));

  const annualRevenue = store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const hasPayroll = store.transactions.some(t => t.category === "payroll");
  const receivables = (store.invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + (i.amount ?? 0), 0);

  const checks: { type: PolicyType; label: string; reason: string; applies: boolean; severity: "high" | "med" }[] = [
    { type: "Fire & Allied Perils", label: "Fire & property cover", reason: "Premises, plant and stock exposed to fire/flood", applies: true, severity: "high" },
    { type: "Burglary / Theft", label: "Burglary / theft cover", reason: "Cash and inventory on premises", applies: true, severity: "med" },
    { type: "Public Liability", label: "Public liability", reason: "Third-party injury/damage at your premises", applies: true, severity: "med" },
    { type: "Group Health (Mediclaim)", label: "Group health", reason: "Payroll detected — staff without medical cover", applies: hasPayroll, severity: "high" },
    { type: "Personal Accident", label: "Personal accident", reason: "No PA cover for staff / workers", applies: hasPayroll, severity: "med" },
    { type: "Trade-Credit", label: "Trade-credit cover", reason: `${formatAmount(receivables)} in open receivables at default risk`, applies: receivables > 0, severity: receivables > annualRevenue * 0.25 ? "high" : "med" },
    { type: "Business Interruption", label: "Business interruption", reason: "Lost profit during a forced shutdown", applies: annualRevenue > 0, severity: "med" },
    { type: "Cyber", label: "Cyber & data-breach", reason: "DPDP liability and ransomware exposure", applies: true, severity: "med" },
  ];

  const gaps = checks.filter(c => c.applies && !held.has(c.type));
  const covered = checks.filter(c => c.applies && held.has(c.type));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Risks evaluated", value: `${checks.filter(c => c.applies).length}`, color: "text-[var(--color-text)]" },
          { label: "Covered", value: `${covered.length}`, color: "text-green-400" },
          { label: "Open gaps", value: `${gaps.length}`, color: gaps.length > 0 ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileWarning size={14} className="text-[var(--color-primary)]" /> Coverage Gaps</h3>
        <p className="text-xs text-[var(--color-muted)] mb-3">Matched against the policies in your register, your payroll roster and open receivables.</p>
        {gaps.length === 0 ? (
          <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> No obvious gaps against the standard SMB cover set — review limits annually.</p>
        ) : (
          <div className="space-y-2">
            {gaps.map(g => (
              <div key={g.type} className={`flex items-start gap-3 rounded-lg p-3 border ${g.severity === "high" ? "border-red-800/40 bg-red-950/20" : "border-yellow-800/40 bg-yellow-950/20"}`}>
                <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${g.severity === "high" ? "text-red-400" : "text-yellow-400"}`} />
                <div>
                  <p className="text-sm font-medium">{g.label} <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${g.severity === "high" ? "bg-red-900/40 text-red-300" : "bg-yellow-900/40 text-yellow-300"}`}>{g.severity === "high" ? "HIGH" : "MEDIUM"}</span></p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{g.reason}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {covered.length > 0 && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm font-semibold mb-2">Already covered</p>
          <div className="flex flex-wrap gap-2">
            {covered.map(c => (
              <span key={c.type} className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-950/20 border border-green-800/30 rounded-full px-2.5 py-1">
                <CheckCircle2 size={11} /> {c.label}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Heuristic gap scan based on common SMB exposures — not a substitute for a broker's risk survey. Add policies in the register to clear gaps.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sum-Insured Calculator
// ─────────────────────────────────────────────────────────────────────────────
function SumInsuredCalculator() {
  const { store } = useApp();
  const autoRevenue = Math.round(store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0));

  const [building, setBuilding] = useState("");
  const [plant, setPlant] = useState("");
  const [stock, setStock] = useState("");
  const [furniture, setFurniture] = useState("");
  const [turnover, setTurnover] = useState("");
  const [grossMarginPct, setGrossMarginPct] = useState("35");
  const [indemnityMonths, setIndemnityMonths] = useState("6");

  const b = parseFloat(building) || 0;
  const p = parseFloat(plant) || 0;
  const s = parseFloat(stock) || 0;
  const f = parseFloat(furniture) || 0;
  const t = parseFloat(turnover) || autoRevenue;
  const gm = parseFloat(grossMarginPct) || 0;
  const months = Math.max(1, parseFloat(indemnityMonths) || 6);

  const assetSI = b + p + s + f;
  // Business interruption sum insured = gross profit for the chosen indemnity period.
  const grossProfit = t * (gm / 100);
  const biSI = Math.round(grossProfit * (months / 12));
  const recommended = assetSI + biSI;

  const rows = [
    { label: "Building (reinstatement value)", value: b },
    { label: "Plant & machinery", value: p },
    { label: "Stock / inventory", value: s },
    { label: "Furniture, fittings & equipment", value: f },
    { label: `Business interruption (${months}-mo gross profit)`, value: biSI },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Sum-Insured Calculator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Insure assets at reinstatement (replacement) value, not book value — under-insurance triggers the average clause and slashes any claim payout.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Building (₹)</label>
            <input type="number" value={building} onChange={e => setBuilding(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Plant & machinery (₹)</label>
            <input type="number" value={plant} onChange={e => setPlant(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stock / inventory (₹)</label>
            <input type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Furniture & equipment (₹)</label>
            <input type="number" value={furniture} onChange={e => setFurniture(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual turnover (₹){autoRevenue > 0 ? " · auto" : ""}</label>
            <input type="number" value={turnover} onChange={e => setTurnover(e.target.value)} placeholder={autoRevenue > 0 ? String(autoRevenue) : "10000000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross margin %</label>
            <input type="number" value={grossMarginPct} onChange={e => setGrossMarginPct(e.target.value)} placeholder="35" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">BI indemnity period (months)</label>
            <input type="number" value={indemnityMonths} onChange={e => setIndemnityMonths(e.target.value)} placeholder="6" className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Recommended Sum Insured</p>
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
              <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
              <span className="tabular-nums">{formatCurrency(Math.round(r.value))}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]">
          <span className="text-sm font-semibold">Total recommended cover</span>
          <span className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(recommended))}</span>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Assets shown at the value you enter — use replacement cost. Business-interruption cover is set as gross profit for the indemnity period you can realistically take to recover. Stock floaters can be declaration-based if levels swing seasonally.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Group-Health Premium Estimator
// ─────────────────────────────────────────────────────────────────────────────
type AgeBand = "u30" | "30to45" | "45to60" | "o60";
const AGE_FACTOR: Record<AgeBand, number> = { u30: 0.7, "30to45": 1.0, "45to60": 1.6, o60: 2.6 };
const AGE_LABEL: Record<AgeBand, string> = { u30: "Under 30", "30to45": "30–45", "45to60": "45–60", o60: "Over 60" };

function GroupHealthEstimator() {
  const [heads, setHeads] = useState<Record<AgeBand, string>>({ u30: "", "30to45": "", "45to60": "", o60: "" });
  const [coverPerHead, setCoverPerHead] = useState("300000");
  const [familyFloater, setFamilyFloater] = useState(true);
  const [maternity, setMaternity] = useState(false);

  const cover = parseFloat(coverPerHead) || 0;
  // Base rate-on-line ~ 3% of sum insured per ₹1L of cover band, scaled. Indicative only.
  const baseRatePer1L = 1100; // ₹ base annual premium per ₹1L SI for a 30–45 life
  const counts = (Object.keys(AGE_FACTOR) as AgeBand[]).map(band => ({ band, n: parseInt(heads[band]) || 0 }));
  const totalHeads = counts.reduce((sum, c) => sum + c.n, 0);

  const result = useMemo(() => {
    if (totalHeads === 0 || cover <= 0) return null;
    const per1L = cover / 100000;
    let basePremium = 0;
    counts.forEach(({ band, n }) => { basePremium += n * per1L * baseRatePer1L * AGE_FACTOR[band]; });
    const floaterLoad = familyFloater ? 1.45 : 1.0; // covering dependents adds ~45%
    const maternityLoad = maternity ? 1.12 : 1.0;
    const netPremium = basePremium * floaterLoad * maternityLoad;
    const gst = netPremium * 0.18;
    const gross = netPremium + gst;
    return { netPremium, gst, gross, perHead: gross / totalHeads };
  }, [counts, totalHeads, cover, familyFloater, maternity]);

  const set = (band: AgeBand, v: string) => setHeads(h => ({ ...h, [band]: v }));

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><HeartPulse size={14} className="text-[var(--color-primary)]" /> Group-Health Premium Estimator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Indicative annual mediclaim premium by age band. Group cover is available for teams as small as two.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {(Object.keys(AGE_FACTOR) as AgeBand[]).map(band => (
            <div key={band}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{AGE_LABEL[band]}</label>
              <input type="number" min={0} value={heads[band]} onChange={e => set(band, e.target.value)} placeholder="0" className={INP} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cover per head (₹ SI)</label>
            <input type="number" value={coverPerHead} onChange={e => setCoverPerHead(e.target.value)} placeholder="300000" className={INP} />
          </div>
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={familyFloater} onChange={e => setFamilyFloater(e.target.checked)} className="accent-[var(--color-primary)]" />
              Family floater (covers dependents)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={maternity} onChange={e => setMaternity(e.target.checked)} className="accent-[var(--color-primary)]" />
              Maternity benefit rider
            </label>
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter at least one head count and a cover amount to estimate the premium.</p>
      ) : (
        <div className={`${CARD} p-5`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Lives covered", value: `${totalHeads}`, color: "text-[var(--color-text)]" },
              { label: "Net premium", value: formatAmount(Math.round(result.netPremium)), color: "text-[var(--color-text)]" },
              { label: "GST (18%)", value: formatAmount(Math.round(result.gst)), color: "text-yellow-400" },
              { label: "Gross annual premium", value: formatAmount(Math.round(result.gross)), color: "text-orange-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <p className="text-sm mt-3">Roughly <strong className="text-[var(--color-primary)]">{formatCurrency(Math.round(result.perHead))}</strong> per life per year, all-in.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Indicative model only — actual group-mediclaim pricing depends on claims experience, room-rent caps, co-pay, network and insurer. GST on health insurance premium is 18%. Bind through an IRDAI-licensed insurer/broker.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Business-Asset Cover Calculator (fire/burglary schedule)
// ─────────────────────────────────────────────────────────────────────────────
interface AssetItem { id: string; name: string; value: number; perilRate: number }
function AssetCoverCalculator() {
  const [items, setItems] = useFeatureState<AssetItem[]>("ins-asset-schedule", []);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [perilRate, setPerilRate] = useState("0.5"); // rate-on-line per ₹100 of SI, in ‰ terms below

  const add = () => {
    const v = parseFloat(value) || 0;
    const r = parseFloat(perilRate) || 0;
    if (!name.trim() || v <= 0) { toast.error("Enter an asset name and value"); return; }
    setItems([...items, { id: crypto.randomUUID(), name: name.trim(), value: v, perilRate: r }]);
    setName(""); setValue("");
  };

  const totalSI = items.reduce((s, i) => s + i.value, 0);
  // perilRate entered as % of sum insured (per annum). Premium = SI * rate%.
  const netPremium = items.reduce((s, i) => s + i.value * (i.perilRate / 100), 0);
  const gst = netPremium * 0.18;
  const gross = netPremium + gst;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Business-Asset Cover Schedule</h3>
        <p className="text-xs text-[var(--color-muted)]">Build a fire/burglary schedule line by line. Enter a rate (% of sum insured per year) — typical fire rates are 0.05–0.75% depending on occupancy.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Asset / category</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Factory shed, CNC machine" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sum insured (₹)</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="2000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (% p.a.)</label>
            <input type="number" step="0.01" value={perilRate} onChange={e => setPerilRate(e.target.value)} placeholder="0.5" className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Add line
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add assets to build the cover schedule and estimate the fire/burglary premium.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total sum insured", value: formatAmount(Math.round(totalSI)), color: "text-blue-400" },
              { label: "Net premium", value: formatAmount(Math.round(netPremium)), color: "text-[var(--color-text)]" },
              { label: "GST (18%)", value: formatAmount(Math.round(gst)), color: "text-yellow-400" },
              { label: "Gross premium", value: formatAmount(Math.round(gross)), color: "text-orange-400" },
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
                  <tr>{["Asset", "Sum Insured", "Rate", "Annual Premium", ""].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {items.map(i => (
                    <tr key={i.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{i.name}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAmount(i.value)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{i.perilRate}%</td>
                      <td className="px-3 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(i.value * (i.perilRate / 100)))}</td>
                      <td className="px-3 py-2.5 text-right">
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
      <p className="text-[10px] text-[var(--color-muted)]">Rates are illustrative — actual fire/burglary rates are set by the insurer on occupancy, fire-fighting arrangements and claims history. Insure at reinstatement value to avoid the average (under-insurance) clause.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Trade-Credit / Receivables Cover Estimator
// ─────────────────────────────────────────────────────────────────────────────
function TradeCreditEstimator() {
  const { store } = useApp();
  const openReceivables = Math.round((store.invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + (i.amount ?? 0), 0));

  const [insuredTurnover, setInsuredTurnover] = useState("");
  const [avgRatePerMille, setAvgRatePerMille] = useState("3.5"); // ‰ of insured turnover
  const [coverPct, setCoverPct] = useState("85"); // % of each invoice covered
  const [topBuyerExposure, setTopBuyerExposure] = useState("");

  const turnover = parseFloat(insuredTurnover) || openReceivables;
  const rate = parseFloat(avgRatePerMille) || 0;
  const cov = parseFloat(coverPct) || 0;
  const topBuyer = parseFloat(topBuyerExposure) || 0;

  const netPremium = turnover * (rate / 1000);
  const gst = netPremium * 0.18;
  const gross = netPremium + gst;
  const maxIndemnity = turnover * (cov / 100);
  const concentrationPct = turnover > 0 ? (topBuyer / turnover) * 100 : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Trade-Credit Cover Estimator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Trade-credit insurance protects receivables against buyer default/insolvency. Premium is a rate (‰) on insured credit sales.
          {openReceivables > 0 ? ` Your open receivables: ${formatCurrency(openReceivables)}.` : ""}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Insured credit turnover (₹){openReceivables > 0 ? " · auto" : ""}</label>
            <input type="number" value={insuredTurnover} onChange={e => setInsuredTurnover(e.target.value)} placeholder={openReceivables > 0 ? String(openReceivables) : "20000000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (‰ of turnover)</label>
            <input type="number" step="0.1" value={avgRatePerMille} onChange={e => setAvgRatePerMille(e.target.value)} placeholder="3.5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cover % per invoice</label>
            <input type="number" value={coverPct} onChange={e => setCoverPct(e.target.value)} placeholder="85" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Largest single buyer exposure (₹)</label>
            <input type="number" value={topBuyerExposure} onChange={e => setTopBuyerExposure(e.target.value)} placeholder="optional" className={INP} />
          </div>
        </div>
      </div>

      {turnover > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Net premium", value: formatAmount(Math.round(netPremium)), color: "text-[var(--color-text)]" },
              { label: "GST (18%)", value: formatAmount(Math.round(gst)), color: "text-yellow-400" },
              { label: "Gross premium", value: formatAmount(Math.round(gross)), color: "text-orange-400" },
              { label: "Max indemnity", value: formatAmount(Math.round(maxIndemnity)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {topBuyer > 0 && (
            <div className={`rounded-lg p-4 border ${concentrationPct > 25 ? "border-red-800/40 bg-red-950/20" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
              <p className={`text-sm font-medium flex items-center gap-2 ${concentrationPct > 25 ? "text-red-400" : "text-[var(--color-text)]"}`}>
                {concentrationPct > 25 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} className="text-green-400" />}
                Your largest buyer is {concentrationPct.toFixed(1)}% of insured turnover.
                {concentrationPct > 25 ? " High concentration — a single default could be severe; consider a per-buyer credit limit." : " Concentration looks manageable."}
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Trade-credit pricing depends on your buyer ledger quality, sector and historic bad-debt rate; insurers set per-buyer credit limits after assessing each debtor. Figures here are indicative — get a formal quote from an IRDAI-licensed credit insurer.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Claims Tracker
// ─────────────────────────────────────────────────────────────────────────────
type ClaimStatus = "intimated" | "surveyor" | "documents" | "approved" | "settled" | "rejected";
const CLAIM_STATUS: { id: ClaimStatus; label: string; color: string }[] = [
  { id: "intimated", label: "Intimated", color: "text-blue-400 bg-blue-950/30 border-blue-800/30" },
  { id: "surveyor", label: "Surveyor", color: "text-purple-400 bg-purple-950/30 border-purple-800/30" },
  { id: "documents", label: "Documents", color: "text-yellow-400 bg-yellow-950/30 border-yellow-800/30" },
  { id: "approved", label: "Approved", color: "text-green-400 bg-green-950/30 border-green-800/30" },
  { id: "settled", label: "Settled", color: "text-green-400 bg-green-950/30 border-green-800/30" },
  { id: "rejected", label: "Rejected", color: "text-red-400 bg-red-950/30 border-red-800/30" },
];
interface Claim { id: string; insurer: string; type: string; claimAmount: number; settledAmount: number; status: ClaimStatus; date: string }

function ClaimsTracker() {
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const [claims, setClaims] = useFeatureState<Claim[]>("ins-claims", []);
  const [insurer, setInsurer] = useState("");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!insurer.trim() || amt <= 0) { toast.error("Enter insurer and claim amount"); return; }
    setClaims([...claims, { id: crypto.randomUUID(), insurer: insurer.trim(), type: type.trim() || "General", claimAmount: amt, settledAmount: 0, status: "intimated", date }]);
    setInsurer(""); setType(""); setAmount("");
    toast.success("Claim logged");
  };

  const setStatus = (id: string, status: ClaimStatus) =>
    setClaims(claims.map(c => c.id === id ? { ...c, status, settledAmount: status === "settled" ? (c.settledAmount || c.claimAmount) : c.settledAmount } : c));
  const setSettled = (id: string, v: number) => setClaims(claims.map(c => c.id === id ? { ...c, settledAmount: v } : c));

  const totalClaimed = claims.reduce((s, c) => s + c.claimAmount, 0);
  const totalSettled = claims.reduce((s, c) => s + c.settledAmount, 0);
  const totalPremium = policies.reduce((s, p) => s + p.premium, 0);
  const claimsRatio = totalPremium > 0 ? (totalSettled / totalPremium) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Claims Tracker</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Insurer</label>
            <input value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="Insurer" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Claim type / peril</label>
            <input value={type} onChange={e => setType(e.target.value)} placeholder="Fire, theft…" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Claim amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Log
          </button>
        </div>
      </div>

      {claims.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Claims logged", value: `${claims.length}`, color: "text-[var(--color-text)]" },
            { label: "Total claimed", value: formatAmount(Math.round(totalClaimed)), color: "text-[var(--color-text)]" },
            { label: "Total settled", value: formatAmount(Math.round(totalSettled)), color: "text-green-400" },
            { label: "Claims-to-premium", value: totalPremium > 0 ? `${claimsRatio.toFixed(0)}%` : "—", color: claimsRatio > 100 ? "text-red-400" : "text-green-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {claims.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No claims logged. Track each claim through its lifecycle and monitor your claims-to-premium ratio (low ratio = stronger renewal bargaining).</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Insurer", "Type", "Date", "Claimed", "Settled", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {claims.map(c => {
                  const sc = CLAIM_STATUS.find(s => s.id === c.status)!;
                  return (
                    <tr key={c.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{c.insurer}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{c.type}</td>
                      <td className="px-3 py-2.5 text-xs">{c.date}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAmount(c.claimAmount)}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" value={c.settledAmount || ""} onChange={e => setSettled(c.id, parseFloat(e.target.value) || 0)}
                          placeholder="0" className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs tabular-nums outline-none focus:border-[var(--color-primary)]" />
                      </td>
                      <td className="px-3 py-2.5">
                        <select value={c.status} onChange={e => setStatus(c.id, e.target.value as ClaimStatus)}
                          className={`text-[10px] px-1.5 py-1 rounded border font-medium bg-transparent ${sc.color}`}>
                          {CLAIM_STATUS.map(s => <option key={s.id} value={s.id} className="bg-[var(--color-surface)] text-[var(--color-text)]">{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => setClaims(claims.filter(x => x.id !== c.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Intimate claims promptly (most policies require notice within 7 days). Keep geo-tagged photos, the FIR (for theft) and invoices. A wrongly rejected claim can be escalated to the Insurance Ombudsman.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Premium vs Cover Comparison (rate-on-line + deductible tuner)
// ─────────────────────────────────────────────────────────────────────────────
interface Quote { id: string; insurer: string; sumInsured: number; premium: number; deductible: number }
function PremiumVsCover() {
  const [quotes, setQuotes] = useFeatureState<Quote[]>("ins-quotes", []);
  const [insurer, setInsurer] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [premium, setPremium] = useState("");
  const [deductible, setDeductible] = useState("0");

  const add = () => {
    const si = parseFloat(sumInsured) || 0;
    const pr = parseFloat(premium) || 0;
    if (!insurer.trim() || si <= 0 || pr <= 0) { toast.error("Enter insurer, sum insured and premium"); return; }
    setQuotes([...quotes, { id: crypto.randomUUID(), insurer: insurer.trim(), sumInsured: si, premium: pr, deductible: parseFloat(deductible) || 0 }]);
    setInsurer(""); setSumInsured(""); setPremium("");
    toast.success("Quote added");
  };

  const evaluated = quotes.map(q => ({
    ...q,
    rol: q.sumInsured > 0 ? (q.premium / q.sumInsured) * 100 : 0, // rate-on-line %
    netExposureCost: q.premium + q.deductible, // premium + first-loss you carry
  }));
  const best = evaluated.length ? evaluated.reduce((a, b) => (b.rol < a.rol ? b : a)) : null;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Premium vs Cover Comparison</h3>
        <p className="text-xs text-[var(--color-muted)]">Compare quotes on rate-on-line (premium ÷ sum insured). A higher deductible cuts premium but raises the loss you self-carry.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Insurer</label>
            <input value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="Insurer" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sum insured (₹)</label>
            <input type="number" value={sumInsured} onChange={e => setSumInsured(e.target.value)} placeholder="5000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual premium (₹)</label>
            <input type="number" value={premium} onChange={e => setPremium(e.target.value)} placeholder="40000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deductible (₹)</label>
            <input type="number" value={deductible} onChange={e => setDeductible(e.target.value)} placeholder="0" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add two or more quotes to rank them by rate-on-line.</p>
      ) : (
        <>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Insurer", "Sum Insured", "Premium", "Deductible", "Rate-on-Line", "Premium + Deductible", ""].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {evaluated.map(q => (
                    <tr key={q.id} className={`hover:bg-white/2 ${best && q.id === best.id ? "bg-green-950/20" : ""}`}>
                      <td className="px-3 py-2.5 font-medium">{q.insurer}{best && q.id === best.id && <span className="ml-1.5 text-[9px] text-green-400 font-semibold">BEST</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAmount(q.sumInsured)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-orange-400">{formatAmount(q.premium)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{q.deductible > 0 ? formatAmount(q.deductible) : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{q.rol.toFixed(3)}%</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAmount(Math.round(q.netExposureCost))}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => setQuotes(quotes.filter(x => x.id !== q.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {best && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm font-bold text-green-400 flex items-center gap-2">
                <TrendingDown size={14} /> {best.insurer} has the lowest rate-on-line ({best.rol.toFixed(3)}% of sum insured) — the cheapest cover per rupee of protection. Check sub-limits, exclusions and claim-settlement ratio before binding.
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rate-on-line is the cleanest like-for-like comparison, but the cheapest premium is not always best value — weigh sub-limits, exclusions, room-rent/co-pay (health) and the insurer's claim-settlement ratio.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Key-Man Insurance Estimator
// ─────────────────────────────────────────────────────────────────────────────
function KeyManEstimator() {
  const [name, setName] = useState("");
  const [method, setMethod] = useState<"profit" | "salary" | "loan">("profit");
  const [annualProfit, setAnnualProfit] = useState("");
  const [contributionPct, setContributionPct] = useState("40");
  const [yearsToReplace, setYearsToReplace] = useState("3");
  const [annualSalary, setAnnualSalary] = useState("");
  const [salaryMultiple, setSalaryMultiple] = useState("5");
  const [loanOutstanding, setLoanOutstanding] = useState("");

  const profit = parseFloat(annualProfit) || 0;
  const contrib = parseFloat(contributionPct) || 0;
  const years = parseFloat(yearsToReplace) || 0;
  const salary = parseFloat(annualSalary) || 0;
  const mult = parseFloat(salaryMultiple) || 0;
  const loan = parseFloat(loanOutstanding) || 0;

  const recommended =
    method === "profit" ? profit * (contrib / 100) * years
    : method === "salary" ? salary * mult
    : loan;

  // Indicative term-life premium: ~₹1,200 per ₹1 crore per year of age-loaded base. Use a flat illustrative rate.
  const premiumRatePer1Cr = 35000; // illustrative annual premium per ₹1 crore SA for a healthy mid-40s life
  const netPremium = (recommended / 1_00_00_000) * premiumRatePer1Cr;
  const gst = netPremium * 0.18;
  const gross = netPremium + gst;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><UserCheck size={14} className="text-[var(--color-primary)]" /> Key-Man Insurance Estimator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Key-man (key-person) cover compensates the business for financial loss if a founder or critical employee dies or is incapacitated. Premium is paid by the company; the company is the beneficiary.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Key person</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Founder / Head of Sales" className={INP} />
          </div>
        </div>
        <div className="flex gap-2 mb-3">
          {([["profit", "Profit contribution"], ["salary", "Salary multiple"], ["loan", "Loan protection"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setMethod(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${method === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        {method === "profit" && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Annual net profit (₹)</label>
              <input type="number" value={annualProfit} onChange={e => setAnnualProfit(e.target.value)} placeholder="5000000" className={INP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Their contribution %</label>
              <input type="number" value={contributionPct} onChange={e => setContributionPct(e.target.value)} placeholder="40" className={INP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Years to replace</label>
              <input type="number" value={yearsToReplace} onChange={e => setYearsToReplace(e.target.value)} placeholder="3" className={INP} />
            </div>
          </div>
        )}
        {method === "salary" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Annual compensation (₹)</label>
              <input type="number" value={annualSalary} onChange={e => setAnnualSalary(e.target.value)} placeholder="2400000" className={INP} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Multiple (×)</label>
              <input type="number" value={salaryMultiple} onChange={e => setSalaryMultiple(e.target.value)} placeholder="5" className={INP} />
            </div>
          </div>
        )}
        {method === "loan" && (
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Business loan outstanding to protect (₹)</label>
            <input type="number" value={loanOutstanding} onChange={e => setLoanOutstanding(e.target.value)} placeholder="8000000" className={INP} />
          </div>
        )}
      </div>

      {recommended > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Recommended sum assured", value: formatAmount(Math.round(recommended)), color: "text-[var(--color-primary)]" },
              { label: "Indicative net premium / yr", value: formatAmount(Math.round(netPremium)), color: "text-[var(--color-text)]" },
              { label: "Gross premium (incl. 18% GST)", value: formatAmount(Math.round(gross)), color: "text-orange-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <p className="text-sm mt-3">Cover on <strong>{name || "the key person"}</strong> of about <strong className="text-[var(--color-primary)]">{formatCurrency(Math.round(recommended))}</strong>.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Premium shown is illustrative; actual term-life pricing depends on age, health and sum assured. Key-man premium is generally a deductible business expense and the payout is taxable as business income — confirm treatment with your CA.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Risk-Exposure Scorecard
// ─────────────────────────────────────────────────────────────────────────────
function RiskScorecard() {
  const { store } = useApp();
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const [claims] = useFeatureState<Claim[]>("ins-claims", []);
  const today = new Date();

  const held = new Set(policies.map(p => p.type));
  const coreCovers: PolicyType[] = ["Fire & Allied Perils", "Public Liability", "Group Health (Mediclaim)", "Business Interruption"];
  const coreHeld = coreCovers.filter(c => held.has(c)).length;

  const hasPayroll = store.transactions.some(t => t.category === "payroll");
  const receivables = (store.invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const annualRevenue = store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const lapsed = policies.filter(p => { const d = daysToRenewal(p, today); return d !== null && d < 0; }).length;
  const renewingSoon = policies.filter(p => { const d = daysToRenewal(p, today); return d !== null && d >= 0 && d <= 30; }).length;
  const openClaims = claims.filter(c => c.status !== "settled" && c.status !== "rejected").length;

  // Score components (0–100, higher = better protected)
  const coverScore = (coreHeld / coreCovers.length) * 40; // up to 40
  const healthScore = !hasPayroll ? 15 : held.has("Group Health (Mediclaim)") ? 15 : 0; // up to 15
  const creditScore = receivables === 0 ? 15 : held.has("Trade-Credit") ? 15 : receivables > annualRevenue * 0.25 ? 0 : 7; // up to 15
  const lapsePenalty = Math.min(20, lapsed * 10); // -10 each
  const freshnessScore = 20 - lapsePenalty; // up to 20
  const renewalScore = renewingSoon > 0 ? 7 : 10; // up to 10, small ding for imminent renewals
  const score = Math.max(0, Math.min(100, Math.round(coverScore + healthScore + creditScore + freshnessScore + renewalScore)));

  const band = score >= 75 ? { label: "Well protected", color: "text-green-400", bar: "#22c55e" }
    : score >= 50 ? { label: "Partially protected", color: "text-yellow-400", bar: "#eab308" }
    : { label: "Under-protected", color: "text-red-400", bar: "#ef4444" };

  const breakdown = [
    { label: "Core covers held", detail: `${coreHeld}/${coreCovers.length} of fire, liability, health, BI`, pts: Math.round(coverScore), max: 40 },
    { label: "Employee health", detail: !hasPayroll ? "No payroll detected" : held.has("Group Health (Mediclaim)") ? "Group health in place" : "Payroll staff uncovered", pts: Math.round(healthScore), max: 15 },
    { label: "Receivables protection", detail: receivables === 0 ? "No open receivables" : held.has("Trade-Credit") ? "Trade-credit cover in place" : `${formatAmount(receivables)} exposed`, pts: Math.round(creditScore), max: 15 },
    { label: "No lapsed policies", detail: lapsed > 0 ? `${lapsed} policy(ies) lapsed` : "All policies active", pts: Math.round(freshnessScore), max: 20 },
    { label: "Renewal hygiene", detail: renewingSoon > 0 ? `${renewingSoon} renewing within 30 days` : "Nothing imminent", pts: Math.round(renewalScore), max: 10 },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-[var(--color-primary)]" />
            <div>
              <p className="text-sm font-semibold">Risk-Exposure Scorecard</p>
              <p className="text-xs text-[var(--color-muted)]">Protection score from cover breadth, concentration and renewal hygiene.</p>
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className={`text-3xl font-bold tabular-nums ${band.color}`}>{score}<span className="text-base text-[var(--color-muted)]">/100</span></p>
            <p className={`text-xs font-semibold ${band.color}`}>{band.label}</p>
          </div>
        </div>
        <div className="mt-4 w-full h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: band.bar }} />
        </div>
      </div>

      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-3">Score breakdown</p>
        <div className="space-y-3">
          {breakdown.map(b => (
            <div key={b.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{b.label}</span>
                <span className="tabular-nums text-[var(--color-muted)]">{b.pts}/{b.max}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${b.max > 0 ? (b.pts / b.max) * 100 : 0}%` }} />
                </div>
                <span className="text-[11px] text-[var(--color-muted)] w-1/2 truncate">{b.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {openClaims > 0 && (
        <div className="rounded-lg p-4 border border-blue-800/40 bg-blue-950/20">
          <p className="text-sm font-medium text-blue-300 flex items-center gap-2">
            <ShieldAlert size={14} /> {openClaims} open claim(s) in progress — keep documents current and follow up before the surveyor deadline.
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A heuristic protection score, not an actuarial risk rating. It rewards holding core covers, protecting staff and receivables, and keeping policies live. Add policies and claims in the other tabs to improve accuracy.</p>
    </div>
  );
}
