import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import TabStrip from "@/components/TabStrip";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  ShieldCheck, Wallet, AlertTriangle, Calculator, HeartPulse, Building2,
  Landmark, FileWarning, GitCompareArrows, UserCheck, Gauge, Plus,
  CheckCircle2, CalendarClock, ShieldAlert, TrendingDown,
  CalendarDays, Trophy, Award, SlidersHorizontal, PauseCircle, Ship,
  Briefcase, Bug, Truck, HardHat, Receipt,
  Layers, Stethoscope, Activity, GitMerge, Coins, PiggyBank, Users,
  Scale, Combine, Boxes, UserPlus, Scale3d,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, parseISO, format } from "date-fns";
import DataFreshnessBadge from "@/components/DataFreshnessBadge";
import { useUrlTab } from "@/hooks/useUrlTab";

// C14 continuation (2026-07 gap audit) — keep in sync with the TabStrip `tabs=` array below.
const INSURANCE_TAB_IDS = ["overview", "vault", "register", "gaps", "suminsured", "grouphealth", "assetcover", "tradecredit", "claims", "premvscover", "keyman", "riskscore", "duecal", "csrcompare", "ncbtracker", "deductibleopt", "bicover", "marinecover", "piestimator", "cyberscore", "fleettracker", "wcestimator", "premiumemi", "itcchecker", "tophealth", "opdwellness", "lifestage", "riders", "tco", "surrender", "groupvsindiv", "renewplanner", "inflationidx", "spendbudget", "claimprep", "underinsurance", "overlap", "pkgrec", "empgap", "liability"] as const;
type Tab = (typeof INSURANCE_TAB_IDS)[number];

// shared styles (reused from Tax/Debt pattern)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

export default function InsurancePage() {
  const tr = useT();
  const [tab, setTab] = useUrlTab<Tab>("overview", { validValues: INSURANCE_TAB_IDS });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck size={18} className="text-[var(--color-primary)]" /> {tr("ins.title")}
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {tr("ins.subtitle")}
          </p>
        </div>
        <TabStrip storageKey="insurance-tabs" primaryCount={6} active={tab} onChange={(id) => setTab(id as Tab)} tabs={([
            ["overview", tr("ins.tab.overview"), ShieldCheck],
            ["vault", "Policy Vault (live)", ShieldAlert],
            ["register", tr("ins.tab.register"), Wallet],
            ["gaps", tr("ins.tab.gaps"), FileWarning],
            ["suminsured", tr("ins.tab.suminsured"), Calculator],
            ["grouphealth", tr("ins.tab.grouphealth"), HeartPulse],
            ["assetcover", tr("ins.tab.assetcover"), Building2],
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
            ["tophealth", "Top-Up Optimizer", Layers],
            ["opdwellness", "OPD & Wellness", Stethoscope],
            ["lifestage", "Life-Stage Adequacy", Activity],
            ["riders", "Riders Comparator", GitMerge],
            ["tco", "Insurance TCO", Coins],
            ["surrender", "Surrender Value", PiggyBank],
            ["groupvsindiv", "Group vs Individual", Users],
            ["renewplanner", "Renewal Planner", CalendarClock],
            ["inflationidx", "SI Inflation Indexer", TrendingDown],
            ["spendbudget", "Spend Budget", Coins],
            ["claimprep", "Claim Readiness", FileWarning],
            ["underinsurance", "Under-Insurance", Scale],
            ["overlap", "Overlap Finder", Combine],
            ["pkgrec", "Package by Sector", Boxes],
            ["empgap", "Employee Gap", UserPlus],
            ["liability", "Liability Adequacy", Scale3d],
          ] as const).map(([id, label, icon]) => ({ id, label, icon }))} />
      </div>

      {tab === "overview" && <Overview onPick={setTab} />}
      {tab === "vault" && <PolicyVaultLive />}
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
      {tab === "tophealth" && <TopUpOptimizer />}
      {tab === "opdwellness" && <OPDWellnessTracker />}
      {tab === "lifestage" && <LifeStageAdequacy />}
      {tab === "riders" && <RidersComparator />}
      {tab === "tco" && <InsuranceTCO />}
      {tab === "surrender" && <SurrenderValueEstimator />}
      {tab === "groupvsindiv" && <GroupVsIndividual />}
      {tab === "renewplanner" && <RenewalPlanner />}
      {tab === "inflationidx" && <SumInsuredInflationIndexer />}
      {tab === "spendbudget" && <InsuranceSpendBudget />}
      {tab === "claimprep" && <ClaimReadinessChecklist />}
      {tab === "underinsurance" && <UnderInsuranceChecker />}
      {tab === "overlap" && <PolicyOverlapFinder />}
      {tab === "pkgrec" && <BusinessPackageRecommender />}
      {tab === "empgap" && <EmployeeCoverageGap />}
      {tab === "liability" && <LiabilityLimitAdequacy />}
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
    { label: "Total Sum Insured", value: policies.length ? formatAmount(totalSum) : "-", color: "text-blue-400", sub: "Aggregate cover across policies" },
    { label: "Annual Premium", value: policies.length ? formatAmount(totalPremium) : "-", color: "text-orange-400", sub: "Incl. 18% GST on premium" },
    { label: "Premium / Revenue", value: annualRevenue > 0 && policies.length ? `${premiumPctRevenue.toFixed(2)}%` : "-", color: premiumPctRevenue > 3 ? "text-yellow-400" : "text-green-400", sub: "SMB benchmark 1-3% of turnover" },
  ];

  const tools: { id: Tab; title: string; desc: string }[] = [
    { id: "register", title: "Policy Register & Renewals", desc: "One vault for every policy with renewal countdowns and lapse alerts." },
    { id: "gaps", title: "Coverage-Gap Analyzer", desc: "Find risks on your books - assets, staff, debtors - with no matching cover." },
    { id: "suminsured", title: "Sum-Insured Calculator", desc: "Size cover from turnover, assets and inventory so you aren't under-insured." },
    { id: "grouphealth", title: "Group-Health Estimator", desc: "Indicative mediclaim premium for your team, priced by age band and cover." },
    { id: "assetcover", title: "Business-Asset Cover", desc: "Build a fire/burglary schedule from your asset register at reinstatement value." },
    { id: "tradecredit", title: "Trade-Credit / Receivables", desc: "Estimate trade-credit premium to insure debtors against buyer default." },
    { id: "claims", title: "Claims Tracker", desc: "Log every claim from intimation to settlement and watch your claims ratio." },
    { id: "premvscover", title: "Premium vs Cover", desc: "Compare quotes on rate-on-line and model how deductibles move premium." },
    { id: "keyman", title: "Key-Man Insurance", desc: "Size cover on a founder/key employee from their contribution to profit." },
    { id: "riskscore", title: "Risk-Exposure Scorecard", desc: "A 0-100 protection score from cover breadth, concentration and renewals." },
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
          Most Indian SMBs are silently under-insured - a single fire, a defaulting buyer or a key person leaving can wipe out years of profit.
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
                      <td className="px-3 py-2.5 text-xs">{p.policyNo || "-"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAmount(p.sumInsured)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-orange-400">{p.premium > 0 ? formatAmount(p.premium) : "-"}</td>
                      <td className="px-3 py-2.5 text-xs">{p.renewalDate ? format(parseISO(p.renewalDate), "d MMM yyyy") : "-"}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">A lapsed policy means no cover - most insurers allow a 15-30 day grace window for renewal but a fresh policy may need re-underwriting. Premiums on business covers usually attract 18% GST, which is ITC-eligible if used for business.</p>
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
    { type: "Group Health (Mediclaim)", label: "Group health", reason: "Payroll detected - staff without medical cover", applies: hasPayroll, severity: "high" },
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
          <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> No obvious gaps against the standard SMB cover set - review limits annually.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Heuristic gap scan based on common SMB exposures - not a substitute for a broker's risk survey. Add policies in the register to clear gaps.</p>
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Insure assets at reinstatement (replacement) value, not book value - under-insurance triggers the average clause and slashes any claim payout.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Assets shown at the value you enter - use replacement cost. Business-interruption cover is set as gross profit for the indemnity period you can realistically take to recover. Stock floaters can be declaration-based if levels swing seasonally.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Group-Health Premium Estimator
// ─────────────────────────────────────────────────────────────────────────────
type AgeBand = "u30" | "30to45" | "45to60" | "o60";
const AGE_FACTOR: Record<AgeBand, number> = { u30: 0.7, "30to45": 1.0, "45to60": 1.6, o60: 2.6 };
const AGE_LABEL: Record<AgeBand, string> = { u30: "Under 30", "30to45": "30-45", "45to60": "45-60", o60: "Over 60" };

function GroupHealthEstimator() {
  const [heads, setHeads] = useState<Record<AgeBand, string>>({ u30: "", "30to45": "", "45to60": "", o60: "" });
  const [coverPerHead, setCoverPerHead] = useState("300000");
  const [familyFloater, setFamilyFloater] = useState(true);
  const [maternity, setMaternity] = useState(false);

  const cover = parseFloat(coverPerHead) || 0;
  // Base rate-on-line ~ 3% of sum insured per ₹1L of cover band, scaled. Indicative only.
  const baseRatePer1L = 1100; // ₹ base annual premium per ₹1L SI for a 30-45 life
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
          <DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative annual mediclaim premium by age band. Group cover is available for teams as small as two.
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
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative model only - actual group-mediclaim pricing depends on claims experience, room-rent caps, co-pay, network and insurer. GST on health insurance premium is 18%. Bind through an IRDAI-licensed insurer/broker.</p>
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
        <p className="text-xs text-[var(--color-muted)]">Build a fire/burglary schedule line by line. Enter a rate (% of sum insured per year) - typical fire rates are 0.05-0.75% depending on occupancy.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Rates are illustrative - actual fire/burglary rates are set by the insurer on occupancy, fire-fighting arrangements and claims history. Insure at reinstatement value to avoid the average (under-insurance) clause.</p>
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
                {concentrationPct > 25 ? " High concentration - a single default could be severe; consider a per-buyer credit limit." : " Concentration looks manageable."}
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Trade-credit pricing depends on your buyer ledger quality, sector and historic bad-debt rate; insurers set per-buyer credit limits after assessing each debtor. Figures here are indicative - get a formal quote from an IRDAI-licensed credit insurer.</p>
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
            { label: "Claims-to-premium", value: totalPremium > 0 ? `${claimsRatio.toFixed(0)}%` : "-", color: claimsRatio > 100 ? "text-red-400" : "text-green-400" },
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
                      <td className="px-3 py-2.5 tabular-nums">{q.deductible > 0 ? formatAmount(q.deductible) : "-"}</td>
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
                <TrendingDown size={14} /> {best.insurer} has the lowest rate-on-line ({best.rol.toFixed(3)}% of sum insured) - the cheapest cover per rupee of protection. Check sub-limits, exclusions and claim-settlement ratio before binding.
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rate-on-line is the cleanest like-for-like comparison, but the cheapest premium is not always best value - weigh sub-limits, exclusions, room-rent/co-pay (health) and the insurer's claim-settlement ratio.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Premium shown is illustrative; actual term-life pricing depends on age, health and sum assured. Key-man premium is generally a deductible business expense and the payout is taxable as business income - confirm treatment with your CA.</p>
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

  // Score components (0-100, higher = better protected)
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
            <ShieldAlert size={14} /> {openClaims} open claim(s) in progress - keep documents current and follow up before the surveyor deadline.
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
          { label: "Premium due (12 mo)", value: policies.length ? formatAmount(Math.round(next12Total)) : "-", color: "text-orange-400", sub: "Incl. GST already on policies" },
          { label: "Avg / month", value: policies.length ? formatAmount(Math.round(next12Total / 12)) : "-", color: "text-blue-400", sub: "Set aside to avoid lapse" },
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
                <span className="text-xs tabular-nums w-24 text-right text-orange-400">{b.total > 0 ? formatAmount(Math.round(b.total)) : "-"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Block the cash a fortnight before each renewal - a lapsed policy means re-underwriting and possible loss of no-claim bonus. Most insurers allow a 15-30 day grace window but cover is suspended until paid.</p>
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
                    <td className="px-3 py-2.5 tabular-nums">{r.avgDays > 0 ? `${r.avgDays}d` : "-"}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">A CSR above 95% is strong; below 85% is a red flag. Pair it with the average settlement time and claim-amount-paid ratio - a high count ratio can still hide low-value payouts. Figures come from IRDAI's annual report and insurer public disclosures.</p>
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
        <p className="text-xs text-[var(--color-muted)]">NCB rewards claim-free years with a renewal discount (motor caps at 50%; many health/asset policies offer a cumulative-bonus equivalent). It is portable - carry it when you switch insurers so you never reset to zero.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Slabs shown are the common motor pattern (20/25/35/45/50%); health cumulative-bonus and asset no-claim-discount structures vary by insurer. One claim resets the bonus - weigh a small claim against the NCB you'd forfeit. Always carry the renewal/NCB-retention letter when porting.</p>
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
        <p className="text-xs text-[var(--color-muted)] mb-4">Raising the deductible (the first-loss you self-carry) cuts your premium - but you pay more out of pocket per claim. This finds the deductible with the lowest expected total annual cost.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">A planning model only - real premium-to-deductible curves are set by the insurer. The optimum minimises premium plus expected self-carried loss; only raise the deductible to a level your cash position can absorb in a bad year.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Pick an indemnity period long enough to fully rebuild and regain market share - 12 months is a common minimum; manufacturers often need 18-24. "Increased cost of working" pays for temporary premises/overtime to keep trading. Indicative only; rates are insurer-set.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />An Institute Cargo Clause "A" cover is all-risk; "C" is named-perils only and cheaper. For exports, sum insured is conventionally CIF + 10% to cover incidental costs and lost margin. Rates depend on commodity, route and packing. Indicative only.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">PI is a claims-made cover - only claims first made during the policy period are paid, so keep it running continuously and buy run-off if you wind down. Retroactive cover protects against work done before inception. Rates are illustrative and vary widely by claim history.</p>
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

  const band = score >= 60 ? { label: "High exposure - cover strongly advised", color: "text-red-400", bar: "#ef4444" }
    : score >= 35 ? { label: "Moderate exposure - consider cover", color: "text-yellow-400", bar: "#eab308" }
    : { label: "Lower exposure - basic hygiene may suffice", color: "text-green-400", bar: "#22c55e" };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Bug size={14} className="text-[var(--color-primary)]" /> Cyber-Insurance Need Scorer</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Score your digital exposure to decide whether cyber cover (breach response, ransomware, DPDP liability) is worth buying - and roughly how much limit to ask for.</p>
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
          <p className="text-sm mt-4"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative cover to consider: <strong className="text-[var(--color-primary)]">{formatCurrency(suggestedLimit)}</strong> first-party + liability limit.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A heuristic prioritisation tool, not an underwriting decision. Under the DPDP Act, the Data Protection Board can levy penalties up to ₹250 crore for serious breaches - cyber cover typically funds breach response, forensics, notification and legal costs. Calibrate the limit with a broker.</p>
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
        <p className="text-xs text-[var(--color-muted)]">Track every commercial vehicle's IDV, premium and expiry in one place. Motor cover is mandatory under the Motor Vehicles Act - driving an uninsured vehicle is an offence and voids any accident claim.</p>
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
                        <td className="px-3 py-2.5 tabular-nums text-orange-400">{v.premium > 0 ? formatAmount(v.premium) : "-"}</td>
                        <td className="px-3 py-2.5 text-xs">{v.expiry ? format(parseISO(v.expiry), "d MMM yyyy") : "-"}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">IDV (Insured Declared Value) is the agreed market value and the maximum a total-loss claim will pay - don't under-declare to save premium. Third-party cover is mandatory; own-damage is optional but wise for newer vehicles. Renew before expiry to avoid a fresh inspection.</p>
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
              { label: "Per worker", value: heads > 0 ? formatAmount(Math.round(perHead)) : "-", color: "text-blue-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Where the ESI Act applies (covered establishments), ESIC generally substitutes for WC; WC cover suits employees outside ESI wage limits or non-ESI areas. Rates here are illustrative occupation bands - actual pricing depends on the nature of work and claims history. Confirm statutory applicability with your CA.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">EMI uses the standard reducing-balance formula. Compare the interest cost against the cash-flow benefit - if you can fund the lump sum, paying upfront is cheaper. GST on the premium is already included in the financed amount; financing interest is a separate finance charge.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 22. GST-on-Premium ITC Checker
// ─────────────────────────────────────────────────────────────────────────────
const ITC_RULES: { key: string; label: string; eligible: "yes" | "no" | "cond"; note: string }[] = [
  { key: "fire", label: "Fire / property cover on business premises", eligible: "yes", note: "Used for business - ITC available" },
  { key: "liability", label: "Public / product liability", eligible: "yes", note: "Business liability - ITC available" },
  { key: "pi", label: "Professional indemnity / D&O", eligible: "yes", note: "Business cover - ITC available" },
  { key: "marine", label: "Marine / transit on goods", eligible: "yes", note: "Inward/outward goods - ITC available" },
  { key: "tradecredit", label: "Trade-credit / receivables", eligible: "yes", note: "Business cover - ITC available" },
  { key: "keyman", label: "Key-man term insurance", eligible: "yes", note: "Company-paid business cover - ITC generally available" },
  { key: "wc", label: "Workmen compensation", eligible: "yes", note: "Statutory employer cover - ITC available" },
  { key: "grouphealth", label: "Group health / mediclaim for staff", eligible: "cond", note: "Blocked under s.17(5) unless obligatory under a law (e.g. statutory) - generally not eligible for voluntary cover" },
  { key: "motor", label: "Motor cover on commercial vehicles", eligible: "cond", note: "Eligible if the vehicle itself is eligible (goods transport / >13-seater / business use); blocked for most passenger cars" },
  { key: "personal", label: "Owner's personal life / health", eligible: "no", note: "Personal, not business - no ITC" },
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

// ─────────────────────────────────────────────────────────────────────────────
// 24. Health Top-Up / Super-Top-Up Optimizer
// ─────────────────────────────────────────────────────────────────────────────
function TopUpOptimizer() {
  const [target, setTarget] = useState("2500000");
  const [base, setBase] = useState("500000");
  const [age, setAge] = useState("40");
  const [superTopUp, setSuperTopUp] = useState(true);

  const tgt = parseFloat(target) || 0;
  const baseCover = parseFloat(base) || 0;
  const a = parseFloat(age) || 40;
  // Deductible on a top-up = the base cover (claims above the threshold are paid).
  const deductible = baseCover;
  const topUpCover = Math.max(0, tgt - baseCover);

  const result = useMemo(() => {
    if (tgt <= 0 || baseCover <= 0 || topUpCover <= 0) return null;
    // Indicative annual rates per ₹1L of cover (incl. GST), age-loaded.
    const ageLoad = a < 30 ? 0.75 : a < 45 ? 1.0 : a < 60 ? 1.6 : 2.6;
    // Buying full SI directly is far costlier than base + top-up over a deductible.
    const directRatePer1L = 1900 * ageLoad;
    const baseRatePer1L = 2100 * ageLoad;       // first-rupee cover is pricey
    // Super-top-up (aggregate deductible) is cheaper than a regular top-up (per-claim deductible).
    const topUpRatePer1L = (superTopUp ? 320 : 480) * ageLoad;

    const directPremium = (tgt / 100000) * directRatePer1L;
    const basePremium = (baseCover / 100000) * baseRatePer1L;
    const topUpPremium = (topUpCover / 100000) * topUpRatePer1L;
    const stackedPremium = basePremium + topUpPremium;
    const saving = directPremium - stackedPremium;
    const savingPct = directPremium > 0 ? (saving / directPremium) * 100 : 0;
    return { directPremium, basePremium, topUpPremium, stackedPremium, saving, savingPct };
  }, [tgt, baseCover, topUpCover, a, superTopUp]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Health Top-Up / Super-Top-Up Optimizer</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Reaching a high health cover by stacking a top-up over a smaller base policy is usually far cheaper than buying the full sum insured outright. A super-top-up applies one aggregate deductible across the year, so it beats a regular per-claim top-up.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target total cover (₹)</label>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="2500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base cover / deductible (₹)</label>
            <input type="number" value={base} onChange={e => setBase(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Eldest insured age</label>
            <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="40" className={INP} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={superTopUp} onChange={e => setSuperTopUp(e.target.checked)} className="accent-[var(--color-primary)]" />
              Super-top-up (aggregate deductible)
            </label>
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter a target cover above your base, and a base that is smaller than the target.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Deductible (kicks in above)", value: formatAmount(Math.round(deductible)), color: "text-[var(--color-text)]" },
              { label: "Top-up cover bought", value: formatAmount(Math.round(topUpCover)), color: "text-blue-400" },
              { label: "Buy full SI directly", value: formatAmount(Math.round(result.directPremium)), color: "text-red-400" },
              { label: "Base + top-up stacked", value: formatAmount(Math.round(result.stackedPremium)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {result.saving > 0 && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm text-green-400 flex items-center gap-2"><TrendingDown size={14} /> Stacking saves roughly <strong>{formatCurrency(Math.round(result.saving))}</strong> a year ({result.savingPct.toFixed(0)}% cheaper) versus buying the full {formatAmount(Math.round(tgt))} as a single policy.</p>
            </div>
          )}
          <div className={`${CARD} p-4`}>
            <p className="text-sm font-semibold mb-2">Premium breakdown (incl. 18% GST)</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-[var(--color-border)] pb-2"><span className="text-xs text-[var(--color-muted)]">Base policy ({formatAmount(Math.round(baseCover))})</span><span className="tabular-nums">{formatCurrency(Math.round(result.basePremium))}</span></div>
              <div className="flex justify-between border-b border-[var(--color-border)] pb-2"><span className="text-xs text-[var(--color-muted)]">{superTopUp ? "Super-top-up" : "Top-up"} ({formatAmount(Math.round(topUpCover))})</span><span className="tabular-nums">{formatCurrency(Math.round(result.topUpPremium))}</span></div>
              <div className="flex justify-between pt-1 font-semibold"><span>Total stacked premium</span><span className="tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(result.stackedPremium))}</span></div>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative only - real top-up pricing depends on insurer, waiting periods, room-rent limits and pre-existing conditions. A regular top-up resets its deductible per claim; a super-top-up applies it once for the policy year, so a person with several smaller bills is usually better off with super-top-up. GST on health premium is 18%.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 25. OPD & Wellness Benefit Tracker
// ─────────────────────────────────────────────────────────────────────────────
interface WellnessClaim { id: string; head: string; amount: number; date: string }
const OPD_HEADS = ["Doctor consultation", "Diagnostics / lab", "Pharmacy", "Dental", "Vision / spectacles", "Teleconsult", "Health check-up", "Physiotherapy", "Other"] as const;
function OPDWellnessTracker() {
  const [claims, setClaims] = useFeatureState<WellnessClaim[]>("ins-opd-claims", []);
  const [annualLimit, setAnnualLimit] = useFeatureState<number>("ins-opd-limit", 25000);
  const [head, setHead] = useState<string>(OPD_HEADS[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error("Enter a claim amount"); return; }
    setClaims([...claims, { id: crypto.randomUUID(), head, amount: amt, date }]);
    setAmount("");
    toast.success("Benefit usage logged");
  };

  const used = claims.reduce((s, c) => s + c.amount, 0);
  const remaining = Math.max(0, annualLimit - used);
  const usedPct = annualLimit > 0 ? Math.min(100, (used / annualLimit) * 100) : 0;
  const byHead = useMemo(() => {
    const m: Record<string, number> = {};
    claims.forEach(c => { m[c.head] = (m[c.head] || 0) + c.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [claims]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Stethoscope size={14} className="text-[var(--color-primary)]" /> OPD & Wellness Benefit Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">OPD and wellness riders reimburse outpatient bills - consultations, diagnostics, pharmacy, dental - up to an annual sub-limit. Log spend so you actually exhaust the benefit you paid for.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual OPD limit (₹)</label>
            <input type="number" value={annualLimit || ""} onChange={e => setAnnualLimit(parseFloat(e.target.value) || 0)} placeholder="25000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Benefit head</label>
            <select value={head} onChange={e => setHead(e.target.value)} className={INP}>
              {OPD_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1500" className={INP} />
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual limit", value: formatAmount(Math.round(annualLimit)), color: "text-[var(--color-text)]" },
          { label: "Used", value: formatAmount(Math.round(used)), color: "text-orange-400" },
          { label: "Remaining", value: formatAmount(Math.round(remaining)), color: remaining > 0 ? "text-green-400" : "text-red-400" },
          { label: "Utilisation", value: `${usedPct.toFixed(0)}%`, color: usedPct > 90 ? "text-red-400" : "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4`}>
        <div className="h-2 w-full bg-[var(--color-bg)] rounded-full overflow-hidden mb-3">
          <div className={`h-full ${usedPct > 90 ? "bg-red-400" : usedPct > 60 ? "bg-yellow-400" : "bg-green-400"}`} style={{ width: `${usedPct}%` }} />
        </div>
        {byHead.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No usage logged yet. Track outpatient spend so the wellness rider doesn't go to waste at year-end.</p>
        ) : (
          <div className="space-y-2">
            {byHead.map(([h, v]) => (
              <div key={h} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{h}</span>
                <span className="tabular-nums">{formatCurrency(Math.round(v))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {claims.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Date", "Head", "Amount", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...claims].reverse().map(c => (
                  <tr key={c.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs">{c.date}</td>
                    <td className="px-3 py-2.5">{c.head}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatCurrency(c.amount)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => setClaims(claims.filter(x => x.id !== c.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">OPD/wellness sub-limits, eligible heads and reimbursement rules vary by insurer - keep bills and prescriptions for every entry. Unused benefit typically does not carry forward, so plan check-ups before the policy year ends.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 26. Coverage Adequacy by Life-Stage
// ─────────────────────────────────────────────────────────────────────────────
function LifeStageAdequacy() {
  const [age, setAge] = useState("38");
  const [income, setIncome] = useState("1200000");
  const [dependents, setDependents] = useState("2");
  const [loans, setLoans] = useState("3000000");
  const [savings, setSavings] = useState("1500000");
  const [existingLife, setExistingLife] = useState("2000000");
  const [existingHealth, setExistingHealth] = useState("500000");

  const a = parseFloat(age) || 0;
  const inc = parseFloat(income) || 0;
  const deps = parseFloat(dependents) || 0;
  const ln = parseFloat(loans) || 0;
  const sav = parseFloat(savings) || 0;
  const haveLife = parseFloat(existingLife) || 0;
  const haveHealth = parseFloat(existingHealth) || 0;

  const result = useMemo(() => {
    if (inc <= 0) return null;
    // Term life: income-replacement multiple shrinks with age (fewer earning years left).
    const multiple = a < 30 ? 20 : a < 40 ? 18 : a < 50 ? 14 : a < 60 ? 10 : 6;
    const depLoad = 1 + deps * 0.15;
    const lifeNeed = Math.round(inc * multiple * depLoad + ln - sav);
    const recLife = Math.max(0, lifeNeed);
    const lifeGap = Math.max(0, recLife - haveLife);

    // Health: scales with age band (older = pricier care, more cover needed).
    const healthNeed = a < 35 ? 500000 : a < 45 ? 1000000 : a < 55 ? 1500000 : 2500000;
    const recHealth = healthNeed * (deps > 0 ? 1.5 : 1);
    const healthGap = Math.max(0, recHealth - haveHealth);

    const stage = a < 30 ? "Early career" : a < 40 ? "Family-building" : a < 50 ? "Peak responsibility" : a < 60 ? "Pre-retirement" : "Retirement";
    return { recLife, lifeGap, recHealth, healthGap, stage, multiple };
  }, [a, inc, deps, ln, sav, haveLife, haveHealth]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Coverage Adequacy by Life-Stage</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Your protection need changes with age, dependents and debt. This sizes term-life and health cover for your stage and flags the shortfall against what you already hold.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Age</label>
            <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="38" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual income (₹)</label>
            <input type="number" value={income} onChange={e => setIncome(e.target.value)} placeholder="1200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Dependents</label>
            <input type="number" value={dependents} onChange={e => setDependents(e.target.value)} placeholder="2" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Outstanding loans (₹)</label>
            <input type="number" value={loans} onChange={e => setLoans(e.target.value)} placeholder="3000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Liquid savings (₹)</label>
            <input type="number" value={savings} onChange={e => setSavings(e.target.value)} placeholder="1500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Existing term-life cover (₹)</label>
            <input type="number" value={existingLife} onChange={e => setExistingLife(e.target.value)} placeholder="2000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Existing health cover (₹)</label>
            <input type="number" value={existingHealth} onChange={e => setExistingHealth(e.target.value)} placeholder="500000" className={INP} />
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter your annual income to size the cover you need.</p>
      ) : (
        <>
          <div className={`${CARD} p-4`}>
            <p className="text-sm">Life-stage: <strong className="text-[var(--color-primary)]">{result.stage}</strong> - term cover sized at <strong>{result.multiple}×</strong> income (income-replacement years fall as you age).</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">Recommended term-life cover</p>
              <p className="text-lg font-bold tabular-nums text-blue-400">{formatAmount(result.recLife)}</p>
              <p className={`text-xs mt-1 ${result.lifeGap > 0 ? "text-red-400" : "text-green-400"}`}>{result.lifeGap > 0 ? `Shortfall ${formatAmount(result.lifeGap)}` : "Adequately covered"}</p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">Recommended health cover</p>
              <p className="text-lg font-bold tabular-nums text-blue-400">{formatAmount(result.recHealth)}</p>
              <p className={`text-xs mt-1 ${result.healthGap > 0 ? "text-red-400" : "text-green-400"}`}>{result.healthGap > 0 ? `Shortfall ${formatAmount(result.healthGap)}` : "Adequately covered"}</p>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A rule-of-thumb planner, not financial advice. Term-life need = income × age-based multiple + loans − liquid savings; health need scales with age band and dependents. Review after major life events (marriage, child, new loan). Buy through an IRDAI-licensed insurer.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 27. Riders Comparator
// ─────────────────────────────────────────────────────────────────────────────
interface RiderRow { id: string; name: string; premium: number; benefit: number; useful: boolean }
function RidersComparator() {
  const SUGGESTED = [
    "Critical illness", "Accidental death benefit", "Waiver of premium", "Hospital cash daily",
    "Maternity", "OPD / wellness", "Room-rent waiver", "Restore / refill benefit",
  ];
  const [rows, setRows] = useFeatureState<RiderRow[]>("ins-riders", []);
  const [name, setName] = useState(SUGGESTED[0]);
  const [premium, setPremium] = useState("");
  const [benefit, setBenefit] = useState("");

  const add = () => {
    const pr = parseFloat(premium) || 0;
    const bn = parseFloat(benefit) || 0;
    if (!name.trim() || pr <= 0) { toast.error("Enter a rider name and annual premium"); return; }
    setRows([...rows, { id: crypto.randomUUID(), name: name.trim(), premium: pr, benefit: bn, useful: true }]);
    setPremium(""); setBenefit("");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, useful: !r.useful } : r));

  const usefulRows = rows.filter(r => r.useful);
  const totalPremium = usefulRows.reduce((s, r) => s + r.premium, 0);
  const totalBenefit = usefulRows.reduce((s, r) => s + r.benefit, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><GitMerge size={14} className="text-[var(--color-primary)]" /> Riders Comparator</h3>
        <p className="text-xs text-[var(--color-muted)]">Riders bolt extra benefits onto a base policy for a small premium. Compare cost-per-rupee-of-cover and toggle off the ones that aren't worth it for you.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rider</label>
            <input list="rider-suggest" value={name} onChange={e => setName(e.target.value)} placeholder="Critical illness" className={INP} />
            <datalist id="rider-suggest">{SUGGESTED.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual premium (₹)</label>
            <input type="number" value={premium} onChange={e => setPremium(e.target.value)} placeholder="3000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Benefit / cover (₹)</label>
            <input type="number" value={benefit} onChange={e => setBenefit(e.target.value)} placeholder="1000000" className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Add rider
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add riders to compare their cost against the cover they provide.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Riders kept", value: `${usefulRows.length} / ${rows.length}`, color: "text-[var(--color-text)]" },
              { label: "Added premium", value: formatAmount(Math.round(totalPremium)), color: "text-orange-400" },
              { label: "Added cover", value: formatAmount(Math.round(totalBenefit)), color: "text-green-400" },
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
                  <tr>{["Rider", "Premium", "Cover", "Cost / ₹1L cover", "Keep", ""].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const costPer1L = r.benefit > 0 ? r.premium / (r.benefit / 100000) : 0;
                    return (
                      <tr key={r.id} className={`hover:bg-white/2 ${!r.useful ? "opacity-50" : ""}`}>
                        <td className="px-3 py-2.5 font-medium">{r.name}</td>
                        <td className="px-3 py-2.5 tabular-nums text-orange-400">{formatCurrency(r.premium)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{r.benefit > 0 ? formatAmount(r.benefit) : "-"}</td>
                        <td className="px-3 py-2.5 tabular-nums">{costPer1L > 0 ? formatCurrency(Math.round(costPer1L)) : "-"}</td>
                        <td className="px-3 py-2.5">
                          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="checkbox" checked={r.useful} onChange={() => toggle(r.id)} className="accent-[var(--color-primary)]" />
                          </label>
                        </td>
                        <td className="px-3 py-2.5 text-right">
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
      <p className="text-[10px] text-[var(--color-muted)]">A lower cost-per-₹1L-of-cover means better value, but weigh it against how likely you are to use the rider and its exclusions/waiting periods. Some riders (e.g. critical illness) pay a lump sum on diagnosis rather than reimbursing bills, so the "cover" column isn't directly comparable across types.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 28. Insurance TCO (premium + deductible + co-insurance)
// ─────────────────────────────────────────────────────────────────────────────
function InsuranceTCO() {
  const [premium, setPremium] = useState("60000");
  const [deductible, setDeductible] = useState("25000");
  const [coinsurancePct, setCoinsurancePct] = useState("10");
  const [expectedClaim, setExpectedClaim] = useState("400000");
  const [claimProb, setClaimProb] = useState("20");
  const [years, setYears] = useState("3");

  const prem = parseFloat(premium) || 0;
  const ded = parseFloat(deductible) || 0;
  const coins = (parseFloat(coinsurancePct) || 0) / 100;
  const claim = parseFloat(expectedClaim) || 0;
  const prob = (parseFloat(claimProb) || 0) / 100;
  const yrs = Math.max(1, parseFloat(years) || 1);

  // Expected out-of-pocket on a claim: deductible + co-insurance share of the amount above the deductible.
  const aboveDed = Math.max(0, claim - ded);
  const oopIfClaim = ded + aboveDed * coins;
  const annualPremium = prem;
  const expectedAnnualOOP = prob * oopIfClaim;
  const annualTCO = annualPremium + expectedAnnualOOP;
  const totalTCO = annualTCO * yrs;
  const insurerPays = Math.max(0, claim - oopIfClaim);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Insurance Total Cost of Ownership</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">The sticker premium isn't the whole cost. Your true outlay = premium + the deductible and co-insurance you'd bear on a claim. This blends them by your expected claim frequency.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual premium (₹, incl. GST)</label>
            <input type="number" value={premium} onChange={e => setPremium(e.target.value)} placeholder="60000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deductible / excess (₹)</label>
            <input type="number" value={deductible} onChange={e => setDeductible(e.target.value)} placeholder="25000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Co-insurance / co-pay (%)</label>
            <input type="number" value={coinsurancePct} onChange={e => setCoinsurancePct(e.target.value)} placeholder="10" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Typical claim size (₹)</label>
            <input type="number" value={expectedClaim} onChange={e => setExpectedClaim(e.target.value)} placeholder="400000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Claim probability / year (%)</label>
            <input type="number" value={claimProb} onChange={e => setClaimProb(e.target.value)} placeholder="20" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Horizon (years)</label>
            <input type="number" value={years} onChange={e => setYears(e.target.value)} placeholder="3" className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Out-of-pocket if you claim", value: formatAmount(Math.round(oopIfClaim)), color: "text-orange-400" },
          { label: "Insurer pays on that claim", value: formatAmount(Math.round(insurerPays)), color: "text-green-400" },
          { label: "Expected annual TCO", value: formatAmount(Math.round(annualTCO)), color: "text-[var(--color-text)]" },
          { label: `${yrs}-year TCO`, value: formatAmount(Math.round(totalTCO)), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-2">How the annual cost splits</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-[var(--color-border)] pb-2"><span className="text-xs text-[var(--color-muted)]">Premium (certain)</span><span className="tabular-nums">{formatCurrency(Math.round(annualPremium))}</span></div>
          <div className="flex justify-between border-b border-[var(--color-border)] pb-2"><span className="text-xs text-[var(--color-muted)]">Expected out-of-pocket ({(prob * 100).toFixed(0)}% × {formatAmount(Math.round(oopIfClaim))})</span><span className="tabular-nums">{formatCurrency(Math.round(expectedAnnualOOP))}</span></div>
          <div className="flex justify-between pt-1 font-semibold"><span>Expected total per year</span><span className="tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(annualTCO))}</span></div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A higher deductible cuts premium but raises what you pay on a claim - use this to find the trade-off that minimises expected total cost at your real claim frequency. Co-insurance/co-pay applies to the amount above the deductible. This is an expected-value model, not a guarantee of any single year's cost.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 29. Surrender-Value Estimator (ULIP / endowment)
// ─────────────────────────────────────────────────────────────────────────────
function SurrenderValueEstimator() {
  const [planType, setPlanType] = useState<"endowment" | "ulip">("endowment");
  const [annualPremium, setAnnualPremium] = useState("100000");
  const [policyTerm, setPolicyTerm] = useState("20");
  const [paidYears, setPaidYears] = useState("4");
  const [fundValue, setFundValue] = useState("420000");

  const ap = parseFloat(annualPremium) || 0;
  const term = Math.max(1, parseFloat(policyTerm) || 1);
  const paid = Math.max(0, parseFloat(paidYears) || 0);
  const fund = parseFloat(fundValue) || 0;

  const result = useMemo(() => {
    const totalPaid = ap * paid;
    if (planType === "ulip") {
      // ULIPs have a 5-year lock-in; surrender before that moves to a discontinuance fund.
      const locked = paid < 5;
      const value = locked ? Math.max(0, fund - Math.min(6000, fund * 0.06)) : fund; // discontinuance charge cap
      return { totalPaid, surrenderValue: Math.round(value), locked, gsv: 0, factorPct: 0 };
    }
    // Traditional endowment: Guaranteed Surrender Value = GSV factor × premiums paid (ex first year & extras).
    // No GSV until 2 full years' premiums are paid (per IRDAI norms for limited/regular pay).
    if (paid < 2) return { totalPaid, surrenderValue: 0, locked: true, gsv: 0, factorPct: 0 };
    const eligiblePremiums = ap * (paid - 1); // first year's premium excluded
    // GSV factor rises with the proportion of term elapsed: ~30% early, up to ~90% near maturity.
    const ratio = paid / term;
    const factorPct = ratio < 0.2 ? 30 : ratio < 0.4 ? 50 : ratio < 0.6 ? 65 : ratio < 0.8 ? 80 : 90;
    const gsv = Math.round(eligiblePremiums * (factorPct / 100));
    return { totalPaid, surrenderValue: gsv, locked: false, gsv, factorPct };
  }, [planType, ap, term, paid, fund]);

  const loss = result.totalPaid - result.surrenderValue;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Surrender-Value Estimator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Thinking of exiting an endowment or ULIP early? Estimate what you'd get back versus what you've paid in, so you can decide between surrender, paid-up or staying invested.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Plan type</label>
            <select value={planType} onChange={e => setPlanType(e.target.value as "endowment" | "ulip")} className={INP}>
              <option value="endowment">Traditional / endowment</option>
              <option value="ulip">ULIP (market-linked)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual premium (₹)</label>
            <input type="number" value={annualPremium} onChange={e => setAnnualPremium(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Policy term (years)</label>
            <input type="number" value={policyTerm} onChange={e => setPolicyTerm(e.target.value)} placeholder="20" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Years premium paid</label>
            <input type="number" value={paidYears} onChange={e => setPaidYears(e.target.value)} placeholder="4" className={INP} />
          </div>
          {planType === "ulip" && (
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Current fund value (₹)</label>
              <input type="number" value={fundValue} onChange={e => setFundValue(e.target.value)} placeholder="420000" className={INP} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total premiums paid", value: formatAmount(Math.round(result.totalPaid)), color: "text-[var(--color-text)]" },
          { label: "Estimated surrender value", value: formatAmount(result.surrenderValue), color: "text-blue-400" },
          { label: result.surrenderValue >= result.totalPaid ? "Net gain" : "Net loss on exit", value: formatAmount(Math.round(Math.abs(loss))), color: result.surrenderValue >= result.totalPaid ? "text-green-400" : "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {result.locked && (
        <div className="rounded-lg p-4 border border-yellow-800/40 bg-yellow-950/20">
          <p className="text-sm text-yellow-400 flex items-center gap-2"><AlertTriangle size={14} />
            {planType === "ulip"
              ? "Within the 5-year ULIP lock-in - surrendering now moves the fund to a discontinuance account (charges apply) and you can't withdraw until lock-in ends."
              : "No guaranteed surrender value yet - most traditional plans pay nothing if you exit before two full years of premium. Consider making it paid-up instead."}
          </p>
        </div>
      )}
      {planType === "endowment" && !result.locked && (
        <p className="text-xs text-[var(--color-muted)] px-1">Guaranteed Surrender Value factor applied: <strong className="text-[var(--color-text)]">{result.factorPct}%</strong> of eligible premiums. Special (insurer-declared) surrender value may be higher - ask for a surrender quote before deciding.</p>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Rough estimate only. Endowment surrender uses indicative IRDAI GSV factors (rising with elapsed term, first year's premium excluded, nil before two years). ULIPs carry a 5-year lock-in and discontinuance charges. Always get the exact surrender/paid-up figures from your insurer before acting.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 30. Group vs Individual Cost Compare (health)
// ─────────────────────────────────────────────────────────────────────────────
function GroupVsIndividual() {
  const [heads, setHeads] = useState("8");
  const [avgAge, setAvgAge] = useState("38");
  const [coverPerHead, setCoverPerHead] = useState("500000");
  const [employerSharePct, setEmployerSharePct] = useState("100");

  const n = Math.max(0, parseInt(heads) || 0);
  const age = parseFloat(avgAge) || 38;
  const cover = parseFloat(coverPerHead) || 0;
  const empShare = (parseFloat(employerSharePct) || 0) / 100;

  const result = useMemo(() => {
    if (n === 0 || cover <= 0) return null;
    const ageLoad = age < 30 ? 0.7 : age < 45 ? 1.0 : age < 60 ? 1.6 : 2.6;
    const per1L = cover / 100000;
    // Group cover is community-rated and bought wholesale → cheaper per life than retail individual cover.
    const groupRatePer1L = 900 * ageLoad;
    const individualRatePer1L = 1450 * ageLoad; // retail loads acquisition + medical underwriting
    const groupNet = n * per1L * groupRatePer1L;
    const individualNet = n * per1L * individualRatePer1L;
    const groupGross = groupNet * 1.18;
    const individualGross = individualNet * 1.18;
    const saving = individualGross - groupGross;
    const savingPct = individualGross > 0 ? (saving / individualGross) * 100 : 0;
    const employerCost = groupGross * empShare;
    return { groupGross, individualGross, saving, savingPct, employerCost, perHeadGroup: groupGross / n };
  }, [n, age, cover, empShare]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Group vs Individual Cost Compare</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Should you put the team on a group mediclaim or let each person buy their own? Group cover is community-rated and usually cheaper per life, with no individual medical underwriting.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Lives to cover</label>
            <input type="number" value={heads} onChange={e => setHeads(e.target.value)} placeholder="8" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Average age</label>
            <input type="number" value={avgAge} onChange={e => setAvgAge(e.target.value)} placeholder="38" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cover per head (₹ SI)</label>
            <input type="number" value={coverPerHead} onChange={e => setCoverPerHead(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Employer-paid share (%)</label>
            <input type="number" value={employerSharePct} onChange={e => setEmployerSharePct(e.target.value)} placeholder="100" className={INP} />
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter the number of lives and cover per head to compare.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Group plan (gross)", value: formatAmount(Math.round(result.groupGross)), color: "text-green-400" },
              { label: "Individual plans (gross)", value: formatAmount(Math.round(result.individualGross)), color: "text-red-400" },
              { label: "Per head (group, all-in)", value: formatAmount(Math.round(result.perHeadGroup)), color: "text-[var(--color-text)]" },
              { label: "Employer outlay", value: formatAmount(Math.round(result.employerCost)), color: "text-orange-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {result.saving > 0 && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm text-green-400 flex items-center gap-2"><TrendingDown size={14} /> Group cover is about <strong>{formatCurrency(Math.round(result.saving))}</strong> cheaper a year ({result.savingPct.toFixed(0)}% less) than everyone buying individual retail policies - plus it skips per-person medical tests.</p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative comparison. Group rates depend on group size, age mix, claims experience and chosen benefits; individual retail premiums vary by underwriting. Group cover ends when employment ends and may lack portability - many teams pair a small individual base with group cover. GST on health premium is 18%.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Policy Renewal Planner - month-by-month renewal cashflow across register
// ─────────────────────────────────────────────────────────────────────────────
function RenewalPlanner() {
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const today = new Date();

  const months = useMemo(() => {
    const buckets: { key: string; label: string; total: number; items: Policy[] }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy"), total: 0, items: [] });
    }
    policies.forEach(p => {
      if (!p.renewalDate) return;
      let rd: Date;
      try { rd = parseISO(p.renewalDate); } catch { return; }
      const key = format(rd, "yyyy-MM");
      const bucket = buckets.find(b => b.key === key);
      if (bucket) { bucket.total += p.premium; bucket.items.push(p); }
    });
    return buckets;
  }, [policies, today]);

  const total = months.reduce((s, m) => s + m.total, 0);
  const peak = months.reduce((mx, m) => (m.total > mx.total ? m : mx), months[0]);
  const maxBar = Math.max(1, ...months.map(m => m.total));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Multi-Policy Renewal Planner</h3>
        <p className="text-xs text-[var(--color-muted)]">A rolling 12-month view of when every policy in your register falls due, so you can smooth premium outflow and avoid a renewal pile-up. Add renewal dates and premiums in the Policy Register.</p>
      </div>

      {policies.filter(p => p.renewalDate && p.premium > 0).length === 0 ? (
        <div className={`${CARD} border-dashed p-10 text-center`}>
          <CalendarClock size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">Nothing to plan yet</p>
          <p className="text-xs text-[var(--color-muted)]">Add policies with a renewal date and annual premium to map the next 12 months of renewals.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Renewals (next 12 mo)", value: `${months.reduce((s, m) => s + m.items.length, 0)}`, color: "text-[var(--color-text)]" },
              { label: "Premium due (12 mo)", value: formatAmount(Math.round(total)), color: "text-orange-400" },
              { label: "Peak month", value: peak && peak.total > 0 ? `${peak.label}` : "-", color: "text-yellow-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-5 space-y-2`}>
            {months.map(m => (
              <div key={m.key} className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-muted)] w-20 shrink-0">{m.label}</span>
                <div className="flex-1 h-5 bg-[var(--color-bg)] rounded overflow-hidden">
                  <div className="h-full bg-[var(--color-primary)] rounded" style={{ width: `${(m.total / maxBar) * 100}%` }} />
                </div>
                <span className="text-xs tabular-nums w-24 text-right">{m.total > 0 ? formatAmount(Math.round(m.total)) : "-"}</span>
                <span className="text-[10px] text-[var(--color-muted)] w-10 text-right">{m.items.length || ""}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A clustered renewal month strains cashflow - consider asking insurers to align or stagger renewal dates, or move some covers to monthly premium EMI. Lapsing to save cash in a peak month risks fresh underwriting and loss of continuity benefits.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sum-Insured Inflation Indexer - project cover forward to beat under-insurance
// ─────────────────────────────────────────────────────────────────────────────
function SumInsuredInflationIndexer() {
  const [currentSI, setCurrentSI] = useState("5000000");
  const [inflationPct, setInflationPct] = useState("6");
  const [years, setYears] = useState("5");
  const [lastRevalued, setLastRevalued] = useState("0");

  const si = parseFloat(currentSI) || 0;
  const infl = parseFloat(inflationPct) || 0;
  const yrs = Math.max(0, Math.min(20, parseFloat(years) || 0));
  const elapsed = Math.max(0, parseFloat(lastRevalued) || 0);

  const rows = useMemo(() => {
    const out: { year: number; indexed: number }[] = [];
    for (let y = 0; y <= yrs; y++) out.push({ year: y, indexed: si * Math.pow(1 + infl / 100, y) });
    return out;
  }, [si, infl, yrs]);

  // current real replacement value if SI was set `elapsed` years ago and never revised
  const trueValueNow = si * Math.pow(1 + infl / 100, elapsed);
  const shortfall = Math.max(0, trueValueNow - si);
  const shortfallPct = si > 0 ? (shortfall / trueValueNow) * 100 : 0;
  const targetSI = rows.length ? rows[rows.length - 1].indexed : si;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><TrendingDown size={14} className="text-[var(--color-primary)]" /> Sum-Insured Inflation Indexer</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Replacement costs rise every year but a flat sum insured does not - so a policy set years ago quietly becomes under-insurance, triggering the average clause at claim time. Index your cover forward.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current sum insured (₹)</label>
            <input type="number" value={currentSI} onChange={e => setCurrentSI(e.target.value)} placeholder="5000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cost inflation % p.a.</label>
            <input type="number" step="0.5" value={inflationPct} onChange={e => setInflationPct(e.target.value)} placeholder="6" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Project ahead (years)</label>
            <input type="number" value={years} onChange={e => setYears(e.target.value)} placeholder="5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Years since last revaluation</label>
            <input type="number" value={lastRevalued} onChange={e => setLastRevalued(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {elapsed > 0 && shortfall > 0 && (
        <div className="rounded-lg p-4 border border-yellow-800/40 bg-yellow-950/20">
          <p className="text-sm text-yellow-400 flex items-center gap-2"><AlertTriangle size={14} /> Set {elapsed} year{elapsed === 1 ? "" : "s"} ago, the real replacement value today is about <strong>{formatCurrency(Math.round(trueValueNow))}</strong> - you may be <strong>{shortfallPct.toFixed(0)}%</strong> under-insured ({formatCurrency(Math.round(shortfall))} gap). A claim could be proportionately reduced.</p>
        </div>
      )}

      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Indexed cover projection</p>
          <span className="text-xs text-[var(--color-muted)]">Target in {yrs}y: <strong className="text-[var(--color-primary)]">{formatCurrency(Math.round(targetSI))}</strong></span>
        </div>
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.year} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-1.5 last:border-0 last:pb-0">
              <span className="text-xs text-[var(--color-muted)]">{r.year === 0 ? "Today" : `Year +${r.year}`}</span>
              <span className="tabular-nums">{formatCurrency(Math.round(r.indexed))}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Use a cost-inflation rate that reflects your assets (construction, plant, imported machinery can run well above headline CPI). Some insurers offer an inflation/escalation clause that auto-indexes the sum insured during the policy year - ask at renewal.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insurance Spend Budget - premium outflow vs a target % of revenue
// ─────────────────────────────────────────────────────────────────────────────
function InsuranceSpendBudget() {
  const { store } = useApp();
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const autoRevenue = Math.round(store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const registerPremium = Math.round(policies.reduce((s, p) => s + p.premium, 0));

  const [revenue, setRevenue] = useState("");
  const [targetPct, setTargetPct] = useState("2");
  const [extraSpend, setExtraSpend] = useState("");

  const rev = parseFloat(revenue) || autoRevenue;
  const target = parseFloat(targetPct) || 0;
  const spend = registerPremium + (parseFloat(extraSpend) || 0);
  const budget = rev * (target / 100);
  const actualPct = rev > 0 ? (spend / rev) * 100 : 0;
  const variance = budget - spend; // positive = headroom

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Insurance Spend Budget</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Sets a sensible insurance budget as a share of turnover and checks your actual premium outflow against it. SMBs typically spend 1-3% of revenue on protection - far too low risks ruin, far too high erodes margin.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual revenue (₹){autoRevenue > 0 ? " · auto" : ""}</label>
            <input type="number" value={revenue} onChange={e => setRevenue(e.target.value)} placeholder={autoRevenue > 0 ? String(autoRevenue) : "10000000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target spend (% of revenue)</label>
            <input type="number" step="0.25" value={targetPct} onChange={e => setTargetPct(e.target.value)} placeholder="2" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Extra premiums not in register (₹){registerPremium > 0 ? ` · register has ${formatCurrency(registerPremium)}` : ""}</label>
            <input type="number" value={extraSpend} onChange={e => setExtraSpend(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {rev > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Budget", value: formatAmount(Math.round(budget)), color: "text-blue-400" },
              { label: "Actual spend", value: formatAmount(Math.round(spend)), color: "text-orange-400" },
              { label: "Actual % of revenue", value: `${actualPct.toFixed(2)}%`, color: actualPct > target ? "text-yellow-400" : "text-green-400" },
              { label: variance >= 0 ? "Headroom" : "Over budget", value: formatAmount(Math.round(Math.abs(variance))), color: variance >= 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${variance >= 0 ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${variance >= 0 ? "text-green-400" : "text-red-400"}`}>
              {variance >= 0 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {variance >= 0
                ? `You are within budget with ${formatCurrency(Math.round(variance))} of headroom - room to close coverage gaps before cost becomes a concern.`
                : `You are ${formatCurrency(Math.round(-variance))} over your target budget - review for overlapping cover, high deductibles or over-insured assets before cutting essential protection.`}
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">The right ratio varies by sector - asset-heavy manufacturing runs higher than a services firm. Spending under budget is only good if you are not carrying open coverage gaps; check the Coverage-Gap Analyzer alongside this.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim Document Readiness - checklist to avoid claim repudiation
// ─────────────────────────────────────────────────────────────────────────────
const CLAIM_DOCS = [
  { id: "intimation", label: "Written claim intimation to insurer", note: "Usually within 24-48 hrs of the event" },
  { id: "fir", label: "FIR / police complaint (theft, burglary, fatal accident)", note: "Mandatory for theft and third-party motor" },
  { id: "policy", label: "Policy copy & latest premium receipt", note: "Proves cover was in force on the loss date" },
  { id: "estimate", label: "Repair / replacement estimate or invoices", note: "Quantifies the loss for the surveyor" },
  { id: "photos", label: "Photos / video of the damage", note: "Capture before any cleanup or repair" },
  { id: "purchase", label: "Original purchase bills of damaged assets", note: "Establishes ownership and value" },
  { id: "surveyor", label: "Surveyor report cooperation", note: "Insurer appoints for losses above threshold" },
  { id: "kyc", label: "KYC & bank details for payout", note: "Cancelled cheque / NEFT mandate" },
] as const;

function ClaimReadinessChecklist() {
  const [done, setDone] = useFeatureState<Record<string, boolean>>("ins-claim-readiness", {});
  const toggle = (id: string) => setDone({ ...done, [id]: !done[id] });

  const total = CLAIM_DOCS.length;
  const ready = CLAIM_DOCS.filter(d => done[d.id]).length;
  const pct = Math.round((ready / total) * 100);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileWarning size={14} className="text-[var(--color-primary)]" /> Claim Document Readiness</h3>
        <p className="text-xs text-[var(--color-muted)]">Most rejected claims fail on missing documents or late intimation, not on cover. Work this checklist the moment a loss occurs to give your claim the best chance of a clean settlement.</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "var(--color-success, #22c55e)" : "var(--color-primary)" }} />
          </div>
          <span className="text-xs tabular-nums text-[var(--color-muted)]">{ready}/{total} ready ({pct}%)</span>
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {CLAIM_DOCS.map(d => (
          <button key={d.id} onClick={() => toggle(d.id)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/2 transition-colors">
            {done[d.id]
              ? <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
              : <span className="w-4 h-4 rounded border border-[var(--color-border)] shrink-0 mt-0.5" />}
            <div>
              <p className={`text-sm font-medium ${done[d.id] ? "line-through text-[var(--color-muted)]" : ""}`}>{d.label}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{d.note}</p>
            </div>
          </button>
        ))}
      </div>

      {pct === 100 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> All core documents are in hand - submit the file to your insurer/broker and keep copies of every acknowledgement.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Exact documents vary by claim type and insurer - always check your policy wording and the insurer's claim form. The single biggest avoidable cause of repudiation is delayed intimation; notify first, gather documents next.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Under-Insurance / Average-Clause Checker
// ─────────────────────────────────────────────────────────────────────────────
function UnderInsuranceChecker() {
  const [sumInsured, setSumInsured] = useState("");
  const [actualValue, setActualValue] = useState("");
  const [lossAmount, setLossAmount] = useState("");

  const si = parseFloat(sumInsured) || 0;
  const av = parseFloat(actualValue) || 0;
  const loss = parseFloat(lossAmount) || 0;

  const result = useMemo(() => {
    if (si <= 0 || av <= 0) return null;
    const ratio = si / av; // adequacy ratio
    const underinsured = si < av;
    const coverGap = Math.max(0, av - si);
    // Average clause: payout = loss * (SI / actual value), capped at SI.
    const cappedLoss = Math.min(loss, si);
    const payout = underinsured ? Math.min(loss * ratio, si) : cappedLoss;
    const shortfall = Math.max(0, loss - payout);
    return { ratio, underinsured, coverGap, payout, shortfall };
  }, [si, av, loss]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Under-Insurance / Average-Clause Checker</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          If your sum insured is below the asset's true (reinstatement) value, the average clause reduces every claim in the same proportion - even a partial loss is underpaid. Check your exposure before a loss happens.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sum insured (₹)</label>
            <input type="number" value={sumInsured} onChange={e => setSumInsured(e.target.value)} placeholder="4000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Actual / reinstatement value (₹)</label>
            <input type="number" value={actualValue} onChange={e => setActualValue(e.target.value)} placeholder="5000000" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Hypothetical loss to test (₹)</label>
            <input type="number" value={lossAmount} onChange={e => setLossAmount(e.target.value)} placeholder="1000000" className={INP} />
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Adequacy ratio", value: `${(result.ratio * 100).toFixed(0)}%`, color: result.underinsured ? "text-red-400" : "text-green-400" },
              { label: "Cover gap", value: formatAmount(Math.round(result.coverGap)), color: result.coverGap > 0 ? "text-yellow-400" : "text-green-400" },
              { label: "Claim payout", value: loss > 0 ? formatAmount(Math.round(result.payout)) : "-", color: "text-[var(--color-text)]" },
              { label: "You bear (shortfall)", value: loss > 0 ? formatAmount(Math.round(result.shortfall)) : "-", color: result.shortfall > 0 ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${result.underinsured ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${result.underinsured ? "text-red-400" : "text-green-400"}`}>
              {result.underinsured ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {result.underinsured
                ? `Under-insured by ${(100 - result.ratio * 100).toFixed(0)}% - the average clause will scale down every claim to ${(result.ratio * 100).toFixed(0)}% of the loss.`
                : "Cover is at or above value - the average clause does not bite. Re-index the sum insured each year for inflation."}
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">The average (under-insurance) condition applies to most fire, burglary and property policies in India. Payout = loss × (sum insured ÷ actual value), capped at the sum insured. Insure at reinstatement value and re-index annually to stay protected.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy-Overlap Finder
// ─────────────────────────────────────────────────────────────────────────────
const OVERLAP_GROUPS: { key: string; label: string; types: PolicyType[]; note: string }[] = [
  { key: "property", label: "Property / fire & theft", types: ["Fire & Allied Perils", "Burglary / Theft", "Equipment Breakdown"], note: "Premises, plant and stock may be covered under more than one section - check for double-insurance on the same asset." },
  { key: "liability", label: "Liability", types: ["Public Liability", "Product Liability", "Professional Indemnity", "Directors & Officers"], note: "Overlapping liability wordings can leave you paying twice for the same third-party exposure." },
  { key: "people", label: "Employee benefits", types: ["Group Health (Mediclaim)", "Group Term Life", "Personal Accident"], note: "PA and life sections sometimes duplicate accidental-death benefit." },
  { key: "transit", label: "Goods movement", types: ["Marine / Transit", "Motor (Commercial)"], note: "Goods-in-transit may be insured under both marine and motor carrier sections." },
  { key: "income", label: "Income protection", types: ["Business Interruption", "Trade-Credit"], note: "Both protect cash flow - confirm the perils don't overlap." },
];

function PolicyOverlapFinder() {
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);

  const findings = useMemo(() => {
    return OVERLAP_GROUPS.map(g => {
      const matched = policies.filter(p => g.types.includes(p.type));
      const overlapPremium = matched.reduce((s, p) => s + p.premium, 0);
      return { ...g, matched, overlapPremium };
    }).filter(g => g.matched.length >= 2);
  }, [policies]);

  const totalOverlapPremium = findings.reduce((s, g) => s + g.overlapPremium, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Combine size={14} className="text-[var(--color-primary)]" /> Policy-Overlap Finder</h3>
        <p className="text-xs text-[var(--color-muted)]">Scans your register for policies whose cover may overlap. Double-insurance means you pay two premiums but most policies have a contribution clause, so you can never recover more than the loss - overlap is wasted spend, not extra protection.</p>
      </div>

      {policies.length === 0 ? (
        <div className={`${CARD} border-dashed p-10 text-center`}>
          <Combine size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">No policies to compare</p>
          <p className="text-xs text-[var(--color-muted)]">Add policies in the register and this tool will flag overlapping cover.</p>
        </div>
      ) : findings.length === 0 ? (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> No obvious overlaps - each risk area is held by at most one policy in your register.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Overlapping areas", value: `${findings.length}`, color: "text-yellow-400" },
              { label: "Policies involved", value: `${findings.reduce((s, g) => s + g.matched.length, 0)}`, color: "text-[var(--color-text)]" },
              { label: "Premium in overlap", value: formatAmount(Math.round(totalOverlapPremium)), color: "text-orange-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {findings.map(g => (
              <div key={g.key} className={`${CARD} p-4`}>
                <p className="text-sm font-medium flex items-center gap-2"><GitMerge size={13} className="text-yellow-400" /> {g.label} <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-300">{g.matched.length} policies</span></p>
                <p className="text-[11px] text-[var(--color-muted)] mt-1 mb-2">{g.note}</p>
                <div className="flex flex-wrap gap-2">
                  {g.matched.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-full px-2.5 py-1">
                      {p.insurer} · {p.type}{p.premium > 0 ? ` · ${formatAmount(p.premium)}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">An overlap flag does not always mean waste - sections can genuinely complement each other (e.g. PA top-up over group life). Review the wordings with your broker and consolidate where the cover is truly duplicated.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Business-Package Recommender (by sector)
// ─────────────────────────────────────────────────────────────────────────────
const SECTOR_PACKS: { key: string; label: string; core: PolicyType[]; recommended: PolicyType[] }[] = [
  { key: "retail", label: "Retail / kirana / shop", core: ["Fire & Allied Perils", "Burglary / Theft", "Public Liability"], recommended: ["Group Health (Mediclaim)", "Personal Accident"] },
  { key: "manufacturing", label: "Manufacturing / factory", core: ["Fire & Allied Perils", "Equipment Breakdown", "Product Liability", "Public Liability"], recommended: ["Business Interruption", "Group Health (Mediclaim)", "Marine / Transit"] },
  { key: "trading", label: "Trading / distribution / wholesale", core: ["Fire & Allied Perils", "Marine / Transit", "Trade-Credit"], recommended: ["Burglary / Theft", "Business Interruption"] },
  { key: "services", label: "Professional services / consulting", core: ["Professional Indemnity", "Public Liability", "Cyber"], recommended: ["Group Health (Mediclaim)", "Directors & Officers"] },
  { key: "logistics", label: "Logistics / transport / fleet", core: ["Motor (Commercial)", "Marine / Transit", "Public Liability"], recommended: ["Personal Accident", "Group Health (Mediclaim)"] },
  { key: "hospitality", label: "Hospitality / F&B / restaurant", core: ["Fire & Allied Perils", "Public Liability", "Burglary / Theft"], recommended: ["Product Liability", "Group Health (Mediclaim)", "Personal Accident"] },
];

function BusinessPackageRecommender() {
  const [policies] = useFeatureState<Policy[]>("ins-policies", []);
  const [sector, setSector] = useState(SECTOR_PACKS[0].key);
  const held = useMemo(() => new Set(policies.map(p => p.type)), [policies]);

  const pack = SECTOR_PACKS.find(s => s.key === sector) ?? SECTOR_PACKS[0];
  const line = (type: PolicyType, tier: "core" | "rec") => ({ type, tier, have: held.has(type) });
  const rows = [...pack.core.map(t => line(t, "core")), ...pack.recommended.map(t => line(t, "rec"))];
  const missingCore = rows.filter(r => r.tier === "core" && !r.have).length;
  const haveCount = rows.filter(r => r.have).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Business-Package Recommender</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Pick your sector to see the standard cover package - core lines every business in that trade should carry, plus recommended add-ons. We mark what you already hold from your register.</p>
        <label className="text-xs text-[var(--color-muted)] block mb-1">Sector</label>
        <select value={sector} onChange={e => setSector(e.target.value)} className={INP}>
          {SECTOR_PACKS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Cover lines suggested", value: `${rows.length}`, color: "text-[var(--color-text)]" },
          { label: "Already held", value: `${haveCount}`, color: "text-green-400" },
          { label: "Core gaps", value: `${missingCore}`, color: missingCore > 0 ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {rows.map(r => (
          <div key={r.type} className="flex items-center justify-between gap-3 p-3.5">
            <div className="flex items-center gap-2.5">
              {r.have
                ? <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                : <AlertTriangle size={15} className={`shrink-0 ${r.tier === "core" ? "text-red-400" : "text-yellow-400"}`} />}
              <span className="text-sm">{r.type}</span>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${r.tier === "core" ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "bg-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {r.tier === "core" ? "CORE" : "RECOMMENDED"}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative sector templates only - your actual needs depend on premises, staff, exposure and contracts. Many insurers offer a single "business package / shopkeeper" policy bundling several of these sections at a discount. Bind through an IRDAI-licensed insurer/broker.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee-Coverage Gap
// ─────────────────────────────────────────────────────────────────────────────
function EmployeeCoverageGap() {
  const { store } = useApp();
  const hasPayroll = store.transactions.some(t => t.category === "payroll");

  const [headcount, setHeadcount] = useState("");
  const [health, setHealth] = useState("");
  const [pa, setPa] = useState("");
  const [life, setLife] = useState("");

  const total = parseInt(headcount) || 0;
  const benefits = [
    { key: "health", label: "Group health (mediclaim)", covered: parseInt(health) || 0, why: "Hospitalisation cover - top retention driver for small teams." },
    { key: "pa", label: "Personal accident", covered: parseInt(pa) || 0, why: "Mandatory-grade cover for blue-collar / field staff." },
    { key: "life", label: "Group term life", covered: parseInt(life) || 0, why: "Pays the family if an employee dies in service." },
  ];

  const result = useMemo(() => {
    if (total <= 0) return null;
    return benefits.map(b => {
      const capped = Math.min(b.covered, total);
      const gap = Math.max(0, total - capped);
      return { ...b, capped, gap, pct: (capped / total) * 100 };
    });
  }, [total, health, pa, life]);

  const totalGap = result ? result.reduce((s, b) => s + b.gap, 0) : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><UserPlus size={14} className="text-[var(--color-primary)]" /> Employee-Coverage Gap</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Enter your headcount and how many people each benefit actually covers - this surfaces staff with no protection. {hasPayroll ? "Payroll activity detected on your books, so you likely have employees to cover." : "No payroll detected yet, but you can still model coverage here."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total employees</label>
            <input type="number" min={0} value={headcount} onChange={e => setHeadcount(e.target.value)} placeholder="10" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Covered by health</label>
            <input type="number" min={0} value={health} onChange={e => setHealth(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Covered by PA</label>
            <input type="number" min={0} value={pa} onChange={e => setPa(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Covered by term life</label>
            <input type="number" min={0} value={life} onChange={e => setLife(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className={`rounded-lg p-4 border ${totalGap > 0 ? "border-yellow-800/40 bg-yellow-950/20" : "border-green-800/40 bg-green-950/20"}`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${totalGap > 0 ? "text-yellow-400" : "text-green-400"}`}>
              {totalGap > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {totalGap > 0 ? `${totalGap} uncovered benefit-slots across your team - close these to protect staff and aid retention.` : "Every employee is covered on all three core benefits."}
            </p>
          </div>
          <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
            {result.map(b => (
              <div key={b.key} className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{b.label}</span>
                  <span className={`text-xs tabular-nums ${b.gap > 0 ? "text-yellow-400" : "text-green-400"}`}>{b.capped}/{total} covered{b.gap > 0 ? ` · ${b.gap} gap` : ""}</span>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.gap > 0 ? "var(--color-primary)" : "var(--color-success, #22c55e)" }} />
                </div>
                <p className="text-[11px] text-[var(--color-muted)] mt-1.5">{b.why}</p>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Group cover is available for teams as small as two and is far cheaper per head than individual policies. PA cover for workmen and field staff is often required under contracts and labour norms. Use the Group-Health Estimator to price the shortfall.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Liability-Limit Adequacy
// ─────────────────────────────────────────────────────────────────────────────
function LiabilityLimitAdequacy() {
  const { store } = useApp();
  const autoRevenue = Math.round(store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0));

  const [turnover, setTurnover] = useState("");
  const [footfall, setFootfall] = useState("medium");
  const [currentLimit, setCurrentLimit] = useState("");

  const t = parseFloat(turnover) || autoRevenue;
  const limit = parseFloat(currentLimit) || 0;
  const footfallFactor: Record<string, number> = { low: 0.10, medium: 0.20, high: 0.35 };

  const result = useMemo(() => {
    if (t <= 0) return null;
    // Suggested aggregate liability limit ~ a fraction of turnover scaled by public exposure,
    // floored at ₹10L. Per-event (AOA) limit ~ 25% of aggregate (AOY).
    const factor = footfallFactor[footfall] ?? 0.20;
    const suggestedAOY = Math.max(1000000, Math.round(t * factor));
    const suggestedAOA = Math.round(suggestedAOY * 0.25);
    const adequate = limit >= suggestedAOY;
    const shortfall = Math.max(0, suggestedAOY - limit);
    return { suggestedAOY, suggestedAOA, adequate, shortfall };
  }, [t, footfall, limit]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale3d size={14} className="text-[var(--color-primary)]" /> Liability-Limit Adequacy</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Public/product liability limits are quoted as AOA (any one accident) and AOY (aggregate per year). A single serious third-party injury can exceed a thin limit - size it against your turnover and footfall.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual turnover (₹){autoRevenue > 0 ? " · auto" : ""}</label>
            <input type="number" value={turnover} onChange={e => setTurnover(e.target.value)} placeholder={autoRevenue > 0 ? String(autoRevenue) : "10000000"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Public exposure / footfall</label>
            <select value={footfall} onChange={e => setFootfall(e.target.value)} className={INP}>
              <option value="low">Low - back-office, B2B, no visitors</option>
              <option value="medium">Medium - office/shop with visitors</option>
              <option value="high">High - heavy footfall, factory, public-facing</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current liability limit / AOY (₹)</label>
            <input type="number" value={currentLimit} onChange={e => setCurrentLimit(e.target.value)} placeholder="optional - leave blank if none" className={INP} />
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Suggested AOY (aggregate)", value: formatAmount(result.suggestedAOY), color: "text-[var(--color-primary)]" },
              { label: "Suggested AOA (per event)", value: formatAmount(result.suggestedAOA), color: "text-blue-400" },
              { label: "Shortfall vs current", value: result.shortfall > 0 ? formatAmount(result.shortfall) : "-", color: result.shortfall > 0 ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${result.adequate ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${result.adequate ? "text-green-400" : "text-red-400"}`}>
              {result.adequate ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {limit <= 0
                ? `No limit entered - you appear to carry no liability cover. A ${formatCurrency(result.suggestedAOY)} aggregate limit is a sensible starting point for your profile.`
                : result.adequate
                  ? "Your limit meets the suggested aggregate for your turnover and footfall."
                  : `Your limit looks thin - consider raising the aggregate to about ${formatCurrency(result.suggestedAOY)}.`}
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rule-of-thumb sizing only - real liability limits depend on contracts (landlords/clients often mandate a minimum), industry hazard and legal-cost exposure. Liability claims include defence costs; confirm whether those erode your limit. Bind through an IRDAI-licensed insurer/broker.</p>
    </div>
  );
}

// ── Policy Vault (live, server-backed /api/books/insurance) ──────────────────────
// Persisted policy vault + claims + the headline: sum-insured adequacy computed against LIVE
// ledger values (stock closing value + fixed-asset net book value). Under-insurance flags the
// average-clause shortfall in rupees. Unlike the KV calculator tabs, this reconciles to the books.
interface VaultPolicy { id: string; insurer: string; policy_no: string; type: string; sum_insured: number; premium: number; end_date: string | null; status: string; state: string; days_to_renewal: number | null }
interface Adequacy { live: { stock_value: number; fixed_assets_value: number }; under_insured_count: number; policies: Array<{ id: string; insurer: string; type: string; sum_insured: number; coverable_value?: number; basis?: string; adequacy_pct: number | null; under_insured?: boolean; shortfall?: number; average_clause_note?: string | null; note?: string }> }
function PolicyVaultLive() {
  const [policies, setPolicies] = useState<VaultPolicy[] | null>(null);
  const [adq, setAdq] = useState<Adequacy | null>(null);
  const [f, setF] = useState({ insurer: "", policy_no: "", type: "fire", sum_insured: "", premium: "", end_date: "", asset_covered: "" });
  const load = () => {
    api.get<VaultPolicy[]>("/api/books/insurance/policies").then(setPolicies).catch(e => toast.error((e as Error).message));
    api.get<Adequacy>("/api/books/insurance/adequacy").then(setAdq).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!(Number(f.sum_insured) > 0)) return toast.error("Enter the sum insured");
    try { await api.post("/api/books/insurance/policies", { ...f, sum_insured: Number(f.sum_insured), premium: Number(f.premium) || 0 }); toast.success("Policy added"); setF({ insurer: "", policy_no: "", type: "fire", sum_insured: "", premium: "", end_date: "", asset_covered: "" }); load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const del = async (id: string) => { try { await api.delete(`/api/books/insurance/policies/${id}`); load(); } catch (e) { toast.error((e as Error).message); } };
  const fc = formatCurrency;
  return (
    <div className="space-y-4">
      {adq && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm font-semibold mb-2">Sum-insured adequacy vs live values</p>
          <p className="text-xs text-[var(--color-muted)] mb-2">Live stock: <b className="text-[var(--color-text)]">{fc(adq.live.stock_value)}</b> · Fixed assets (NBV): <b className="text-[var(--color-text)]">{fc(adq.live.fixed_assets_value)}</b> · <span className={adq.under_insured_count ? "text-red-400 font-semibold" : "text-emerald-400"}>{adq.under_insured_count} under-insured</span></p>
          {adq.policies.filter(p => p.adequacy_pct != null).length > 0 && (
            <table className="w-full text-sm rcard"><tbody>
              {adq.policies.filter(p => p.adequacy_pct != null).map(p => (
                <tr key={p.id} className="border-t border-[var(--color-border)]">
                  <td data-label="Policy" className="py-1.5 capitalize">{p.type} · {p.insurer || "—"}</td>
                  <td data-label="Sum insured" className="py-1.5">{fc(p.sum_insured)}</td>
                  <td data-label="Coverable" className="py-1.5">{fc(p.coverable_value || 0)} <span className="text-[10px] text-[var(--color-muted)]">({p.basis})</span></td>
                  <td data-label="Adequacy" className={`py-1.5 font-medium ${p.under_insured ? "text-red-400" : "text-emerald-400"}`}>{p.adequacy_pct}%{p.under_insured && ` · short ${fc(p.shortfall || 0)}`}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      )}
      <div className={`${CARD} p-4 flex flex-wrap gap-2 items-end`}>
        <input className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm" placeholder="Insurer" value={f.insurer} onChange={e => setF({ ...f, insurer: e.target.value })} />
        <input className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm" placeholder="Policy no" value={f.policy_no} onChange={e => setF({ ...f, policy_no: e.target.value })} />
        <select className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
          {["fire", "burglary", "marine", "stock", "machinery", "property", "liability", "group_health", "gpa", "keyman", "wc", "other"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm" type="number" placeholder="Sum insured ₹" value={f.sum_insured} onChange={e => setF({ ...f, sum_insured: e.target.value })} />
        <input className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm" type="number" placeholder="Premium ₹" value={f.premium} onChange={e => setF({ ...f, premium: e.target.value })} />
        <input className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm" type="date" title="Renewal" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} />
        <button onClick={add} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold"><Plus size={13} /> Add policy</button>
      </div>
      {!policies ? <p className="text-xs text-[var(--color-muted)]">Loading…</p> : policies.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No policies in the vault yet.</p>
      ) : (
        <div className={`${CARD} p-4`}>
          <table className="w-full text-sm rcard"><tbody>
            {policies.map(p => (
              <tr key={p.id} className="border-t border-[var(--color-border)]">
                <td data-label="Policy" className="py-1.5 capitalize">{p.type} · {p.insurer || "—"} {p.policy_no && <span className="text-[var(--color-muted)]">#{p.policy_no}</span>}</td>
                <td data-label="Sum insured" className="py-1.5">{fc(p.sum_insured)}</td>
                <td data-label="Premium" className="py-1.5">{fc(p.premium)}</td>
                <td data-label="Renewal" className="py-1.5">{p.end_date || "—"}{p.days_to_renewal != null && p.state === "expiring" && <span className="text-amber-400 text-[11px] ml-1">({p.days_to_renewal}d)</span>}{p.state === "lapsed" && <span className="text-red-400 text-[11px] ml-1">lapsed</span>}</td>
                <td className="py-1.5"><button onClick={() => del(p.id)} className="text-red-400 text-[11px]">Remove</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Adequacy compares each fire/burglary/marine policy to live stock value and each machinery/property policy to fixed-asset net book value — under-insurance triggers the average clause on a claim.</p>
    </div>
  );
}
