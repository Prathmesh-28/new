import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  ShieldCheck, Wallet, AlertTriangle, Calculator, HeartPulse, Building2,
  Landmark, FileWarning, GitCompareArrows, UserCheck, Gauge, Plus,
  CheckCircle2, CalendarClock, ShieldAlert, TrendingDown,
  CalendarDays, Trophy, Award, SlidersHorizontal, PauseCircle, Ship,
  Briefcase, Bug, Truck, HardHat, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

type Tab =
  | "overview" | "register" | "gaps" | "suminsured" | "grouphealth"
  | "assetcover" | "tradecredit" | "claims" | "premvscover" | "keyman" | "riskscore"
  | "duecal" | "csrcompare" | "ncbtracker" | "deductibleopt" | "bicover"
  | "marinecover" | "piestimator" | "cyberscore" | "fleettracker" | "wcestimator"
  | "premiumemi" | "itcchecker";

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
            ["duecal", "Premium Calendar", CalendarDays],
            ["csrcompare", "CSR Comparator", Trophy],
            ["ncbtracker", "No-Claim Bonus", Award],
            ["deductibleopt", "Deductible Optimizer", SlidersHorizontal],
            ["bicover", "Biz-Interruption", PauseCircle],
            ["marinecover", "Marine / Transit", Ship],
            ["piestimator", "Prof. Indemnity", Briefcase],
            ["cyberscore", "Cyber Need Score", Bug],
            ["fleettracker", "Fleet Insurance", Truck],
            ["wcestimator", "Workmen Comp", HardHat],
            ["premiumemi", "Premium EMI", Wallet],
            ["itcchecker", "GST ITC Checker", Receipt],
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
      {tab === "duecal" && <PremiumDueCalendar />}
      {tab === "csrcompare" && <CSRComparator />}
      {tab === "ncbtracker" && <NoClaimBonusTracker />}
      {tab === "deductibleopt" && <DeductibleOptimizer />}
      {tab === "bicover" && <BusinessInterruptionEstimator />}
      {tab === "marinecover" && <MarineTransitCalculator />}
      {tab === "piestimator" && <ProfessionalIndemnityEstimator />}
      {tab === "cyberscore" && <CyberInsuranceScorer />}
      {tab === "fleettracker" && <FleetInsuranceTracker />}
      {tab === "wcestimator" && <WorkmenCompEstimator />}
      {tab === "premiumemi" && <PremiumEMICalculator />}
      {tab === "itcchecker" && <GSTITCChecker />}
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

// ─────────────────────────────────────────────────────────────────────────────
// 11. Premium-Due Calendar (12-month view + renewal reminders)
// ─────────────────────────────────────────────────────────────────────────────
function PremiumDueCalendar() {
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const today = new Date();

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: format(d, "MMM yyyy"), year: d.getFullYear(), month: d.getMonth() };
  }), [today]);

  const withDates = policies.filter(p => p.renewalDate);
  const buckets = months.map(m => {
    const due = withDates.filter(p => {
      try { const r = parseISO(p.renewalDate); return r.getFullYear() === m.year && r.getMonth() === m.month; } catch { return false; }
    });
    return { ...m, due, total: due.reduce((s, p) => s + p.premium, 0) };
  });

  const next12Total = buckets.reduce((s, b) => s + b.total, 0);
  const maxMonth = Math.max(1, ...buckets.map(b => b.total));
  const undated = policies.length - withDates.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Renewals scheduled", value: `${withDates.length}`, color: "text-[var(--color-text)]", sub: undated > 0 ? `${undated} with no date` : "All dated" },
          { label: "Premium due (12 mo)", value: policies.length ? formatAmount(Math.round(next12Total)) : "—", color: "text-orange-400", sub: "Incl. GST already on policies" },
          { label: "Avg / month", value: policies.length ? formatAmount(Math.round(next12Total / 12)) : "—", color: "text-blue-400", sub: "Set aside to avoid lapse" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarDays size={14} className="text-[var(--color-primary)]" /> Premium-Due Calendar</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">A 12-month forward view of when each policy renews and the cash you need ready. Add renewal dates in the Policy Register to populate this.</p>
        {withDates.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No policies with renewal dates yet. Add them in the Policy Register.</p>
        ) : (
          <div className="space-y-2.5">
            {buckets.map(b => (
              <div key={b.key} className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-muted)] w-20 shrink-0">{b.label}</span>
                <div className="flex-1 h-6 bg-[var(--color-bg)] rounded-md overflow-hidden relative">
                  <div className="h-full rounded-md bg-[var(--color-primary)]/70 transition-all" style={{ width: `${(b.total / maxMonth) * 100}%` }} />
                  {b.due.length > 0 && (
                    <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium">{b.due.length} renewal{b.due.length > 1 ? "s" : ""}</span>
                  )}
                </div>
                <span className="text-xs tabular-nums w-24 text-right text-orange-400">{b.total > 0 ? formatAmount(Math.round(b.total)) : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Block the cash a fortnight before each renewal — a lapsed policy means re-underwriting and possible loss of no-claim bonus. Most insurers allow a 15–30 day grace window but cover is suspended until paid.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Claim-Settlement-Ratio Comparator
// ─────────────────────────────────────────────────────────────────────────────
interface CSRRow { id: string; insurer: string; claimsReceived: number; claimsPaid: number; avgDays: number }
function CSRComparator() {
  const [rows, setRows] = useFeatureState<CSRRow[]>("ins-csr", []);
  const [insurer, setInsurer] = useState("");
  const [received, setReceived] = useState("");
  const [paid, setPaid] = useState("");
  const [avgDays, setAvgDays] = useState("");

  const add = () => {
    const r = parseFloat(received) || 0;
    const p = parseFloat(paid) || 0;
    if (!insurer.trim() || r <= 0) { toast.error("Enter insurer and claims received"); return; }
    if (p > r) { toast.error("Claims paid cannot exceed claims received"); return; }
    setRows([...rows, { id: crypto.randomUUID(), insurer: insurer.trim(), claimsReceived: r, claimsPaid: p, avgDays: parseFloat(avgDays) || 0 }]);
    setInsurer(""); setReceived(""); setPaid(""); setAvgDays("");
    toast.success("Insurer added");
  };

  const evaluated = rows.map(r => ({ ...r, csr: r.claimsReceived > 0 ? (r.claimsPaid / r.claimsReceived) * 100 : 0 }))
    .sort((a, b) => b.csr - a.csr);
  const best = evaluated.length ? evaluated[0] : null;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Trophy size={14} className="text-[var(--color-primary)]" /> Claim-Settlement-Ratio Comparator</h3>
        <p className="text-xs text-[var(--color-muted)]">CSR = claims paid ÷ claims received, published yearly by every IRDAI insurer. A high ratio and a low average settlement time are the surest signs your claim will actually be paid.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Insurer</label>
            <input value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="e.g. HDFC Ergo" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Claims received</label>
            <input type="number" value={received} onChange={e => setReceived(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Claims paid</label>
            <input type="number" value={paid} onChange={e => setPaid(e.target.value)} placeholder="9800" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Avg settle days</label>
            <input type="number" value={avgDays} onChange={e => setAvgDays(e.target.value)} placeholder="14" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add the published CSR figures (from IRDAI's annual report) for the insurers you're comparing.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Insurer", "Received", "Paid", "CSR %", "Avg Days", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {evaluated.map(r => (
                  <tr key={r.id} className={`hover:bg-white/2 ${best && r.id === best.id ? "bg-green-950/20" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">{r.insurer}{best && r.id === best.id && <span className="ml-1.5 text-[9px] text-green-400 font-semibold">TOP</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatAmount(r.claimsReceived)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatAmount(r.claimsPaid)}</td>
                    <td className={`px-3 py-2.5 tabular-nums font-semibold ${r.csr >= 95 ? "text-green-400" : r.csr >= 85 ? "text-yellow-400" : "text-red-400"}`}>{r.csr.toFixed(2)}%</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.avgDays > 0 ? `${r.avgDays}d` : "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A CSR above 95% is strong; below 85% is a red flag. Pair it with the average settlement time and claim-amount-paid ratio — a high count ratio can still hide low-value payouts. Figures come from IRDAI's annual report and insurer public disclosures.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. No-Claim-Bonus Tracker
// ─────────────────────────────────────────────────────────────────────────────
interface NCBRow { id: string; policy: string; basePremium: number; claimFreeYears: number }
const NCB_SLAB = [0, 20, 25, 35, 45, 50]; // motor-style NCB % by consecutive claim-free years (capped 50%)
function ncbPct(years: number): number { return NCB_SLAB[Math.min(years, NCB_SLAB.length - 1)]; }

function NoClaimBonusTracker() {
  const [rows, setRows] = useFeatureState<NCBRow[]>("ins-ncb", []);
  const [policy, setPolicy] = useState("");
  const [basePremium, setBasePremium] = useState("");
  const [years, setYears] = useState("1");

  const add = () => {
    const bp = parseFloat(basePremium) || 0;
    if (!policy.trim() || bp <= 0) { toast.error("Enter a policy and base premium"); return; }
    setRows([...rows, { id: crypto.randomUUID(), policy: policy.trim(), basePremium: bp, claimFreeYears: Math.max(0, parseInt(years) || 0) }]);
    setPolicy(""); setBasePremium(""); setYears("1");
    toast.success("Policy added to NCB tracker");
  };

  const evaluated = rows.map(r => {
    const pct = ncbPct(r.claimFreeYears);
    const saving = r.basePremium * (pct / 100);
    return { ...r, pct, saving, nextPct: ncbPct(r.claimFreeYears + 1) };
  });
  const totalSaving = evaluated.reduce((s, r) => s + r.saving, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Award size={14} className="text-[var(--color-primary)]" /> No-Claim-Bonus Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">NCB rewards claim-free years with a renewal discount (motor caps at 50%; many health/asset policies offer a cumulative-bonus equivalent). It is portable — carry it when you switch insurers so you never reset to zero.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Policy</label>
            <input value={policy} onChange={e => setPolicy(e.target.value)} placeholder="e.g. Commercial vehicle" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base premium (₹)</label>
            <input type="number" value={basePremium} onChange={e => setBasePremium(e.target.value)} placeholder="30000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Claim-free years</label>
            <input type="number" min={0} value={years} onChange={e => setYears(e.target.value)} placeholder="2" className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Add policy
        </button>
      </div>

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add policies to see your accumulated bonus and the discount you should claim at renewal.</p>
      ) : (
        <>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Total NCB saving at next renewal</p>
            <p className="text-2xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(totalSaving))}</p>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Policy", "Base Premium", "Claim-Free Yrs", "Current NCB", "Saving", "Next Yr NCB", ""].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {evaluated.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{r.policy}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAmount(r.basePremium)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.claimFreeYears}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{r.pct}%</td>
                      <td className="px-3 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.saving))}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{r.nextPct}%{r.nextPct > r.pct ? " ↑" : ""}</td>
                      <td className="px-3 py-2.5 text-right">
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
      <p className="text-[10px] text-[var(--color-muted)]">Slabs shown are the common motor pattern (20/25/35/45/50%); health cumulative-bonus and asset no-claim-discount structures vary by insurer. One claim resets the bonus — weigh a small claim against the NCB you'd forfeit. Always carry the renewal/NCB-retention letter when porting.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Deductible vs Premium Optimizer
// ─────────────────────────────────────────────────────────────────────────────
function DeductibleOptimizer() {
  const [basePremium, setBasePremium] = useState("100000");
  const [baseDeductible, setBaseDeductible] = useState("25000");
  const [claimFreq, setClaimFreq] = useState("0.3"); // expected claims per year
  const [sensitivity, setSensitivity] = useState("60"); // % premium fall per doubling of deductible

  const bp = parseFloat(basePremium) || 0;
  const bd = Math.max(1, parseFloat(baseDeductible) || 1);
  const freq = parseFloat(claimFreq) || 0;
  const sens = (parseFloat(sensitivity) || 0) / 100;

  const options = useMemo(() => {
    const multipliers = [0.5, 1, 2, 4, 8];
    return multipliers.map(m => {
      const deductible = Math.round(bd * m);
      // premium scales down as deductible rises: each doubling cuts premium by `sens`
      const doublings = Math.log2(m);
      const premium = Math.max(0, Math.round(bp * Math.pow(1 - sens, doublings)));
      const expectedRetained = Math.round(deductible * freq); // expected self-carried loss per year
      const annualCost = premium + expectedRetained;
      return { deductible, premium, expectedRetained, annualCost };
    });
  }, [bp, bd, freq, sens]);

  const best = options.length ? options.reduce((a, b) => (b.annualCost < a.annualCost ? b : a)) : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><SlidersHorizontal size={14} className="text-[var(--color-primary)]" /> Deductible vs Premium Optimizer</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Raising the deductible (the first-loss you self-carry) cuts your premium — but you pay more out of pocket per claim. This finds the deductible with the lowest expected total annual cost.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base annual premium (₹)</label>
            <input type="number" value={basePremium} onChange={e => setBasePremium(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base deductible (₹)</label>
            <input type="number" value={baseDeductible} onChange={e => setBaseDeductible(e.target.value)} placeholder="25000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected claims / year</label>
            <input type="number" step="0.1" value={claimFreq} onChange={e => setClaimFreq(e.target.value)} placeholder="0.3" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Premium fall per doubling (%)</label>
            <input type="number" value={sensitivity} onChange={e => setSensitivity(e.target.value)} placeholder="60" className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Deductible", "Premium", "Expected Retained", "Total Annual Cost"].map(h =>
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {options.map(o => (
                <tr key={o.deductible} className={`hover:bg-white/2 ${best && o.deductible === best.deductible ? "bg-green-950/20" : ""}`}>
                  <td className="px-3 py-2.5 tabular-nums font-medium">{formatAmount(o.deductible)}{best && o.deductible === best.deductible && <span className="ml-1.5 text-[9px] text-green-400 font-semibold">OPTIMAL</span>}</td>
                  <td className="px-3 py-2.5 tabular-nums text-orange-400">{formatAmount(o.premium)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{formatAmount(o.expectedRetained)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{formatAmount(o.annualCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A planning model only — real premium-to-deductible curves are set by the insurer. The optimum minimises premium plus expected self-carried loss; only raise the deductible to a level your cash position can absorb in a bad year.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. Business-Interruption Cover Estimator
// ─────────────────────────────────────────────────────────────────────────────
function BusinessInterruptionEstimator() {
  const { store } = useApp();
  const autoRevenue = Math.round(store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0));

  const [turnover, setTurnover] = useState("");
  const [grossProfitPct, setGrossProfitPct] = useState("35");
  const [indemnityMonths, setIndemnityMonths] = useState("12");
  const [addlExpense, setAddlExpense] = useState("");
  const [ratePct, setRatePct] = useState("0.15");

  const t = parseFloat(turnover) || autoRevenue;
  const gp = parseFloat(grossProfitPct) || 0;
  const months = Math.max(1, parseFloat(indemnityMonths) || 12);
  const addl = parseFloat(addlExpense) || 0;
  const rate = parseFloat(ratePct) || 0;

  const annualGrossProfit = t * (gp / 100);
  const biSumInsured = Math.round(annualGrossProfit * (months / 12) + addl);
  const netPremium = biSumInsured * (rate / 100);
  const gst = netPremium * 0.18;
  const gross = netPremium + gst;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><PauseCircle size={14} className="text-[var(--color-primary)]" /> Business-Interruption Cover Estimator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">BI (loss-of-profit) cover replaces the gross profit you'd lose during a forced shutdown after an insured event (e.g. fire). It attaches to a material-damage policy and is sized on gross profit for your recovery period.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual turnover (₹){autoRevenue > 0 ? " · auto" : ""}</label>
            <input type="number" value={turnover} onChange={e => setTurnover(e.target.value)} placeholder={autoRevenue > 0 ? String(autoRevenue) : "20000000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross profit %</label>
            <input type="number" value={grossProfitPct} onChange={e => setGrossProfitPct(e.target.value)} placeholder="35" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Indemnity period (months)</label>
            <input type="number" value={indemnityMonths} onChange={e => setIndemnityMonths(e.target.value)} placeholder="12" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Increased cost of working (₹)</label>
            <input type="number" value={addlExpense} onChange={e => setAddlExpense(e.target.value)} placeholder="optional" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Premium rate (% of SI)</label>
            <input type="number" step="0.01" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="0.15" className={INP} />
          </div>
        </div>
      </div>

      {t > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "BI sum insured", value: formatAmount(biSumInsured), color: "text-blue-400" },
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
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Pick an indemnity period long enough to fully rebuild and regain market share — 12 months is a common minimum; manufacturers often need 18–24. "Increased cost of working" pays for temporary premises/overtime to keep trading. Indicative only; rates are insurer-set.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Marine / Transit Cover Calculator
// ─────────────────────────────────────────────────────────────────────────────
function MarineTransitCalculator() {
  const [mode, setMode] = useState<"single" | "open">("single");
  const [consignmentValue, setConsignmentValue] = useState("");
  const [annualTurnover, setAnnualTurnover] = useState("");
  const [freight, setFreight] = useState("");
  const [ratePerMille, setRatePerMille] = useState("2.5"); // ‰
  const [coverPct, setCoverPct] = useState("110"); // CIF + 10% standard

  const cv = parseFloat(consignmentValue) || 0;
  const at = parseFloat(annualTurnover) || 0;
  const fr = parseFloat(freight) || 0;
  const rate = parseFloat(ratePerMille) || 0;
  const cov = parseFloat(coverPct) || 100;

  const base = mode === "single" ? cv + fr : at;
  const sumInsured = Math.round(base * (cov / 100));
  const netPremium = sumInsured * (rate / 1000);
  const gst = netPremium * 0.18;
  const gross = netPremium + gst;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Ship size={14} className="text-[var(--color-primary)]" /> Marine / Transit Cover Calculator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Insure goods in transit against loss/damage. A single-transit policy covers one shipment (tie it to your e-way bill); an open/annual policy covers all dispatches on a declared-turnover basis. Sum insured is usually CIF value plus 10%.</p>
        <div className="flex gap-2 mb-3">
          {([["single", "Single transit"], ["open", "Open / annual"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${mode === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {mode === "single" ? (
            <>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Consignment value (₹)</label>
                <input type="number" value={consignmentValue} onChange={e => setConsignmentValue(e.target.value)} placeholder="500000" className={INP} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Freight & duty (₹)</label>
                <input type="number" value={freight} onChange={e => setFreight(e.target.value)} placeholder="optional" className={INP} />
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Annual dispatch turnover (₹)</label>
              <input type="number" value={annualTurnover} onChange={e => setAnnualTurnover(e.target.value)} placeholder="30000000" className={INP} />
            </div>
          )}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cover % of value</label>
            <input type="number" value={coverPct} onChange={e => setCoverPct(e.target.value)} placeholder="110" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (‰ of SI)</label>
            <input type="number" step="0.1" value={ratePerMille} onChange={e => setRatePerMille(e.target.value)} placeholder="2.5" className={INP} />
          </div>
        </div>
      </div>

      {base > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Sum insured", value: formatAmount(sumInsured), color: "text-blue-400" },
            { label: "Net premium", value: formatAmount(Math.round(netPremium)), color: "text-[var(--color-text)]" },
            { label: "GST (18%)", value: formatAmount(Math.round(gst)), color: "text-yellow-400" },
            { label: mode === "single" ? "Premium this shipment" : "Annual premium", value: formatAmount(Math.round(gross)), color: "text-orange-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">An Institute Cargo Clause "A" cover is all-risk; "C" is named-perils only and cheaper. For exports, sum insured is conventionally CIF + 10% to cover incidental costs and lost margin. Rates depend on commodity, route and packing. Indicative only.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. Professional-Indemnity Estimator
// ─────────────────────────────────────────────────────────────────────────────
const PI_PROFESSION_RATE: Record<string, number> = {
  "CA / Accounting firm": 0.9, "Consulting / Advisory": 0.8, "Architect / Engineer": 1.1,
  "IT / Software services": 0.7, "Marketing / Agency": 0.6, "Clinic / Healthcare": 1.4, "Legal services": 1.0,
};
function ProfessionalIndemnityEstimator() {
  const professions = Object.keys(PI_PROFESSION_RATE);
  const [profession, setProfession] = useState(professions[0]);
  const [limit, setLimit] = useState("5000000"); // any-one-claim limit
  const [annualFees, setAnnualFees] = useState("");
  const [retroYears, setRetroYears] = useState("0");

  const lim = parseFloat(limit) || 0;
  const fees = parseFloat(annualFees) || 0;
  const retro = Math.max(0, parseFloat(retroYears) || 0);
  const baseRate = PI_PROFESSION_RATE[profession];

  // premium = rate% of limit, loaded a touch by fee size and retroactive cover
  const feeLoad = fees > 0 ? Math.min(0.5, fees / Math.max(lim, 1)) : 0;
  const retroLoad = retro * 0.08;
  const netPremium = lim * (baseRate / 100) * (1 + feeLoad + retroLoad);
  const gst = netPremium * 0.18;
  const gross = netPremium + gst;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Briefcase size={14} className="text-[var(--color-primary)]" /> Professional-Indemnity Estimator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">PI (errors-and-omissions) cover protects service firms against client claims for negligent advice or work. Premium is a rate on the indemnity limit, loaded for fee income and any retroactive (past-work) cover.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Profession</label>
            <select value={profession} onChange={e => setProfession(e.target.value)} className={INP}>
              {professions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Indemnity limit (₹)</label>
            <input type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="5000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual fee income (₹)</label>
            <input type="number" value={annualFees} onChange={e => setAnnualFees(e.target.value)} placeholder="optional" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Retroactive years</label>
            <input type="number" min={0} value={retroYears} onChange={e => setRetroYears(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {lim > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Indemnity limit", value: formatAmount(lim), color: "text-blue-400" },
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
      )}
      <p className="text-[10px] text-[var(--color-muted)]">PI is a claims-made cover — only claims first made during the policy period are paid, so keep it running continuously and buy run-off if you wind down. Retroactive cover protects against work done before inception. Rates are illustrative and vary widely by claim history.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. Cyber-Insurance Need Scorer
// ─────────────────────────────────────────────────────────────────────────────
const CYBER_FACTORS: { key: string; label: string; weight: number }[] = [
  { key: "online", label: "Take payments or sell online", weight: 18 },
  { key: "pii", label: "Store customer personal/KYC data (DPDP scope)", weight: 22 },
  { key: "cloud", label: "Run core operations on cloud/SaaS", weight: 12 },
  { key: "cards", label: "Handle card data / financial info", weight: 16 },
  { key: "remote", label: "Staff work remotely / use personal devices", weight: 10 },
  { key: "vendors", label: "Share data with third-party vendors", weight: 10 },
  { key: "incident", label: "Had a breach or phishing incident before", weight: 12 },
];
function CyberInsuranceScorer() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [records, setRecords] = useState("5000"); // PII records held

  const toggle = (k: string) => setChecked(c => ({ ...c, [k]: !c[k] }));
  const score = CYBER_FACTORS.reduce((s, f) => s + (checked[f.key] ? f.weight : 0), 0);
  const recs = parseFloat(records) || 0;
  // suggested cover: DPDP penalties can reach ₹250 cr; scale a practical SMB limit off records + risk
  const suggestedLimit = Math.round(Math.max(2500000, recs * 150) * (1 + score / 100));

  const band = score >= 60 ? { label: "High exposure — cover strongly advised", color: "text-red-400", bar: "#ef4444" }
    : score >= 35 ? { label: "Moderate exposure — consider cover", color: "text-yellow-400", bar: "#eab308" }
    : { label: "Lower exposure — basic hygiene may suffice", color: "text-green-400", bar: "#22c55e" };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Bug size={14} className="text-[var(--color-primary)]" /> Cyber-Insurance Need Scorer</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Score your digital exposure to decide whether cyber cover (breach response, ransomware, DPDP liability) is worth buying — and roughly how much limit to ask for.</p>
        <div className="space-y-2 mb-4">
          {CYBER_FACTORS.map(f => (
            <label key={f.key} className="flex items-center gap-2.5 text-sm cursor-pointer bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <input type="checkbox" checked={!!checked[f.key]} onChange={() => toggle(f.key)} className="accent-[var(--color-primary)]" />
              <span className="flex-1">{f.label}</span>
              <span className="text-[10px] text-[var(--color-muted)]">+{f.weight}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Approx. personal-data records held</label>
          <input type="number" value={records} onChange={e => setRecords(e.target.value)} placeholder="5000" className={INP} />
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold">Cyber-exposure score</p>
            <p className={`text-xs font-semibold ${band.color}`}>{band.label}</p>
          </div>
          <p className={`text-3xl font-bold tabular-nums ${band.color}`}>{score}<span className="text-base text-[var(--color-muted)]">/100</span></p>
        </div>
        <div className="mt-4 w-full h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: band.bar }} />
        </div>
        {score > 0 && (
          <p className="text-sm mt-4">Indicative cover to consider: <strong className="text-[var(--color-primary)]">{formatCurrency(suggestedLimit)}</strong> first-party + liability limit.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A heuristic prioritisation tool, not an underwriting decision. Under the DPDP Act, the Data Protection Board can levy penalties up to ₹250 crore for serious breaches — cyber cover typically funds breach response, forensics, notification and legal costs. Calibrate the limit with a broker.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 19. Vehicle / Fleet Insurance Tracker
// ─────────────────────────────────────────────────────────────────────────────
interface Vehicle { id: string; regNo: string; type: string; idv: number; premium: number; expiry: string }
const VEHICLE_TYPES = ["Goods carrier (LCV)", "Goods carrier (HCV)", "Passenger / staff bus", "Car (commercial)", "Two-wheeler", "Tractor / equipment"] as const;
function FleetInsuranceTracker() {
  const [fleet, setFleet] = useFeatureState<Vehicle[]>("ins-fleet", []);
  const today = new Date();
  const [regNo, setRegNo] = useState("");
  const [type, setType] = useState<string>(VEHICLE_TYPES[0]);
  const [idv, setIdv] = useState("");
  const [premium, setPremium] = useState("");
  const [expiry, setExpiry] = useState("");

  const add = () => {
    const i = parseFloat(idv) || 0;
    if (!regNo.trim() || i <= 0) { toast.error("Enter registration and IDV"); return; }
    setFleet([...fleet, { id: crypto.randomUUID(), regNo: regNo.trim().toUpperCase(), type, idv: i, premium: parseFloat(premium) || 0, expiry }]);
    setRegNo(""); setIdv(""); setPremium(""); setExpiry("");
    toast.success("Vehicle added to fleet");
  };

  const totalIdv = fleet.reduce((s, v) => s + v.idv, 0);
  const totalPremium = fleet.reduce((s, v) => s + v.premium, 0);
  const expiringSoon = fleet.filter(v => {
    if (!v.expiry) return false;
    try { const d = differenceInCalendarDays(parseISO(v.expiry), today); return d >= 0 && d <= 30; } catch { return false; }
  }).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Truck size={14} className="text-[var(--color-primary)]" /> Vehicle / Fleet Insurance Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Track every commercial vehicle's IDV, premium and expiry in one place. Motor cover is mandatory under the Motor Vehicles Act — driving an uninsured vehicle is an offence and voids any accident claim.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Registration no.</label>
            <input value={regNo} onChange={e => setRegNo(e.target.value)} placeholder="MH12AB1234" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={INP}>
              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IDV (₹)</label>
            <input type="number" value={idv} onChange={e => setIdv(e.target.value)} placeholder="800000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Premium (₹)</label>
            <input type="number" value={premium} onChange={e => setPremium(e.target.value)} placeholder="32000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expiry</label>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Add vehicle
        </button>
      </div>

      {fleet.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add vehicles to track IDV, premium spend and expiry dates across the fleet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Vehicles", value: `${fleet.length}`, color: "text-[var(--color-text)]" },
              { label: "Total IDV", value: formatAmount(Math.round(totalIdv)), color: "text-blue-400" },
              { label: "Annual premium", value: formatAmount(Math.round(totalPremium)), color: "text-orange-400" },
              { label: "Expiring ≤30d", value: `${expiringSoon}`, color: expiringSoon > 0 ? "text-yellow-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Reg. No.", "Type", "IDV", "Premium", "Expiry", "Status", ""].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {fleet.map(v => {
                    let d: number | null = null;
                    if (v.expiry) { try { d = differenceInCalendarDays(parseISO(v.expiry), today); } catch { d = null; } }
                    const lapsed = d !== null && d < 0;
                    const urgent = d !== null && d >= 0 && d <= 30;
                    return (
                      <tr key={v.id} className="hover:bg-white/2">
                        <td className="px-3 py-2.5 font-medium">{v.regNo}</td>
                        <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{v.type}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatAmount(v.idv)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-orange-400">{v.premium > 0 ? formatAmount(v.premium) : "—"}</td>
                        <td className="px-3 py-2.5 text-xs">{v.expiry ? format(parseISO(v.expiry), "d MMM yyyy") : "—"}</td>
                        <td className="px-3 py-2.5">
                          {d === null ? <span className="text-xs text-[var(--color-muted)]">No date</span>
                            : lapsed ? <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><AlertTriangle size={11} /> Lapsed</span>
                            : urgent ? <span className="inline-flex items-center gap-1 text-xs text-yellow-400 font-semibold"><CalendarClock size={11} /> {d}d</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={11} /> {d}d</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => setFleet(fleet.filter(x => x.id !== v.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
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
      <p className="text-[10px] text-[var(--color-muted)]">IDV (Insured Declared Value) is the agreed market value and the maximum a total-loss claim will pay — don't under-declare to save premium. Third-party cover is mandatory; own-damage is optional but wise for newer vehicles. Renew before expiry to avoid a fresh inspection.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 20. Workmen-Compensation (Employees' Compensation) Estimator
// ─────────────────────────────────────────────────────────────────────────────
const WC_RISK: { key: string; label: string; ratePct: number }[] = [
  { key: "office", label: "Office / clerical", ratePct: 0.2 },
  { key: "retail", label: "Retail / warehouse", ratePct: 0.4 },
  { key: "light", label: "Light manufacturing", ratePct: 0.8 },
  { key: "heavy", label: "Heavy manufacturing / engineering", ratePct: 1.3 },
  { key: "construction", label: "Construction / contracting", ratePct: 2.0 },
];
function WorkmenCompEstimator() {
  const { store } = useApp();
  const payrollOutflow = Math.round(Math.abs(store.transactions.filter(t => t.category === "payroll").reduce((s, t) => s + t.amount, 0)));

  const [riskKey, setRiskKey] = useState(WC_RISK[1].key);
  const [headcount, setHeadcount] = useState("");
  const [annualWages, setAnnualWages] = useState("");
  const [medicalExt, setMedicalExt] = useState(true);

  const risk = WC_RISK.find(r => r.key === riskKey)!;
  const wages = parseFloat(annualWages) || payrollOutflow;
  const heads = parseFloat(headcount) || 0;

  const netPremium = wages * (risk.ratePct / 100) * (medicalExt ? 1.15 : 1);
  const gst = netPremium * 0.18;
  const gross = netPremium + gst;
  const perHead = heads > 0 ? gross / heads : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><HardHat size={14} className="text-[var(--color-primary)]" /> Workmen-Compensation Estimator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">WC (Employees' Compensation) cover meets your statutory liability under the Employees' Compensation Act for work-related injury, disability or death of workers. Premium is a rate on annual wages, set by occupation risk.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Occupation risk class</label>
            <select value={riskKey} onChange={e => setRiskKey(e.target.value)} className={INP}>
              {WC_RISK.map(r => <option key={r.key} value={r.key}>{r.label} · {r.ratePct}%</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual wage bill (₹){payrollOutflow > 0 ? " · auto" : ""}</label>
            <input type="number" value={annualWages} onChange={e => setAnnualWages(e.target.value)} placeholder={payrollOutflow > 0 ? String(payrollOutflow) : "3600000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Headcount</label>
            <input type="number" value={headcount} onChange={e => setHeadcount(e.target.value)} placeholder="12" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={medicalExt} onChange={e => setMedicalExt(e.target.checked)} className="accent-[var(--color-primary)]" />
              Add medical-expenses extension (+15%)
            </label>
          </div>
        </div>
      </div>

      {wages > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Net premium", value: formatAmount(Math.round(netPremium)), color: "text-[var(--color-text)]" },
              { label: "GST (18%)", value: formatAmount(Math.round(gst)), color: "text-yellow-400" },
              { label: "Gross premium", value: formatAmount(Math.round(gross)), color: "text-orange-400" },
              { label: "Per worker", value: heads > 0 ? formatAmount(Math.round(perHead)) : "—", color: "text-blue-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Where the ESI Act applies (covered establishments), ESIC generally substitutes for WC; WC cover suits employees outside ESI wage limits or non-ESI areas. Rates here are illustrative occupation bands — actual pricing depends on the nature of work and claims history. Confirm statutory applicability with your CA.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 21. Premium-Financing EMI Calculator
// ─────────────────────────────────────────────────────────────────────────────
function PremiumEMICalculator() {
  const [premium, setPremium] = useState("120000");
  const [downPct, setDownPct] = useState("20");
  const [annualRate, setAnnualRate] = useState("14");
  const [tenureMonths, setTenureMonths] = useState("10");

  const p = parseFloat(premium) || 0;
  const dp = Math.min(100, Math.max(0, parseFloat(downPct) || 0));
  const rate = parseFloat(annualRate) || 0;
  const n = Math.max(1, Math.round(parseFloat(tenureMonths) || 1));

  const downPayment = Math.round(p * (dp / 100));
  const principal = p - downPayment;
  const r = rate / 12 / 100;
  const emi = r > 0 ? (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : principal / n;
  const totalPaid = emi * n + downPayment;
  const interest = totalPaid - p;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Premium-Financing EMI Calculator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Spreading a lump-sum annual premium into monthly instalments protects cash flow but adds interest. See the true cost before opting for premium financing.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual premium (₹, incl. GST)</label>
            <input type="number" value={premium} onChange={e => setPremium(e.target.value)} placeholder="120000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Down payment %</label>
            <input type="number" value={downPct} onChange={e => setDownPct(e.target.value)} placeholder="20" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest rate % p.a.</label>
            <input type="number" step="0.1" value={annualRate} onChange={e => setAnnualRate(e.target.value)} placeholder="14" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
            <input type="number" value={tenureMonths} onChange={e => setTenureMonths(e.target.value)} placeholder="10" className={INP} />
          </div>
        </div>
      </div>

      {p > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Down payment", value: formatAmount(downPayment), color: "text-[var(--color-text)]" },
              { label: "Monthly EMI", value: formatAmount(Math.round(emi)), color: "text-[var(--color-primary)]" },
              { label: "Total interest", value: formatAmount(Math.round(interest)), color: "text-orange-400" },
              { label: "Total outflow", value: formatAmount(Math.round(totalPaid)), color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <p className="text-sm mt-3">Financing this premium costs an extra <strong className="text-orange-400">{formatCurrency(Math.round(interest))}</strong> ({p > 0 ? ((interest / p) * 100).toFixed(1) : "0"}% of premium) in interest.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">EMI uses the standard reducing-balance formula. Compare the interest cost against the cash-flow benefit — if you can fund the lump sum, paying upfront is cheaper. GST on the premium is already included in the financed amount; financing interest is a separate finance charge.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 22. GST-on-Premium ITC Checker
// ─────────────────────────────────────────────────────────────────────────────
const ITC_RULES: { key: string; label: string; eligible: "yes" | "no" | "cond"; note: string }[] = [
  { key: "fire", label: "Fire / property cover on business premises", eligible: "yes", note: "Used for business — ITC available" },
  { key: "liability", label: "Public / product liability", eligible: "yes", note: "Business liability — ITC available" },
  { key: "pi", label: "Professional indemnity / D&O", eligible: "yes", note: "Business cover — ITC available" },
  { key: "marine", label: "Marine / transit on goods", eligible: "yes", note: "Inward/outward goods — ITC available" },
  { key: "tradecredit", label: "Trade-credit / receivables", eligible: "yes", note: "Business cover — ITC available" },
  { key: "keyman", label: "Key-man term insurance", eligible: "yes", note: "Company-paid business cover — ITC generally available" },
  { key: "wc", label: "Workmen compensation", eligible: "yes", note: "Statutory employer cover — ITC available" },
  { key: "grouphealth", label: "Group health / mediclaim for staff", eligible: "cond", note: "Blocked under s.17(5) unless obligatory under a law (e.g. statutory) — generally not eligible for voluntary cover" },
  { key: "motor", label: "Motor cover on commercial vehicles", eligible: "cond", note: "Eligible if the vehicle itself is eligible (goods transport / >13-seater / business use); blocked for most passenger cars" },
  { key: "personal", label: "Owner's personal life / health", eligible: "no", note: "Personal, not business — no ITC" },
];
function GSTITCChecker() {
  const [coverKey, setCoverKey] = useState(ITC_RULES[0].key);
  const [premiumExGst, setPremiumExGst] = useState("");

  const rule = ITC_RULES.find(r => r.key === coverKey)!;
  const base = parseFloat(premiumExGst) || 0;
  const gst = base * 0.18;
  const gross = base + gst;
  const claimable = rule.eligible === "yes" ? gst : 0;

  const badge = rule.eligible === "yes"
    ? { label: "ITC ELIGIBLE", color: "text-green-400 bg-green-950/30 border-green-800/40", icon: <CheckCircle2 size={14} className="text-green-400" /> }
    : rule.eligible === "cond"
    ? { label: "CONDITIONAL", color: "text-yellow-400 bg-yellow-950/30 border-yellow-800/40", icon: <AlertTriangle size={14} className="text-yellow-400" /> }
    : { label: "BLOCKED", color: "text-red-400 bg-red-950/30 border-red-800/40", icon: <FileWarning size={14} className="text-red-400" /> };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> GST-on-Premium ITC Checker</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Insurance premiums carry 18% GST. Whether you can claim that as Input Tax Credit depends on the cover type and s.17(5) of the CGST Act. Check eligibility before you net it off your output tax.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cover type</label>
            <select value={coverKey} onChange={e => setCoverKey(e.target.value)} className={INP}>
              {ITC_RULES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Premium excl. GST (₹)</label>
            <input type="number" value={premiumExGst} onChange={e => setPremiumExGst(e.target.value)} placeholder="50000" className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          {badge.icon}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>{badge.label}</span>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">{rule.note}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Premium (excl. GST)", value: formatAmount(Math.round(base)), color: "text-[var(--color-text)]" },
            { label: "GST @ 18%", value: formatAmount(Math.round(gst)), color: "text-yellow-400" },
            { label: "Gross premium", value: formatAmount(Math.round(gross)), color: "text-orange-400" },
            { label: "ITC claimable", value: formatAmount(Math.round(claimable)), color: claimable > 0 ? "text-green-400" : "text-[var(--color-muted)]" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">General guidance, not tax advice. ITC needs a valid tax invoice with your GSTIN, the supply must be for business, and the credit must not be blocked under s.17(5). Group-health and most personal-vehicle covers are commonly blocked unless obligatory under another law. Confirm each claim with your CA and GSTR-2B.</p>
    </div>
  );
}
