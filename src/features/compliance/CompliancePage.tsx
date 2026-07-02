import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeatureState } from "@/hooks/useFeatureState";
import { useApp } from "@/context/AppContext";
import AiInsight from "@/components/ai/AiInsight";
import { computeFinancialSnapshot, gstLatePenalty } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import {
  CalendarCheck, AlertTriangle, ArrowRight, ShieldCheck, FileText, Plus, X,
  FileStack, UserCheck, Users, BookMarked, Store, BadgeCheck, CalendarClock,
  FileSignature, ScrollText, Gavel, Activity, CheckCircle2, Copy,
  Receipt, Award, Ship, Leaf, Flame, HandCoins, GitCompareArrows, UserX, FileClock,
  CalendarRange, Banknote, UserCog, ClipboardCheck, Scale,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, setDate, isBefore, differenceInDays } from "date-fns";
import { useT } from "@/i18n";

type ComplianceTab =
  | "overview" | "roc-prep" | "kyc-dpt3" | "board-agm" | "registers"
  | "shop-license" | "fssai-license" | "labour-calendar" | "templates"
  | "posh-policy" | "penalty-multi" | "health-score"
  | "ptax-tracker" | "ip-renewal" | "iec-compliance" | "pollution-consent"
  | "fire-noc" | "csr-spend" | "rpt-register" | "dir-disqual" | "event-roc"
  | "annual-cal" | "msme-form1" | "sbo-register" | "secretarial-std" | "gst-turnover-recon";

interface ComplianceEvent {
  date: Date;
  label: string;
  kind: "gst" | "tds" | "advance_tax" | "payroll" | "obligation" | "roc";
  amount: number | null;
  path: string;
  note: string;
}

const KIND_STYLE: Record<ComplianceEvent["kind"], { chip: string; label: string }> = {
  gst:         { chip: "bg-blue-900/30 text-blue-400 border-blue-800/40",     label: "GST" },
  tds:         { chip: "bg-purple-900/30 text-purple-400 border-purple-800/40", label: "TDS" },
  advance_tax: { chip: "bg-orange-900/30 text-orange-400 border-orange-800/40", label: "Advance Tax" },
  payroll:     { chip: "bg-green-900/30 text-green-400 border-green-800/40",  label: "PF / ESI" },
  obligation:  { chip: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40", label: "Obligation" },
  roc:         { chip: "bg-pink-900/30 text-pink-400 border-pink-800/40",     label: "ROC / MCA" },
};

export default function CompliancePage() {
  const tr = useT();
  const { store } = useApp();
  const navigate = useNavigate();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [lateDays, setLateDays] = useState(15);
  const [tab, setTab] = useState<ComplianceTab>("overview");

  type Contract = { id: string; name: string; party: string; kind: string; expiry: string; value: number; notes: string };
  const [contracts, setContracts]     = useFeatureState<Contract[]>("contracts", []);
  const [showContractForm, setShowContractForm] = useState(false);
  const [cName,    setCName]    = useState("");
  const [cParty,   setCParty]   = useState("");
  const [cKind,    setCKind]    = useState("Vendor");
  const [cExpiry,  setCExpiry]  = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split("T")[0]; });
  const [cValue,   setCValue]   = useState("");
  const [cNotes,   setCNotes]   = useState("");

  const addContract = () => {
    if (!cName || !cExpiry) return;
    setContracts(prev => [...prev, { id: Math.random().toString(36).slice(2), name: cName, party: cParty, kind: cKind, expiry: cExpiry, value: parseFloat(cValue) || 0, notes: cNotes }]);
    setCName(""); setCParty(""); setCKind("Vendor"); setCValue(""); setCNotes("");
    setShowContractForm(false);
  };

  const hasPayroll = store.transactions.some(t => t.category === "payroll");

  const events = useMemo<ComplianceEvent[]>(() => {
    const now = new Date();
    const out: ComplianceEvent[] = [];

    for (let offset = 0; offset < 6; offset++) {
      const base = addMonths(now, offset);
      const y = base.getFullYear(), m = base.getMonth();
      const push = (day: number, label: string, kind: ComplianceEvent["kind"], amount: number | null, path: string, note: string) => {
        const d = setDate(new Date(y, m, 1), day);
        if (!isBefore(d, now)) out.push({ date: d, label, kind, amount, path, note });
      };

      push(7,  "TDS deposit",  "tds", null, "/tax", "Tax deducted last month must reach the government");
      if (store.firm.gstRegistered ?? true) {
        push(11, "GSTR-1 filing",  "gst", null, "/gst", "Outward supplies return for last month");
        push(20, "GSTR-3B + payment", "gst", offset === 0 ? snap.gstThisMonth.netPayable : null, "/gst", "Summary return - net GST is payable with this");
      }
      if (hasPayroll) push(15, "PF & ESI deposit", "payroll", null, "/payroll", "Statutory payroll contributions for last month");
      if ([2, 5, 8, 11].includes(m)) {
        const inst = snap.advanceTax.find(a => new Date(a.dueDate).getMonth() === m);
        push(15, "Advance tax instalment", "advance_tax", inst?.installment ?? null, "/tax", inst ? `Cumulative ${inst.cumulativePct}% of estimated annual tax` : "Quarterly instalment");
      }
    }

    // ROC / MCA annual filings (fixed calendar, not month-rolling)
    const year = now.getFullYear();
    const rocDates: { day: number; month: number; label: string; note: string }[] = [
      { day: 30, month: 9,  label: "MGT-7 / MGT-7A - Annual Return", note: "File within 60 days of AGM (default: Sep 30). Private companies with turnover ≤₹2 crore use MGT-7A." },
      { day: 30, month: 9,  label: "AOC-4 / AOC-4 XBRL - Financial Statements", note: "File audited financials within 30 days of AGM (default: Sep 30 for Oct AGM deadline)." },
      { day: 30, month: 6,  label: "Form 11 - LLP Annual Return", note: "Annual return for LLPs - due June 30 every year." },
      { day: 30, month: 9,  label: "Form 8 - LLP Statement of Accounts", note: "LLP statement of accounts and solvency - due Oct 30 (offset 30 days after Oct 31 FY end)." },
      { day: 31, month: 3,  label: "DIR-3 KYC - Director KYC", note: "Annual KYC for every DIN holder - due March 31." },
      { day: 30, month: 11, label: "MSME Form-1 - Outstanding Payments Disclosure", note: "Half-yearly return: payments outstanding >45 days to MSME vendors (Apr-Sep due Oct 31, Oct-Mar due Apr 30)." },
    ];
    rocDates.forEach(({ day, month, label, note }) => {
      const d = new Date(year, month, day);
      if (!isBefore(d, now)) out.push({ date: d, label, kind: "roc", amount: null, path: "/compliance", note });
      // Also add next year's if it's already past
      else {
        const next = new Date(year + 1, month, day);
        out.push({ date: next, label, kind: "roc", amount: null, path: "/compliance", note });
      }
    });

    // User-defined obligations
    store.obligations.forEach(o => {
      const d = new Date(o.dueDate);
      if (differenceInDays(d, new Date()) >= -90) {
        out.push({ date: d, label: o.name, kind: "obligation", amount: o.amount, path: "/forecast", note: `${o.type} obligation` });
      }
    });

    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [store.obligations, store.firm.gstRegistered, hasPayroll, snap.gstThisMonth.netPayable, snap.advanceTax]);

  const next30 = events.filter(e => differenceInDays(e.date, new Date()) <= 30);
  const cashDue30 = next30.reduce((s, e) => s + (e.amount ?? 0), 0);
  const overdueObligations = events.filter(e => isBefore(e.date, new Date()));

  const penalty = gstLatePenalty(snap.gstThisMonth.netPayable, lateDays);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><CalendarCheck size={18} className="text-[var(--color-primary)]" /> {tr("comp.title")}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {tr("comp.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([
          ["overview", tr("comp.tab.overview"), CalendarCheck],
          ["roc-prep", tr("comp.tab.rocPrep"), FileStack],
          ["kyc-dpt3", tr("comp.tab.kycDpt3"), UserCheck],
          ["board-agm", tr("comp.tab.boardAgm"), Users],
          ["registers", tr("comp.tab.registers"), BookMarked],
          ["shop-license", tr("comp.tab.shopLicense"), Store],
          ["fssai-license", tr("comp.tab.fssai"), BadgeCheck],
          ["labour-calendar", tr("comp.tab.labourCal"), CalendarClock],
          ["templates", "Agreement Templates", FileSignature],
          ["posh-policy", "POSH / Policies", ScrollText],
          ["penalty-multi", "Penalty Estimator", Gavel],
          ["health-score", "Health Score", Activity],
          ["ptax-tracker", "Professional Tax", Receipt],
          ["ip-renewal", "Trademark / IP", Award],
          ["iec-compliance", "Import-Export (IEC)", Ship],
          ["pollution-consent", "Pollution Consent", Leaf],
          ["fire-noc", "Fire / Safety NOC", Flame],
          ["csr-spend", "CSR Spend", HandCoins],
          ["rpt-register", "Related-Party Txns", GitCompareArrows],
          ["dir-disqual", "Director Disqual.", UserX],
          ["event-roc", "Event-Based ROC", FileClock],
          ["annual-cal", "Annual Master Calendar", CalendarRange],
          ["msme-form1", "MSME Form-1 (45-day)", Banknote],
          ["sbo-register", "Beneficial Owner (SBO)", UserCog],
          ["secretarial-std", "Secretarial Standards", ClipboardCheck],
          ["gst-turnover-recon", "GST vs Books Recon", Scale],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {tab === "roc-prep" && <RocAutoPrep />}
      {tab === "kyc-dpt3" && <KycDpt3Tracker />}
      {tab === "board-agm" && <BoardAgmManager />}
      {tab === "registers" && <StatutoryRegisters />}
      {tab === "shop-license" && <ShopLicenseRenewals />}
      {tab === "fssai-license" && <FssaiLicenseTracker />}
      {tab === "labour-calendar" && <LabourLawCalendar />}
      {tab === "templates" && <AgreementTemplateLibrary />}
      {tab === "posh-policy" && <PoshPolicyTracker />}
      {tab === "penalty-multi" && <MultiActPenaltyEstimator />}
      {tab === "health-score" && <ComplianceHealthScore />}
      {tab === "ptax-tracker" && <ProfessionalTaxTracker />}
      {tab === "ip-renewal" && <TrademarkIpRenewal />}
      {tab === "iec-compliance" && <IecComplianceTracker />}
      {tab === "pollution-consent" && <PollutionConsentTracker />}
      {tab === "fire-noc" && <FireNocTracker />}
      {tab === "csr-spend" && <CsrSpendTracker />}
      {tab === "rpt-register" && <RelatedPartyRegister />}
      {tab === "dir-disqual" && <DirectorDisqualChecker />}
      {tab === "event-roc" && <EventBasedRocTracker />}
      {tab === "annual-cal" && <AnnualMasterCalendar />}
      {tab === "msme-form1" && <MsmeForm1Tracker />}
      {tab === "sbo-register" && <BeneficialOwnerRegister />}
      {tab === "secretarial-std" && <SecretarialStandardsChecklist />}
      {tab === "gst-turnover-recon" && <GstTurnoverRecon />}

      {tab === "overview" && <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: tr("comp.kpi.deadlines"), value: `${next30.length}`, sub: "Statutory + your own obligations", color: "text-[var(--color-text)]" },
          { label: tr("comp.kpi.cashDue"), value: formatAmount(cashDue30), sub: "Known amounts only", color: cashDue30 > snap.cash ? "text-red-400" : "text-yellow-400" },
          { label: tr("comp.kpi.gstPayable"), value: formatAmount(snap.gstThisMonth.netPayable), sub: `Output ${formatAmount(snap.gstThisMonth.outputTax)} − ITC ${formatAmount(snap.gstThisMonth.inputCredit)}`, color: "text-blue-400" },
          { label: tr("comp.kpi.estAnnualTax"), value: formatAmount(snap.advanceTax[3]?.cumulativeTax ?? 0), sub: "25% on estimated profit", color: "text-orange-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <AiInsight
        collapsed
        title="✨ AI insight"
        question="Which compliance items are most urgent, and what's at risk (interest, late fees, penalties) if I miss the nearest deadlines? Prioritise by cash impact and how soon they fall due."
        context={{
          deadlinesNext30: next30.length,
          cashDueNext30: cashDue30,
          cashOnHand: snap.cash,
          overdueCount: overdueObligations.length,
          gstThisMonth: snap.gstThisMonth,
          estAnnualTax: snap.advanceTax[3]?.cumulativeTax ?? 0,
          gstRegistered: store.firm.gstRegistered ?? false,
          upcoming: next30.map(e => ({ label: e.label, kind: e.kind, date: e.date.toISOString().split("T")[0], inDays: differenceInDays(e.date, new Date()), amount: e.amount })).slice(0, 20),
        }}
      />

      {!store.firm.gstRegistered && (
        <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm flex items-center gap-3">
            <ShieldCheck size={15} className="text-yellow-400 shrink-0" />
            Your firm isn't marked GST-registered. Above ₹40L turnover (₹20L for services) registration is mandatory.
          </p>
          <button onClick={() => navigate("/settings")} className="text-xs text-yellow-300 border border-yellow-800/40 bg-yellow-900/30 px-3 py-1.5 rounded-lg whitespace-nowrap hover:bg-yellow-900/50">
            Update firm profile →
          </button>
        </div>
      )}

      {overdueObligations.length > 0 && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={15} className="text-red-400 shrink-0" />
          <p className="text-sm">{overdueObligations.length} obligation(s) past due - interest and late fees are accruing.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar list */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden lg:col-span-2">
          <div className="px-5 py-3 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold">Next 6 Months</p>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-[460px] overflow-y-auto">
            {events.length === 0 && <p className="p-6 text-sm text-[var(--color-muted)] text-center">{tr("comp.empty")}</p>}
            {events.map((e, i) => {
              const days = differenceInDays(e.date, new Date());
              const urgent = days <= 7;
              const s = KIND_STYLE[e.kind];
              return (
                <button key={i} onClick={() => navigate(e.path)} className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/2 transition-colors">
                  <div className="w-12 text-center shrink-0">
                    <p className={`text-lg font-bold leading-none ${urgent ? "text-red-400" : "text-[var(--color-text)]"}`}>{format(e.date, "d")}</p>
                    <p className="text-[10px] text-[var(--color-muted)] uppercase">{format(e.date, "MMM")}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{e.label}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${s.chip}`}>{s.label}</span>
                    </div>
                    <p className="text-[10px] text-[var(--color-muted)] truncate">{e.note}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {e.amount !== null && e.amount > 0 && <p className="text-sm font-semibold tabular-nums">{formatAmount(e.amount)}</p>}
                    <p className={`text-[10px] ${urgent ? "text-red-400 font-semibold" : "text-[var(--color-muted)]"}`}>
                      {days < 0 ? `${-days}d overdue` : days === 0 ? "Today" : `in ${days}d`}
                    </p>
                  </div>
                  <ArrowRight size={12} className="text-[var(--color-muted)] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {/* Advance tax */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Advance Tax (FY)</p>
              <button onClick={() => navigate("/tax")} className="text-[10px] text-[var(--color-primary)] hover:underline">Tax Autopilot →</button>
            </div>
            <div className="space-y-2.5">
              {snap.advanceTax.map(a => (
                <div key={a.label} className="flex items-center justify-between text-sm">
                  <div>
                    <span className={a.status === "paid_window" ? "text-[var(--color-muted)]" : ""}>{a.label}</span>
                    <span className="text-[10px] text-[var(--color-muted)] ml-2">{a.cumulativePct}% cum.</span>
                  </div>
                  <span className={`tabular-nums font-semibold ${a.status === "paid_window" ? "text-[var(--color-muted)]" : "text-orange-400"}`}>
                    {formatAmount(a.installment)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--color-muted)] mt-3 pt-3 border-t border-[var(--color-border)]">
              Based on estimated annual profit of {formatAmount(snap.estAnnualProfit)} at 25% corporate rate. Missing an instalment costs 1%/month interest (§234C).
            </p>
          </div>

          {/* Penalty estimator */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-1">Cost of Filing Late</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">If this month's GSTR-3B slips by <strong className="text-[var(--color-text)]">{lateDays} days</strong>:</p>
            <input type="range" min={1} max={90} value={lateDays} onChange={e => setLateDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)] mb-3" />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Late fee (₹50/day)</span><span className="tabular-nums">{formatCurrency(penalty.lateFee)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Interest @18% p.a.</span><span className="tabular-nums">{formatCurrency(penalty.interest)}</span></div>
              <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
                <span className="font-semibold">Total penalty</span>
                <span className="font-bold tabular-nums text-red-400">{formatCurrency(penalty.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contract Expiry Tracker */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Contract Expiry Tracker</p>
            {contracts.filter(c => differenceInDays(new Date(c.expiry), new Date()) <= 30 && differenceInDays(new Date(c.expiry), new Date()) >= 0).length > 0 && (
              <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">
                {contracts.filter(c => differenceInDays(new Date(c.expiry), new Date()) <= 30 && differenceInDays(new Date(c.expiry), new Date()) >= 0).length} expiring soon
              </span>
            )}
          </div>
          <button onClick={() => setShowContractForm(f => !f)}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2.5 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/10">
            <Plus size={11} /> Add contract
          </button>
        </div>

        {showContractForm && (
          <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <input value={cName} onChange={e=>setCName(e.target.value)} placeholder="Contract name *"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <input value={cParty} onChange={e=>setCParty(e.target.value)} placeholder="Counterparty"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <select value={cKind} onChange={e=>setCKind(e.target.value)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
                {["Vendor","Customer","Employment","Lease/Rent","Service","NDA","Loan","Insurance","Other"].map(k => <option key={k}>{k}</option>)}
              </select>
              <input type="date" value={cExpiry} onChange={e=>setCExpiry(e.target.value)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <input type="number" value={cValue} onChange={e=>setCValue(e.target.value)} placeholder="Contract value (₹)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              <input value={cNotes} onChange={e=>setCNotes(e.target.value)} placeholder="Notes (optional)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div className="flex gap-2">
              <button onClick={addContract} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
              <button onClick={() => setShowContractForm(false)} className="text-xs text-[var(--color-muted)] px-4 py-2 rounded-lg border border-[var(--color-border)] hover:text-[var(--color-text)]">Cancel</button>
            </div>
          </div>
        )}

        {contracts.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted)] text-center">No contracts tracked yet. Add vendor agreements, leases, employment contracts, or NDAs to get expiry alerts.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {contracts
              .slice()
              .sort((a,b) => a.expiry.localeCompare(b.expiry))
              .map(c => {
                const daysLeft = differenceInDays(new Date(c.expiry), new Date());
                const expired  = daysLeft < 0;
                const urgent   = !expired && daysLeft <= 30;
                const warning  = !expired && daysLeft <= 90;
                return (
                  <div key={c.id} className={`flex items-center gap-4 px-5 py-3.5 ${urgent ? "bg-red-950/10" : warning ? "bg-orange-950/10" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{c.name}</p>
                        <span className="text-[9px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full text-[var(--color-muted)]">{c.kind}</span>
                        {expired && <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">Expired</span>}
                        {urgent  && <span className="text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800/40 px-1.5 py-0.5 rounded-full font-semibold">Expiring soon</span>}
                      </div>
                      <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.party && `${c.party} · `}Expires {c.expiry}{c.value > 0 ? ` · ${formatCurrency(c.value)}` : ""}{c.notes ? ` · ${c.notes}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${expired ? "text-red-400" : urgent ? "text-orange-400" : warning ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>
                        {expired ? `${-daysLeft}d overdue` : `${daysLeft}d left`}
                      </p>
                    </div>
                    <button onClick={() => setContracts(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* MSME / Udyam Checker */}
      <MsmeChecker />

      {/* Labour Law Checklist */}
      <LabourLawChecklist employeeCount={store.transactions.filter(t=>t.category==="payroll").length > 0 ? 15 : 0} />

      {/* ROC Filing Calendar */}
      <RocFilingCalendar />

      {/* Insurance Calendar */}
      <InsuranceCalendar />
      </>}
    </div>
  );
}

function MsmeChecker() {
  const [plantMachinery, setPlantMachinery] = useState("");
  const [annualTurnover, setAnnualTurnover] = useState("");
  const [udyamNo, setUdyamNo] = useState("");
  const [registered, setRegistered] = useState(false);

  const pm = parseFloat(plantMachinery) || 0;
  const at = parseFloat(annualTurnover) || 0;

  type MsmeCategory = "Micro" | "Small" | "Medium" | "Not MSME";
  const getCategory = (): MsmeCategory => {
    if (pm <= 1000000 && at <= 5000000)   return "Micro";
    if (pm <= 10000000 && at <= 50000000) return "Small";
    if (pm <= 50000000 && at <= 250000000) return "Medium";
    return "Not MSME";
  };
  const category = getCategory();
  const isMsme = category !== "Not MSME";

  const CATEGORY_COLOR: Record<MsmeCategory, string> = {
    Micro: "text-green-400", Small: "text-blue-400", Medium: "text-yellow-400", "Not MSME": "text-red-400",
  };
  const BENEFITS = [
    "Priority lending under PSL (Priority Sector Lending)",
    "Collateral-free loans up to ₹10L (CGTMSE scheme)",
    "Interest subvention schemes (ECLGS, etc.)",
    "45-day payment protection under MSMED Act Sec 15-23",
    "1% stamp duty exemption (state-specific)",
    "Subsidy on ISO certification / barcode / patent",
    "GeM portal registration preference",
    "Delayed payment: 3× bank rate interest on default",
  ];

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc  = formatCurrency;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
        <ShieldCheck size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">MSME / Udyam Registration Checker</p>
        {registered && udyamNo && (
          <span className="text-xs bg-green-950/30 text-green-400 font-semibold px-2 py-0.5 rounded-full">Registered: {udyamNo}</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Plant & Machinery Investment (₹)</label>
            <input type="number" value={plantMachinery} onChange={e => setPlantMachinery(e.target.value)} placeholder="e.g. 500000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual Turnover (₹)</label>
            <input type="number" value={annualTurnover} onChange={e => setAnnualTurnover(e.target.value)} placeholder="e.g. 3000000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Udyam No. (if registered)</label>
            <input value={udyamNo} onChange={e => setUdyamNo(e.target.value)} placeholder="UDYAM-XX-00-0000000" className={inp} />
          </div>
          <div className="flex items-end">
            <button onClick={() => setRegistered(r => !r)}
              className={`w-full py-2 text-xs font-semibold rounded-lg border transition-colors ${registered ? "bg-green-950/30 text-green-400 border-green-800/40" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {registered ? "✓ Registered on Udyam Portal" : "Not Yet Registered"}
            </button>
          </div>
        </div>

        <div className={`rounded-lg p-4 border ${isMsme ? "border-[var(--color-primary)]/40 bg-[var(--color-accent)]" : "border-red-800/40 bg-red-950/20"}`}>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${CATEGORY_COLOR[category]}`}>{category}</span>
            {isMsme && (
              <div className="text-xs text-[var(--color-muted)]">
                <div>P&M: {fc(pm)} · Turnover: {fc(at)}</div>
                {!registered && <div className="text-yellow-400 mt-0.5">⚠ Not registered - register free at udyamregistration.gov.in</div>}
              </div>
            )}
            {!isMsme && <span className="text-xs text-red-400">Exceeds MSME thresholds. Not eligible for MSME benefits.</span>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Category","P&M Limit","Turnover Limit","Your Status"].map(h => (
                  <th key={h} className="text-left font-semibold text-[var(--color-muted)] px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                { cat: "Micro",  pm: 1000000,   at: 5000000   },
                { cat: "Small",  pm: 10000000,  at: 50000000  },
                { cat: "Medium", pm: 50000000,  at: 250000000 },
              ] as const).map(r => {
                const match = category === r.cat;
                return (
                  <tr key={r.cat} className={`border-b border-[var(--color-border)] last:border-0 ${match ? "bg-[var(--color-primary)]/5" : ""}`}>
                    <td className={`px-3 py-2.5 font-semibold ${CATEGORY_COLOR[r.cat]}`}>{r.cat}</td>
                    <td className="px-3 py-2.5">≤ {fc(r.pm)}</td>
                    <td className="px-3 py-2.5">≤ {fc(r.at)}</td>
                    <td className="px-3 py-2.5">{match ? <span className="font-bold text-[var(--color-primary)]">← You</span> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isMsme && (
          <div>
            <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Benefits Available to MSME</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {BENEFITS.map(b => (
                <div key={b} className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
                  <span className="text-green-400 mt-0.5 shrink-0">✓</span>{b}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LabourLawChecklist({ employeeCount }: { employeeCount: number }) {
  const [count, setCount] = useState(employeeCount > 0 ? employeeCount : 10);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  type Act = { id: string; name: string; threshold: number; desc: string; freq: string; risk: "high" | "medium" | "low" };

  const ACTS: Act[] = [
    { id: "pf",       name: "Employees' Provident Fund (EPF)",    threshold: 20, desc: "Mandatory PF @ 12% employee + 12% employer on wages up to ₹15K. Register on EPFO portal.",       freq: "Monthly",   risk: "high" },
    { id: "esi",      name: "Employees' State Insurance (ESI)",    threshold: 10, desc: "ESI @ 0.75% employee + 3.25% employer on wages up to ₹21K. File half-yearly return.",            freq: "Monthly",   risk: "high" },
    { id: "bonus",    name: "Payment of Bonus Act",                threshold: 20, desc: "Minimum 8.33% bonus on ₹7K ceiling (max 20%) to employees earning ≤₹21K/month.",               freq: "Annual",    risk: "high" },
    { id: "gratuity", name: "Payment of Gratuity Act",             threshold: 10, desc: "Gratuity of 15 days salary per year of service after 5 years. Fund or insure obligation.",      freq: "On exit",   risk: "medium" },
    { id: "minwage",  name: "Minimum Wages Act",                   threshold: 1,  desc: "Ensure all employees paid ≥ state minimum wage for their skill category. Revised periodically.", freq: "Ongoing",   risk: "high" },
    { id: "pt",       name: "Professional Tax",                    threshold: 1,  desc: "Deduct state PT from employee salary per applicable slab. Remit to state government.",          freq: "Monthly",   risk: "medium" },
    { id: "maternity",name: "Maternity Benefit Act",               threshold: 10, desc: "26 weeks paid maternity leave. Advance pay before leave, creche facilities if >50 employees.", freq: "As needed", risk: "medium" },
    { id: "shops",    name: "Shops & Establishments Act",          threshold: 1,  desc: "Register shop/office with labour department. Governs working hours, leave, holidays.",          freq: "Annual",    risk: "medium" },
    { id: "lwf",      name: "Labour Welfare Fund",                 threshold: 1,  desc: "State-specific contribution to LWF. Ranges from ₹3-₹60/employee per period.",                  freq: "Monthly",   risk: "low" },
    { id: "factories",name: "Factories Act",                       threshold: 10, desc: "Applicable if using power & ≥10 workers, or ≥20 workers without power. Safety compliance.",   freq: "Ongoing",   risk: "high" },
    { id: "contract", name: "Contract Labour (Regulation)",        threshold: 20, desc: "If engaging contract workers, obtain principal employer registration. Contractor needs licence.", freq: "Ongoing",  risk: "medium" },
    { id: "posh",     name: "POSH Act (Sexual Harassment)",        threshold: 10, desc: "Constitute Internal Complaints Committee. Display policy. Annual report to District Officer.",  freq: "Annual",    risk: "high" },
  ];

  const applicable = ACTS.filter(a => count >= a.threshold);
  const done        = applicable.filter(a => checked.has(a.id)).length;

  const RISK_STYLE: Record<Act["risk"], string> = {
    high:   "bg-red-900/30 text-red-400 border-red-800/40",
    medium: "bg-orange-900/30 text-orange-400 border-orange-800/40",
    low:    "bg-green-900/30 text-green-400 border-green-800/40",
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ShieldCheck size={14} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Labour Law Compliance Checklist</p>
          <span className={`text-xs font-semibold ${done === applicable.length ? "text-green-400" : "text-orange-400"}`}>{done}/{applicable.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)]">Employees:</label>
          <input type="number" min={1} max={500} value={count} onChange={e => setCount(Number(e.target.value))}
            className="w-16 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]" />
        </div>
      </div>

      {applicable.length === 0 ? (
        <p className="p-6 text-sm text-[var(--color-muted)] text-center">Set your employee count above to see applicable labour laws.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {applicable.map(act => (
            <label key={act.id} className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-white/2 transition-colors">
              <input type="checkbox" checked={checked.has(act.id)} onChange={() => toggle(act.id)}
                className="mt-0.5 accent-[var(--color-primary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className={`text-sm font-medium ${checked.has(act.id) ? "line-through text-[var(--color-muted)]" : ""}`}>{act.name}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${RISK_STYLE[act.risk]}`}>{act.risk} risk</span>
                  <span className="text-[9px] bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{act.freq}</span>
                </div>
                <p className="text-xs text-[var(--color-muted)]">{act.desc}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Applies from: {act.threshold} employee{act.threshold > 1 ? "s" : ""}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {done === applicable.length && applicable.length > 0 && (
        <div className="px-5 py-3 bg-green-950/30 border-t border-green-800/40 text-sm text-green-400 flex items-center gap-2">
          <ShieldCheck size={14} /> All {applicable.length} applicable acts checked - review periodically as employee count grows.
        </div>
      )}
    </div>
  );
}

function RocFilingCalendar() {
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  type RocEvent = { title: string; form: string; due: string; entity: string; note: string };
  const EVENTS: RocEvent[] = [
    { title: "Annual Return",             form: "MGT-7 / MGT-7A",  due: `60 days from AGM (by ${fy+1}-11-29)`, entity: "Company",  note: "Within 60 days of AGM. MGT-7A for small companies." },
    { title: "Financial Statements",      form: "AOC-4",           due: `30 days from AGM (by ${fy+1}-10-29)`, entity: "Company",  note: "Balance Sheet, P&L, Cash Flow, Directors' Report." },
    { title: "ADT-1 (Auditor Appoint.)",  form: "ADT-1",           due: `15 days of AGM (by ${fy+1}-10-14)`,  entity: "Company",  note: "File within 15 days of AGM for auditor appointment." },
    { title: "DIR-3 KYC",                 form: "DIR-3 KYC",       due: `30-Sep-${fy+1}`,                      entity: "Director", note: "Annual KYC of all directors having DIN. Penalty ₹5,000 if late." },
    { title: "LLP Annual Return",         form: "Form 11",         due: `30-May-${fy+1}`,                      entity: "LLP",      note: "Within 60 days of end of FY (i.e. by 30-May)." },
    { title: "LLP Financial Statements",  form: "Form 8",          due: `30-Oct-${fy+1}`,                      entity: "LLP",      note: "Statement of Accounts & Solvency - within 30 days of 6 months of FY close." },
    { title: "INC-20A (Business Commencement)", form: "INC-20A",   due: "180 days of incorporation",           entity: "New Co",   note: "Declaration of commencement of business. One-time." },
    { title: "MSME Half-Yearly Return",   form: "MSME-1",          due: `Apr & Oct`,                           entity: "Company",  note: "If ₹45L+ outstanding to MSME suppliers > 45 days." },
  ];

  const getUrgency = (dueStr: string) => {
    const match = dueStr.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return "info";
    const d = new Date(match[0]);
    const days = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (days < 0) return "overdue";
    if (days <= 30) return "urgent";
    if (days <= 90) return "soon";
    return "ok";
  };

  const urgencyStyle: Record<string, string> = {
    overdue: "bg-red-950/30 text-red-400", urgent: "bg-yellow-950/30 text-yellow-400",
    soon: "bg-blue-950/30 text-blue-400", ok: "bg-green-950/30 text-green-400", info: "bg-[var(--color-accent)] text-[var(--color-muted)]",
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
        <CalendarCheck size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">ROC / MCA Filing Calendar - FY {fy}-{(fy+1).toString().slice(2)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Filing","Form","Due Date","Entity","Status","Notes"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map(e => {
              const urg = getUrgency(e.due);
              return (
                <tr key={e.form} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-semibold">{e.title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-primary)]">{e.form}</td>
                  <td className="px-4 py-3 text-xs">{e.due}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{e.entity}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${urgencyStyle[urg]}`}>
                      {urg === "overdue" ? "Overdue" : urg === "urgent" ? "Due Soon" : urg === "soon" ? "Upcoming" : "Scheduled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{e.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type InsurancePolicy = {
  id: string; name: string; type: string; insurer: string;
  premium: number; renewalDate: string; sumInsured: number; notes: string;
};

function InsuranceCalendar() {
  const [policies, setPolicies] = useFeatureState<InsurancePolicy[]>("insurance-policies", []);
  const [showForm, setShowForm]  = useState(false);
  const [iName,  setIName]  = useState("");
  const [iType,  setIType]  = useState("Fire & Burglary");
  const [iInsurer, setIInsurer] = useState("");
  const [iPremium, setIPremium] = useState("");
  const [iRenewal, setIRenewal] = useState("");
  const [iSum,   setISum]   = useState("");
  const [iNotes, setINotes] = useState("");

  const TYPES = ["Fire & Burglary","Shopkeeper","Marine Cargo","Group Health","Group Personal Accident","Directors & Officers","Professional Indemnity","Vehicle Fleet","Workmen Compensation","Cyber Liability","Key Man","Other"];

  const addPolicy = () => {
    if (!iName || !iRenewal) return;
    setPolicies(prev => [...prev, { id: Math.random().toString(36).slice(2), name: iName, type: iType, insurer: iInsurer, premium: parseFloat(iPremium) || 0, renewalDate: iRenewal, sumInsured: parseFloat(iSum) || 0, notes: iNotes }]);
    setIName(""); setIInsurer(""); setIPremium(""); setIRenewal(""); setISum(""); setINotes("");
    setShowForm(false);
  };

  const today = new Date();
  const sorted = [...policies].sort((a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime());
  const totalPremium = policies.reduce((s, p) => s + p.premium, 0);
  const expiring30 = policies.filter(p => {
    const d = differenceInDays(new Date(p.renewalDate), today);
    return d >= 0 && d <= 30;
  });

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc  = formatCurrency;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Insurance Calendar</p>
          {expiring30.length > 0 && (
            <span className="text-xs bg-red-950/40 text-red-400 font-semibold px-2 py-0.5 rounded-full">
              {expiring30.length} renewing soon
            </span>
          )}
        </div>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Plus size={11} /> Add policy
        </button>
      </div>

      {showForm && (
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-accent)]">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input value={iName}    onChange={e => setIName(e.target.value)}    placeholder="Policy name *" className={inp} />
            <select value={iType}   onChange={e => setIType(e.target.value)}    className={inp}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input value={iInsurer} onChange={e => setIInsurer(e.target.value)} placeholder="Insurer / broker" className={inp} />
            <input type="number" value={iPremium} onChange={e => setIPremium(e.target.value)} placeholder="Annual premium (₹)" className={inp} />
            <input type="number" value={iSum}    onChange={e => setISum(e.target.value)}    placeholder="Sum insured (₹)" className={inp} />
            <input type="date"   value={iRenewal} onChange={e => setIRenewal(e.target.value)} className={inp} />
            <input value={iNotes}  onChange={e => setINotes(e.target.value)}   placeholder="Notes (optional)" className={`${inp} md:col-span-3`} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addPolicy} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-[var(--color-muted)] px-4 py-2 rounded-lg border border-[var(--color-border)]">Cancel</button>
          </div>
        </div>
      )}

      {policies.length === 0 ? (
        <p className="p-6 text-sm text-[var(--color-muted)] text-center">No insurance policies tracked. Add fire, health, marine, vehicle or liability policies to get renewal alerts.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 p-4 border-b border-[var(--color-border)]">
            {[
              { label: "Policies",      value: policies.length.toString(),  color: "text-[var(--color-primary)]" },
              { label: "Annual Premium",value: fc(totalPremium),            color: "text-blue-400" },
              { label: "Renewing ≤30d", value: expiring30.length.toString(), color: expiring30.length > 0 ? "text-red-400" : "text-green-400" },
            ].map(c => (
              <div key={c.label} className="text-center">
                <p className="text-xs text-[var(--color-muted)]">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Policy","Type","Insurer","Premium","Sum Insured","Renewal","Status",""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const daysLeft = differenceInDays(new Date(p.renewalDate), today);
                  const expired  = daysLeft < 0;
                  const urgent   = !expired && daysLeft <= 30;
                  const statusCls = expired ? "bg-red-950/30 text-red-400" : urgent ? "bg-yellow-950/30 text-yellow-400" : "bg-green-950/30 text-green-400";
                  const statusLabel = expired ? "Expired" : urgent ? `${daysLeft}d left` : "Active";
                  return (
                    <tr key={p.id} className={`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] ${expired ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3 font-semibold">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{p.type}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{p.insurer || "-"}</td>
                      <td className="px-4 py-3 tabular-nums">{p.premium > 0 ? fc(p.premium) : "-"}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{p.sumInsured > 0 ? fc(p.sumInsured) : "-"}</td>
                      <td className="px-4 py-3 tabular-nums">{p.renewalDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setPolicies(prev => prev.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Shared input class matching the existing `inp` pattern used across this file.
const CINP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// ── #123 ROC Filing Auto-Prep (AOC-4 / MGT-7) ───────────────────────────────────
function RocAutoPrep() {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const fcFy = new Date();
  // FY just closed: if today is in/after April, the most recent completed FY ended 31-Mar of this calendar year.
  const fyEndYear = fcFy.getMonth() >= 3 ? fcFy.getFullYear() : fcFy.getFullYear() - 1;
  const [agm, setAgm] = useState(`${fyEndYear}-09-30`);
  const [entity, setEntity] = useState<"private" | "public" | "opc" | "small">("private");

  const revenue = useMemo(() => store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), [store.transactions]);

  const agmDate = new Date(agm);
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = (d: Date) => format(d, "dd MMM yyyy");
  const days = (d: Date) => differenceInDays(d, new Date());

  // Small company: paid-up ≤ ₹4 cr and turnover ≤ ₹40 cr → MGT-7A, no cash-flow statement, fewer board meetings.
  const isSmall = entity === "small" || entity === "opc";
  const annualReturnForm = isSmall ? "MGT-7A" : "MGT-7";
  const usesXbrl = revenue >= 1000000000; // ₹100 cr turnover → XBRL (indicative; also paid-up ≥ ₹5 cr)

  const filings = [
    { form: usesXbrl ? "AOC-4 XBRL" : "AOC-4", title: "Financial Statements", due: entity === "opc" ? addDays(new Date(`${fyEndYear}-09-27`), 180) : addDays(agmDate, 30), fee: "₹100/day late", note: "Audited Balance Sheet, P&L, board & auditor reports. OPC: 180 days from FY-end (no AGM)." },
    { form: annualReturnForm, title: "Annual Return", due: addDays(agmDate, 60), fee: "₹100/day late", note: `${isSmall ? "Small co/OPC use MGT-7A." : "Signed by director + practising CS for listed/large cos."} Filed within 60 days of AGM.` },
    { form: "ADT-1", title: "Auditor Appointment", due: addDays(agmDate, 15), fee: "₹100/day + ₹300+ MCA", note: "Intimation of auditor appointed/ratified at AGM, within 15 days." },
  ];

  const dataReady = [
    { item: "Total Revenue (turnover)", value: formatCurrency(revenue) },
    { item: "Net Profit / (Loss)", value: formatCurrency(snap.estAnnualProfit ?? 0) },
    { item: "Cash & bank balance", value: formatCurrency(snap.cash ?? 0) },
    { item: "Financial Year", value: `01 Apr ${fyEndYear} → 31 Mar ${(fyEndYear + 1).toString().slice(2)}` },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileStack size={14} className="text-[var(--color-primary)]" /> ROC Filing Auto-Prep - AOC-4 / MGT-7</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Pre-fills annual MCA filing data from your books and computes statutory due dates off your AGM date.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">AGM Date (default: 30 Sep)</label>
            <input type="date" value={agm} onChange={e => setAgm(e.target.value)} className={CINP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Entity Type</label>
            <select value={entity} onChange={e => setEntity(e.target.value as typeof entity)} className={CINP}>
              <option value="private">Private Limited</option>
              <option value="public">Public Limited</option>
              <option value="small">Small Company</option>
              <option value="opc">One Person Company (OPC)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-3">Auto-Filled Filing Data</p>
          <div className="space-y-2">
            {dataReady.map(r => (
              <div key={r.item} className="flex justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.item}</span>
                <span className="tabular-nums font-medium">{r.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-3">Annual return form: <span className="text-[var(--color-primary)] font-semibold">{annualReturnForm}</span> · Financials: <span className="text-[var(--color-primary)] font-semibold">{usesXbrl ? "AOC-4 XBRL" : "AOC-4"}</span></p>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-3">Computed Due Dates</p>
          <div className="space-y-2.5">
            {filings.map(f => {
              const dleft = days(f.due);
              const urgent = dleft >= 0 && dleft <= 30;
              const overdue = dleft < 0;
              return (
                <div key={f.form} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium"><span className="font-mono text-[var(--color-primary)] text-xs">{f.form}</span> · {f.title}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{fmt(f.due)} · {f.fee}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${overdue ? "bg-red-950/30 text-red-400" : urgent ? "bg-yellow-950/30 text-yellow-400" : "bg-green-950/30 text-green-400"}`}>
                    {overdue ? `${-dleft}d overdue` : `${dleft}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-2">Filing Notes</p>
        <div className="space-y-1.5">
          {filings.map(f => (
            <p key={f.form} className="text-xs text-[var(--color-muted)]"><span className="font-mono text-[var(--color-primary)]">{f.form}</span> - {f.note}</p>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Late MCA filing fee is ₹100/day per form with no upper cap. AOC-4: within 30 days of AGM; MGT-7/7A: within 60 days; ADT-1: within 15 days. Figures auto-filled from your books are indicative - reconcile with audited financials before filing.
      </div>
    </div>
  );
}

// ── #124 DIR-3 KYC & DPT-3 Tracker ───────────────────────────────────────────────
type DinHolder = { id: string; name: string; din: string; mode: "DIR-3 KYC" | "DIR-3 KYC-WEB"; done: boolean };
function KycDpt3Tracker() {
  const [holders, setHolders] = useFeatureState<DinHolder[]>("compliance-din-holders", []);
  const [name, setName] = useState("");
  const [din, setDin] = useState("");
  const [mode, setMode] = useState<DinHolder["mode"]>("DIR-3 KYC-WEB");
  // DPT-3 inputs
  const [hasDeposits, setHasDeposits] = useFeatureState<boolean>("compliance-dpt3-applies", false);
  const [exemptAmt, setExemptAmt] = useState("");

  const now = new Date();
  const yr = now.getFullYear();
  // DIR-3 KYC due 30 Sep (for DINs allotted by 31 Mar). DPT-3 due 30 Jun annually.
  const kycDue = new Date(yr, 8, 30);
  const dpt3Due = new Date(yr, 5, 30);
  const kycEffective = isBefore(kycDue, now) ? new Date(yr + 1, 8, 30) : kycDue;
  const dpt3Effective = isBefore(dpt3Due, now) ? new Date(yr + 1, 5, 30) : dpt3Due;

  const add = () => {
    if (!name || !din) { toast.error("Enter director name and DIN"); return; }
    setHolders(prev => [...prev, { id: Math.random().toString(36).slice(2), name, din, mode, done: false }]);
    setName(""); setDin(""); toast.success("Director added");
  };

  const pending = holders.filter(h => !h.done).length;
  const fmt = (d: Date) => format(d, "dd MMM yyyy");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-1 flex items-center gap-2"><UserCheck size={14} className="text-[var(--color-primary)]" /> DIR-3 KYC</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">Annual KYC for every DIN holder. Due {fmt(kycEffective)}. Late filing: DIN deactivated + ₹5,000 reactivation fee.</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Director name" className={CINP} />
            <input value={din} onChange={e => setDin(e.target.value)} placeholder="DIN (8 digits)" className={CINP} />
            <select value={mode} onChange={e => setMode(e.target.value as DinHolder["mode"])} className={CINP}>
              <option value="DIR-3 KYC-WEB">DIR-3 KYC-WEB (no change)</option>
              <option value="DIR-3 KYC">DIR-3 KYC (e-form, details changed)</option>
            </select>
            <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold rounded-lg hover:opacity-90 flex items-center justify-center gap-1"><Plus size={12} /> Add director</button>
          </div>
          {holders.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] text-center py-4">No DIN holders tracked. Add directors to monitor KYC status.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {holders.map(h => (
                <div key={h.id} className="flex items-center gap-3 py-2.5">
                  <button onClick={() => setHolders(prev => prev.map(x => x.id === h.id ? { ...x, done: !x.done } : x))}
                    className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${h.done ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                    {h.done ? "Filed" : "Pending"}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.name}</p>
                    <p className="text-[10px] text-[var(--color-muted)] font-mono">DIN {h.din} · {h.mode}</p>
                  </div>
                  <button onClick={() => setHolders(prev => prev.filter(x => x.id !== h.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          {pending > 0 && <p className="text-[11px] text-yellow-400 mt-2">{pending} director(s) pending KYC - file before {fmt(kycEffective)}.</p>}
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-1 flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> DPT-3 - Return of Deposits</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">Annual return of deposits & exempted deposits (loans from directors, advances) outstanding as on 31 Mar. Due {fmt(dpt3Effective)}.</p>
          <label className="flex items-center gap-2 text-xs cursor-pointer mb-3">
            <input type="checkbox" checked={hasDeposits} onChange={e => setHasDeposits(e.target.checked)} className="accent-[var(--color-primary)]" />
            Company has deposits / exempted loans outstanding as on 31 Mar
          </label>
          {hasDeposits && (
            <div className="mb-3">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Total outstanding (incl. exempted) (₹)</label>
              <input type="number" value={exemptAmt} onChange={e => setExemptAmt(e.target.value)} placeholder="e.g. 2500000" className={CINP} />
              {parseFloat(exemptAmt) > 0 && <p className="text-[11px] text-[var(--color-muted)] mt-2">DPT-3 must report {formatCurrency(parseFloat(exemptAmt))} of outstanding money. Even purely exempted deposits require the return.</p>}
            </div>
          )}
          <div className={`rounded-lg p-3 border text-xs ${hasDeposits ? "bg-yellow-950/20 border-yellow-800/40 text-yellow-300" : "bg-green-950/20 border-green-800/40 text-green-400"}`}>
            {hasDeposits ? `DPT-3 filing required by ${fmt(dpt3Effective)}. Penalty: ₹5,000 + ₹500/day continuing default.` : "No outstanding deposits flagged - DPT-3 may not apply. Re-check at year-end (31 Mar)."}
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        DIR-3 KYC: WEB form if no detail changed, else e-form. DPT-3 covers both deposits and exempted deposits (e.g. director loans) - most private companies must still file the "nil deposit but money outstanding" return. Consult your CS.
      </div>
    </div>
  );
}

// ── #125 Board / AGM Meeting Manager ─────────────────────────────────────────────
type Meeting = {
  id: string; kind: "Board" | "AGM" | "EGM" | "Committee"; date: string;
  agenda: string; minutes: string; resolutions: string; done: boolean;
};
function BoardAgmManager() {
  const [meetings, setMeetings] = useFeatureState<Meeting[]>("compliance-meetings", []);
  const [kind, setKind] = useState<Meeting["kind"]>("Board");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [agenda, setAgenda] = useState("");
  const [resolutions, setResolutions] = useState("");

  const boardCount = meetings.filter(m => m.kind === "Board").length;

  const add = () => {
    if (!date) { toast.error("Pick a meeting date"); return; }
    setMeetings(prev => [...prev, { id: Math.random().toString(36).slice(2), kind, date, agenda, minutes: "", resolutions, done: false }]);
    setAgenda(""); setResolutions(""); toast.success(`${kind} meeting added`);
  };

  const TIMELINES = [
    { rule: "Board meetings - minimum", val: "4 per year (1 per quarter), gap ≤ 120 days", flag: boardCount < 4 },
    { rule: "Board notice", val: "≥ 7 days before meeting (shorter with consent)", flag: false },
    { rule: "AGM - first", val: "Within 9 months of first FY-end", flag: false },
    { rule: "AGM - subsequent", val: "Within 6 months of FY-end; gap ≤ 15 months", flag: false },
    { rule: "AGM notice", val: "≥ 21 clear days to members", flag: false },
    { rule: "Minutes finalised", val: "Within 30 days of meeting; entered in minute book", flag: false },
    { rule: "MGT-14 (special resolutions)", val: "Within 30 days of passing the resolution", flag: false },
  ];

  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Board / AGM Meeting Manager</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log meetings with agenda, resolutions and minutes. Track against Companies Act, 2013 statutory timelines.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <select value={kind} onChange={e => setKind(e.target.value as Meeting["kind"])} className={CINP}>
            {(["Board", "AGM", "EGM", "Committee"] as const).map(k => <option key={k} value={k}>{k} Meeting</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={CINP} />
          <input value={agenda} onChange={e => setAgenda(e.target.value)} placeholder="Agenda items" className={`${CINP} md:col-span-2`} />
          <input value={resolutions} onChange={e => setResolutions(e.target.value)} placeholder="Resolutions passed" className={`${CINP} md:col-span-3`} />
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold rounded-lg hover:opacity-90 flex items-center justify-center gap-1"><Plus size={12} /> Add meeting</button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] text-center py-4">No meetings logged yet.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
            {sorted.map(m => (
              <div key={m.id} className="py-3 flex items-start gap-3">
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-primary)] shrink-0">{m.kind}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{format(new Date(m.date), "dd MMM yyyy")}</p>
                  {m.agenda && <p className="text-[11px] text-[var(--color-muted)]">Agenda: {m.agenda}</p>}
                  {m.resolutions && <p className="text-[11px] text-[var(--color-muted)]">Resolutions: {m.resolutions}</p>}
                  <textarea value={m.minutes} onChange={e => setMeetings(prev => prev.map(x => x.id === m.id ? { ...x, minutes: e.target.value } : x))}
                    placeholder="Minutes of the meeting…" rows={2}
                    className="w-full mt-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                </div>
                <button onClick={() => setMeetings(prev => prev.filter(x => x.id !== m.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-3">Statutory Timelines (Companies Act, 2013)</p>
        <div className="space-y-2">
          {TIMELINES.map(t => (
            <div key={t.rule} className="flex items-start justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
              <div>
                <p className="font-medium text-[var(--color-text)]">{t.rule}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{t.val}</p>
              </div>
              {t.flag && <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-800/40 shrink-0">Action needed</span>}
            </div>
          ))}
        </div>
        {boardCount < 4 && <p className="text-[11px] text-yellow-400 mt-3">Only {boardCount} board meeting(s) logged this cycle - minimum is 4 per year with no gap exceeding 120 days (one-person/small/dormant companies: 2 per year).</p>}
      </div>
    </div>
  );
}

const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// ── #126 STATUTORY REGISTERS ────────────────────────────────────────────────
function StatutoryRegisters() {
  interface Reg { id: string; name: string; form: string; maintained: boolean; updated: string }
  const SEED: Reg[] = [
    { id: "mbr", name: "Register of Members", form: "MGT-1", maintained: false, updated: "" },
    { id: "dir", name: "Register of Directors & KMP", form: "Sec 170", maintained: false, updated: "" },
    { id: "chg", name: "Register of Charges", form: "CHG-7", maintained: false, updated: "" },
    { id: "rpt", name: "Register of Contracts w/ Related Parties", form: "MBP-4", maintained: false, updated: "" },
    { id: "trf", name: "Register of Share Transfers", form: "SH-6", maintained: false, updated: "" },
    { id: "loan", name: "Register of Loans & Investments", form: "MBP-2", maintained: false, updated: "" },
    { id: "dep", name: "Register of Deposits", form: "DPT-2", maintained: false, updated: "" },
  ];
  const [regs, setRegs] = useFeatureState<Reg[]>("compliance-registers", SEED);
  const done = regs.filter(r => r.maintained).length;
  const toggle = (id: string) => setRegs(prev => prev.map(r => r.id === id ? { ...r, maintained: !r.maintained, updated: !r.maintained ? new Date().toISOString().slice(0, 10) : "" } : r));
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><BookMarked size={14} /> Statutory Registers (Companies Act, 2013)</h3>
          <span className="text-xs text-[var(--color-muted)]">{done}/{regs.length} maintained</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {regs.map(r => (
            <div key={r.id} className="py-2.5 flex items-center gap-3">
              <button onClick={() => toggle(r.id)} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${r.maintained ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-bg)]" : "border-[var(--color-border)]"}`}>{r.maintained && <CheckCircle2 size={12} />}</button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{r.form}{r.maintained && r.updated ? ` · updated ${r.updated}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-3">Statutory registers must be kept at the registered office and updated within the prescribed time of each event. Mark maintained once entries are current.</p>
      </div>
    </div>
  );
}

interface LicRow { id: string; name: string; authority: string; number: string; expiry: string }
function LicenseTracker({ storeKey, title, Icon, seedAuthority }: { storeKey: string; title: string; Icon: typeof Store; seedAuthority: string }) {
  const [lics, setLics] = useFeatureState<LicRow[]>(storeKey, []);
  const [f, setF] = useState<{ name: string; authority: string; number: string; expiry: string }>({ name: "", authority: seedAuthority, number: "", expiry: "" });
  const add = () => {
    if (!f.name || !f.expiry) { toast.error("Name and expiry date are required"); return; }
    setLics(prev => [{ id: `lic-${Date.now()}`, ...f }, ...prev]);
    setF({ name: "", authority: seedAuthority, number: "", expiry: "" });
    toast.success("License added");
  };
  const sorted = [...lics].sort((a, b) => a.expiry.localeCompare(b.expiry));
  const band = (days: number) => days < 0 ? "bg-red-900/30 text-red-400 border-red-800/40" : days <= 30 ? "bg-red-900/30 text-red-400 border-red-800/40" : days <= 60 ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]";
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Icon size={14} /> {title}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input className={INP} placeholder="License name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input className={INP} placeholder="Authority" value={f.authority} onChange={e => setF({ ...f, authority: e.target.value })} />
          <input className={INP} placeholder="License / Reg. no." value={f.number} onChange={e => setF({ ...f, number: e.target.value })} />
          <input type="date" className={INP} value={f.expiry} onChange={e => setF({ ...f, expiry: e.target.value })} />
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium bg-[var(--color-primary)] text-[var(--color-bg)]"><Plus size={12} /> Add license</button>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        {sorted.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-4">No licenses tracked yet.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {sorted.map(l => {
              const days = differenceInDays(new Date(l.expiry), new Date());
              return (
                <div key={l.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">{[l.authority, l.number].filter(Boolean).join(" · ")} · expires {format(new Date(l.expiry), "dd MMM yyyy")}</p>
                  </div>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${band(days)}`}>{days < 0 ? `Expired ${-days}d ago` : `${days}d left`}</span>
                  <button onClick={() => setLics(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── #127 SHOP & ESTABLISHMENT / TRADE LICENSE RENEWALS ──────────────────────
function ShopLicenseRenewals() {
  return <LicenseTracker storeKey="compliance-shop-licenses" title="Shop & Establishment / Trade License Renewals" Icon={Store} seedAuthority="State Labour Dept" />;
}

// ── #128 FSSAI / INDUSTRY LICENSE TRACKER ───────────────────────────────────
function FssaiLicenseTracker() {
  return <LicenseTracker storeKey="compliance-industry-licenses" title="FSSAI / Industry License Tracker" Icon={BadgeCheck} seedAuthority="FSSAI" />;
}

// ── #129 LABOUR-LAW COMPLIANCE CALENDAR ─────────────────────────────────────
function LabourLawCalendar() {
  const today = new Date();
  const dueThisMonth = (day: number) => {
    let d = setDate(today, day);
    if (isBefore(d, today)) d = setDate(addMonths(today, 1), day);
    return d;
  };
  const items = [
    { name: "PF (EPF) contribution & ECR", form: "EPFO", date: dueThisMonth(15), freq: "Monthly", note: "Deposit by 15th of following month." },
    { name: "ESI contribution", form: "ESIC", date: dueThisMonth(15), freq: "Monthly", note: "Deposit by 15th of following month." },
    { name: "Professional Tax (PT)", form: "State", date: dueThisMonth(21), freq: "Monthly", note: "Due date varies by state (≈ 21st)." },
    { name: "TDS on salary deposit", form: "194-Sec 192", date: dueThisMonth(7), freq: "Monthly", note: "By 7th of following month." },
    { name: "Labour Welfare Fund (LWF)", form: "State", date: setDate(addMonths(today, (today.getMonth() % 6 === 5 ? 0 : 5 - (today.getMonth() % 6))), 30), freq: "Half-yearly", note: "Half-yearly in most states (Jun/Dec)." },
  ];
  const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><CalendarClock size={14} /> Labour-Law Compliance Calendar</h3>
        <div className="divide-y divide-[var(--color-border)]">
          {sorted.map(i => {
            const days = differenceInDays(i.date, today);
            return (
              <div key={i.name} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{i.name} <span className="text-[10px] text-[var(--color-muted)]">· {i.form}</span></p>
                  <p className="text-[11px] text-[var(--color-muted)]">{i.note}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium tabular-nums">{format(i.date, "dd MMM")}</p>
                  <p className={`text-[10px] ${days <= 3 ? "text-red-400" : days <= 7 ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>{days <= 0 ? "due" : `in ${days}d`} · {i.freq}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── #130 CONTRACT / AGREEMENT TEMPLATE LIBRARY ──────────────────────────────
function AgreementTemplateLibrary() {
  const { store } = useApp();
  const firm = store.firm?.name || "[Company Name]";
  const [party, setParty] = useState("");
  const [picked, setPicked] = useState("nda");
  const today = format(new Date(), "dd MMMM yyyy");
  const cp = party || "[Counterparty]";
  const TEMPLATES: Record<string, { label: string; body: string }> = {
    nda: { label: "Non-Disclosure Agreement", body: `MUTUAL NON-DISCLOSURE AGREEMENT\n\nThis Agreement is made on ${today} between ${firm} ("Disclosing Party") and ${cp} ("Receiving Party").\n\n1. Confidential Information includes all business, technical and financial information shared between the parties.\n2. The Receiving Party shall not disclose Confidential Information to any third party and shall use it solely to evaluate the proposed business relationship.\n3. Obligations survive for 3 years from disclosure.\n4. This Agreement is governed by the laws of India; courts at [City] have exclusive jurisdiction.\n\n_____________________        _____________________\n${firm}                       ${cp}` },
    employment: { label: "Employment Agreement", body: `EMPLOYMENT AGREEMENT\n\nThis Agreement is entered into on ${today} between ${firm} ("Company") and ${cp} ("Employee").\n\n1. Position & Duties: as per the appointment letter.\n2. Remuneration: CTC as agreed, paid monthly subject to statutory deductions (PF, ESI, PT, TDS).\n3. Probation: 6 months. Notice period: 30 days post-confirmation.\n4. Confidentiality, IP assignment and non-solicitation clauses apply.\n5. Governed by the laws of India.\n\n_____________________        _____________________\nFor ${firm}                   ${cp}` },
    msa: { label: "Master Services Agreement", body: `MASTER SERVICES AGREEMENT\n\nThis MSA is made on ${today} between ${firm} ("Service Provider") and ${cp} ("Client").\n\n1. Scope: services described in each Statement of Work (SOW).\n2. Fees & Taxes: as per SOW, exclusive of GST.\n3. Payment: within 30 days of invoice; interest @18% p.a. on delays.\n4. IP, confidentiality, limitation of liability and termination (30 days' notice) apply.\n5. Governed by the laws of India; arbitration seat at [City].\n\n_____________________        _____________________\n${firm}                       ${cp}` },
    vendor: { label: "Vendor / Supply Agreement", body: `VENDOR SUPPLY AGREEMENT\n\nThis Agreement is made on ${today} between ${firm} ("Buyer") and ${cp} ("Vendor").\n\n1. Vendor shall supply goods/services per purchase orders.\n2. Quality, delivery timelines and warranty as specified.\n3. Pricing inclusive of applicable GST; e-invoice/e-way bill compliance required.\n4. MSME vendors: payment within 45 days (Sec 43B(h)).\n5. Governed by the laws of India.\n\n_____________________        _____________________\n${firm}                       ${cp}` },
  };
  const t = TEMPLATES[picked];
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><FileSignature size={14} /> Contract / Agreement Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select className={INP} value={picked} onChange={e => setPicked(e.target.value)}>
            {Object.entries(TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input className={INP} placeholder="Counterparty name" value={party} onChange={e => setParty(e.target.value)} />
        </div>
        <button onClick={() => { navigator.clipboard?.writeText(t.body); toast.success("Template copied"); }} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium bg-[var(--color-primary)] text-[var(--color-bg)]"><Copy size={12} /> Copy template</button>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <pre className="text-[11px] text-[var(--color-text)] whitespace-pre-wrap font-mono leading-relaxed">{t.body}</pre>
        <p className="text-[10px] text-[var(--color-muted)] mt-3">Starter templates only - have a lawyer review before signing. Replace bracketed placeholders.</p>
      </div>
    </div>
  );
}

// ── #131 POSH / STATUTORY POLICY TRACKER ────────────────────────────────────
function PoshPolicyTracker() {
  interface Pol { id: string; name: string; required: string; done: boolean }
  const SEED: Pol[] = [
    { id: "posh", name: "POSH Policy adopted & circulated", required: "≥10 employees", done: false },
    { id: "icc", name: "Internal Committee (IC) constituted", required: "Presiding officer (woman) + 2 employees + 1 external NGO member", done: false },
    { id: "report", name: "Annual POSH report filed with District Officer", required: "By 31 Jan", done: false },
    { id: "training", name: "POSH awareness training conducted", required: "Annual", done: false },
    { id: "coc", name: "Code of Conduct / HR policy", required: "All firms", done: false },
    { id: "register", name: "Complaints register maintained", required: "All firms", done: false },
  ];
  const [pols, setPols] = useFeatureState<Pol[]>("compliance-posh-policies", SEED);
  const [iccWomen, setIccWomen] = useState(false);
  const [iccExternal, setIccExternal] = useState(false);
  const done = pols.filter(p => p.done).length;
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ScrollText size={14} /> POSH & Statutory Policies</h3>
          <span className="text-xs text-[var(--color-muted)]">{done}/{pols.length} done</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {pols.map(p => (
            <div key={p.id} className="py-2.5 flex items-center gap-3">
              <button onClick={() => setPols(prev => prev.map(x => x.id === p.id ? { ...x, done: !x.done } : x))} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${p.done ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-bg)]" : "border-[var(--color-border)]"}`}>{p.done && <CheckCircle2 size={12} />}</button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{p.required}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-2">
        <p className="text-sm font-semibold">IC Validity Check</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={iccWomen} onChange={e => setIccWomen(e.target.checked)} className="accent-[var(--color-primary)]" /> Presiding officer is a woman & ≥50% members are women</label>
        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={iccExternal} onChange={e => setIccExternal(e.target.checked)} className="accent-[var(--color-primary)]" /> One external member from an NGO/association familiar with POSH</label>
        <p className={`text-xs font-medium ${iccWomen && iccExternal ? "text-green-400" : "text-yellow-400"}`}>{iccWomen && iccExternal ? "IC composition is valid under the POSH Act, 2013." : "IC composition is incomplete - non-compliant IC orders can be challenged."}</p>
      </div>
    </div>
  );
}

// ── #132 MULTI-ACT PENALTY ESTIMATOR ────────────────────────────────────────
function MultiActPenaltyEstimator() {
  const [act, setAct] = useState("roc");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const amt = parseFloat(amount) || 0;
  const d = parseInt(days) || 0;
  const months = Math.ceil(d / 30) || (d > 0 ? 1 : 0);
  let penalty = 0; let basis = "";
  switch (act) {
    case "roc": penalty = d * 100; basis = "₹100 per day of delay per form (MCA additional fee)"; break;
    case "tds-deposit": penalty = Math.round(amt * 0.015 * months); basis = "1.5% per month (part) on late deposit of deducted TDS (Sec 201(1A))"; break;
    case "tds-return": penalty = Math.min(d * 200, amt); basis = "₹200 per day late-filing fee, capped at the TDS amount (Sec 234E)"; break;
    case "pf": penalty = Math.round(amt * 0.12 * months / 12) + Math.round(amt * (d > 180 ? 0.25 : d > 60 ? 0.15 : 0.05)); basis = "Interest @12% p.a. (Sec 7Q) + damages 5-25% (Sec 14B) by delay slab"; break;
    case "esi": penalty = Math.round(amt * 0.12 * months / 12); basis = "Simple interest @12% p.a. on delayed ESI contribution"; break;
    case "gst": penalty = d * 50 + Math.round(amt * 0.18 * d / 365); basis = "Late fee ₹50/day (₹20 nil) + interest @18% p.a. on tax"; break;
    default: break;
  }
  const ACTS: [string, string][] = [["roc", "ROC / MCA form"], ["tds-deposit", "Late TDS deposit"], ["tds-return", "Late TDS return (234E)"], ["pf", "EPF / PF"], ["esi", "ESI"], ["gst", "GST return"]];
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Gavel size={14} /> Multi-Act Penalty Estimator</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className={INP} value={act} onChange={e => setAct(e.target.value)}>{ACTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input type="number" className={INP} placeholder="Tax / contribution amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} />
          <input type="number" className={INP} placeholder="Days delayed" value={days} onChange={e => setDays(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Estimated penalty / fee</p><p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(penalty)}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Delay</p><p className="text-lg font-bold tabular-nums">{d} days</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 col-span-2 md:col-span-1"><p className="text-xs text-[var(--color-muted)] mb-1">Months (part)</p><p className="text-lg font-bold tabular-nums">{months}</p></div>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{basis}. Indicative only - actual penalties depend on facts and officer discretion.</p>
    </div>
  );
}

// ── #133 COMPLIANCE HEALTH SCORE & RISK HEATMAP ─────────────────────────────
function ComplianceHealthScore() {
  type Status = "good" | "warning" | "bad";
  interface Area { id: string; name: string; weight: number; status: Status }
  const SEED: Area[] = [
    { id: "gst", name: "GST returns (GSTR-1/3B)", weight: 20, status: "good" },
    { id: "tds", name: "TDS deposits & returns", weight: 15, status: "good" },
    { id: "roc", name: "ROC / MCA filings", weight: 15, status: "warning" },
    { id: "payroll", name: "PF / ESI / PT", weight: 15, status: "good" },
    { id: "incometax", name: "Income tax & advance tax", weight: 15, status: "good" },
    { id: "licenses", name: "Licenses & renewals", weight: 10, status: "warning" },
    { id: "posh", name: "POSH & labour policies", weight: 10, status: "bad" },
  ];
  const [areas, setAreas] = useFeatureState<Area[]>("compliance-health-areas", SEED);
  const score = useMemo(() => {
    const w = areas.reduce((s, a) => s + a.weight, 0) || 1;
    const pts = areas.reduce((s, a) => s + a.weight * (a.status === "good" ? 1 : a.status === "warning" ? 0.5 : 0), 0);
    return Math.round((pts / w) * 100);
  }, [areas]);
  const cycle = (id: string) => setAreas(prev => prev.map(a => a.id === id ? { ...a, status: a.status === "good" ? "warning" : a.status === "warning" ? "bad" : "good" } : a));
  const col = (s: Status) => s === "good" ? "bg-green-900/40 text-green-400 border-green-800/50" : s === "warning" ? "bg-yellow-900/40 text-yellow-400 border-yellow-800/50" : "bg-red-900/40 text-red-400 border-red-800/50";
  const grade = score >= 85 ? "Strong" : score >= 65 ? "Moderate" : score >= 40 ? "At risk" : "Critical";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Compliance Health</p><p className={`text-2xl font-bold tabular-nums ${score >= 85 ? "text-green-400" : score >= 65 ? "text-yellow-400" : "text-red-400"}`}>{score}<span className="text-sm text-[var(--color-muted)]">/100</span></p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Rating</p><p className="text-lg font-bold">{grade}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 col-span-2 md:col-span-1"><p className="text-xs text-[var(--color-muted)] mb-1">Areas at risk</p><p className="text-lg font-bold tabular-nums text-red-400">{areas.filter(a => a.status !== "good").length}</p></div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Activity size={14} /> Risk Heatmap <span className="text-[10px] text-[var(--color-muted)] font-normal">(tap a tile to update status)</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {areas.map(a => (
            <button key={a.id} onClick={() => cycle(a.id)} className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left ${col(a.status)}`}>
              <span className="text-xs font-medium">{a.name} <span className="opacity-60">· {a.weight}%</span></span>
              <span className="text-[9px] font-semibold uppercase shrink-0">{a.status}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── #134 PROFESSIONAL TAX - MULTI-STATE REGISTRATION TRACKER ─────────────────
type PtRegState = { id: string; state: string; ec: boolean; rc: boolean; ecNo: string; rcNo: string; slab: string; due: number };
function ProfessionalTaxTracker() {
  // PT is a state levy. EC = Enrolment Certificate (employer/firm itself), RC = Registration Certificate (to deduct from employees).
  const STATE_INFO: { state: string; max: string; freq: string }[] = [
    { state: "Maharashtra",   max: "₹2,500/yr",  freq: "Monthly (₹200, ₹300 in Feb)" },
    { state: "Karnataka",     max: "₹2,400/yr",  freq: "Monthly (₹200)" },
    { state: "West Bengal",   max: "₹2,500/yr",  freq: "Monthly / annual" },
    { state: "Tamil Nadu",    max: "₹2,500/yr",  freq: "Half-yearly" },
    { state: "Telangana",     max: "₹2,500/yr",  freq: "Monthly" },
    { state: "Gujarat",       max: "₹2,400/yr",  freq: "Monthly" },
    { state: "Andhra Pradesh",max: "₹2,500/yr",  freq: "Monthly" },
    { state: "Madhya Pradesh",max: "₹2,500/yr",  freq: "Monthly" },
  ];
  const NO_PT = ["Delhi", "Haryana", "Uttar Pradesh", "Rajasthan", "Uttarakhand", "Himachal Pradesh", "Goa (none)", "J&K"];
  const [rows, setRows] = useFeatureState<PtRegState[]>("comp-pt-states", []);
  const [state, setState] = useState(STATE_INFO[0].state);
  const add = () => {
    if (rows.some(r => r.state === state)) { toast.error(`${state} already added`); return; }
    setRows(prev => [...prev, { id: Math.random().toString(36).slice(2), state, ec: false, rc: false, ecNo: "", rcNo: "", slab: "", due: 0 }]);
    toast.success(`${state} added`);
  };
  const upd = (id: string, patch: Partial<PtRegState>) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  const totalDue = rows.reduce((s, r) => s + (r.due || 0), 0);
  const pendingReg = rows.filter(r => !r.ec || !r.rc).length;
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Receipt size={14} className="text-[var(--color-primary)]" /> Professional Tax - Multi-State Registration Tracker</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">PT is a state levy. Track the employer Enrolment Certificate (EC) and the Registration Certificate (RC, to deduct from staff) for every state you operate in. Capped at ₹2,500/employee/year.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className={INP} value={state} onChange={e => setState(e.target.value)}>
            {STATE_INFO.map(s => <option key={s.state} value={s.state}>{s.state}</option>)}
          </select>
          <button onClick={add} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"><Plus size={12} /> Add state</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">States tracked</p><p className="text-lg font-bold tabular-nums">{rows.length}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Registrations pending</p><p className={`text-lg font-bold tabular-nums ${pendingReg > 0 ? "text-yellow-400" : "text-green-400"}`}>{pendingReg}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 col-span-2 md:col-span-1"><p className="text-xs text-[var(--color-muted)] mb-1">PT payable / period</p><p className="text-lg font-bold tabular-nums text-orange-400">{formatCurrency(totalDue)}</p></div>
      </div>
      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
          {rows.map(r => {
            const info = STATE_INFO.find(s => s.state === r.state);
            return (
              <div key={r.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold flex-1">{r.state}</p>
                  <span className="text-[10px] text-[var(--color-muted)]">{info?.freq} · max {info?.max}</span>
                  <button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={r.ec} onChange={e => upd(r.id, { ec: e.target.checked })} className="accent-[var(--color-primary)]" /> EC obtained</label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={r.rc} onChange={e => upd(r.id, { rc: e.target.checked })} className="accent-[var(--color-primary)]" /> RC obtained</label>
                  <input className={INP} placeholder="EC no." value={r.ecNo} onChange={e => upd(r.id, { ecNo: e.target.value })} />
                  <input className={INP} placeholder="RC no." value={r.rcNo} onChange={e => upd(r.id, { rcNo: e.target.value })} />
                  <input type="number" className={INP} placeholder="PT this period (₹)" value={r.due || ""} onChange={e => upd(r.id, { due: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />States with no PT: {NO_PT.join(", ")}. Due dates and slabs vary by state - verify on the state commercial-tax portal.</p>
    </div>
  );
}

// ── #135 TRADEMARK / IP RENEWAL TRACKER ─────────────────────────────────────
type IpAsset = { id: string; name: string; kind: "Trademark" | "Patent" | "Copyright" | "Design"; regNo: string; cls: string; regDate: string };
function TrademarkIpRenewal() {
  const [assets, setAssets] = useFeatureState<IpAsset[]>("comp-ip-assets", []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<IpAsset["kind"]>("Trademark");
  const [regNo, setRegNo] = useState("");
  const [cls, setCls] = useState("");
  const [regDate, setRegDate] = useState("");
  // TM: renew every 10 years. Patent: 20-year term, annuity from year 3. Design: 10 yrs +5 extension. Copyright: life+60 (no renewal).
  const termYears = (k: IpAsset["kind"]) => k === "Trademark" ? 10 : k === "Patent" ? 20 : k === "Design" ? 10 : 0;
  const add = () => {
    if (!name || !regDate) { toast.error("Enter name and registration date"); return; }
    setAssets(prev => [...prev, { id: Math.random().toString(36).slice(2), name, kind, regNo, cls, regDate }]);
    setName(""); setRegNo(""); setCls(""); setRegDate(""); toast.success("IP asset added");
  };
  const today = new Date();
  const enriched = assets.map(a => {
    const term = termYears(a.kind);
    const renewal = term > 0 ? new Date(new Date(a.regDate).getFullYear() + term, new Date(a.regDate).getMonth(), new Date(a.regDate).getDate()) : null;
    const days = renewal ? differenceInDays(renewal, today) : null;
    return { ...a, renewal, days };
  }).sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  const dueSoon = enriched.filter(a => a.days !== null && a.days >= 0 && a.days <= 180).length;
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Award size={14} className="text-[var(--color-primary)]" /> Trademark / IP Renewal Tracker {dueSoon > 0 && <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">{dueSoon} renewing ≤6mo</span>}</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Trademarks renew every 10 years; patents need annuity from year 3 (20-yr term); registered designs run 10+5 years. A lapsed renewal can permanently lose protection.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input className={INP} placeholder="Mark / IP name *" value={name} onChange={e => setName(e.target.value)} />
          <select className={INP} value={kind} onChange={e => setKind(e.target.value as IpAsset["kind"])}>
            {(["Trademark", "Patent", "Copyright", "Design"] as const).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input className={INP} placeholder="Reg. no." value={regNo} onChange={e => setRegNo(e.target.value)} />
          <input className={INP} placeholder="Class / field" value={cls} onChange={e => setCls(e.target.value)} />
          <input type="date" className={INP} value={regDate} onChange={e => setRegDate(e.target.value)} />
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium bg-[var(--color-primary)] text-[var(--color-bg)]"><Plus size={12} /> Add IP asset</button>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        {enriched.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-4">No IP assets tracked yet.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {enriched.map(a => (
              <div key={a.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{a.name}</p>
                    <span className="text-[9px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full text-[var(--color-muted)]">{a.kind}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)]">{[a.regNo && `No. ${a.regNo}`, a.cls && `Class ${a.cls}`, `Registered ${a.regDate}`].filter(Boolean).join(" · ")}{a.renewal ? ` · Renew by ${format(a.renewal, "dd MMM yyyy")}` : " · No renewal (copyright runs life+60)"}</p>
                </div>
                {a.days !== null && <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${a.days < 0 ? "bg-red-900/30 text-red-400 border-red-800/40" : a.days <= 180 ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{a.days < 0 ? `Lapsed ${-a.days}d` : `${a.days}d`}</span>}
                <button onClick={() => setAssets(prev => prev.filter(x => x.id !== a.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── #136 IMPORT-EXPORT (IEC) COMPLIANCE TRACKER ─────────────────────────────
function IecComplianceTracker() {
  const [iec, setIec] = useFeatureState<string>("comp-iec-number", "");
  const [updated, setUpdated] = useFeatureState<string>("comp-iec-updated", "");
  const [adCodes, setAdCodes] = useFeatureState<{ id: string; port: string; bank: string; reg: boolean }[]>("comp-iec-adcodes", []);
  const [port, setPort] = useState("");
  const [bank, setBank] = useState("");
  // DGFT mandates annual IEC update during Apr-Jun each FY, even if no change, else IEC is deactivated.
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);
  const updatedThisFy = updated ? new Date(updated) >= fyStart : false;
  const updateDeadline = new Date(fyStart.getFullYear(), 5, 30); // 30 Jun
  const daysToDeadline = differenceInDays(updateDeadline, now);
  const addAd = () => {
    if (!port) { toast.error("Enter port"); return; }
    setAdCodes(prev => [...prev, { id: Math.random().toString(36).slice(2), port, bank, reg: false }]);
    setPort(""); setBank("");
  };
  const CHECKS = [
    { label: "IEC obtained from DGFT (PAN-based, lifetime)", ok: !!iec },
    { label: "IEC updated/confirmed this financial year (Apr-Jun)", ok: updatedThisFy },
    { label: "AD-Code registered at every port of export", ok: adCodes.length > 0 && adCodes.every(a => a.reg) },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Ship size={14} className="text-[var(--color-primary)]" /> Import-Export (IEC) Compliance</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">IEC is a one-time, PAN-based code, but DGFT requires you to electronically update/confirm it every year (Apr-Jun) or it is deactivated and shipments stop.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IEC Number</label>
            <input className={INP} placeholder="10-digit IEC (= PAN)" value={iec} onChange={e => setIec(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Last DGFT update date</label>
            <input type="date" className={INP} value={updated} onChange={e => setUpdated(e.target.value)} />
          </div>
        </div>
        <div className={`mt-3 rounded-lg p-3 border text-xs ${updatedThisFy ? "bg-green-950/20 border-green-800/40 text-green-400" : "bg-yellow-950/20 border-yellow-800/40 text-yellow-300"}`}>
          {updatedThisFy
            ? `IEC confirmed for FY ${fyStart.getFullYear()}-${(fyStart.getFullYear() + 1).toString().slice(2)}. Next update window opens 1 Apr ${fyStart.getFullYear() + 1}.`
            : `Annual IEC update is pending - deadline ${format(updateDeadline, "dd MMM yyyy")} (${daysToDeadline >= 0 ? `${daysToDeadline}d left` : `${-daysToDeadline}d overdue - IEC may be deactivated`}).`}
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-3">AD-Code Registration by Port</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          <input className={INP} placeholder="Port / customs station" value={port} onChange={e => setPort(e.target.value)} />
          <input className={INP} placeholder="Authorised Dealer bank" value={bank} onChange={e => setBank(e.target.value)} />
          <button onClick={addAd} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"><Plus size={12} /> Add port</button>
        </div>
        {adCodes.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-2">No AD-codes registered. You must register your bank's AD-code at every customs port before exporting from it.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {adCodes.map(a => (
              <div key={a.id} className="py-2.5 flex items-center gap-3">
                <button onClick={() => setAdCodes(prev => prev.map(x => x.id === a.id ? { ...x, reg: !x.reg } : x))} className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${a.reg ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{a.reg ? "Registered" : "Pending"}</button>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium">{a.port}</p>{a.bank && <p className="text-[10px] text-[var(--color-muted)]">{a.bank}</p>}</div>
                <button onClick={() => setAdCodes(prev => prev.filter(x => x.id !== a.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-3">Compliance Checklist</p>
        <div className="space-y-2">
          {CHECKS.map(c => (
            <div key={c.label} className="flex items-center gap-2 text-sm">
              <span className={c.ok ? "text-green-400" : "text-[var(--color-muted)]"}>{c.ok ? <CheckCircle2 size={14} /> : <X size={14} />}</span>
              <span className={c.ok ? "" : "text-[var(--color-muted)]"}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── #137 ENVIRONMENTAL / POLLUTION-BOARD CONSENT (CTE / CTO) TRACKER ─────────
type Consent = { id: string; kind: "CTE" | "CTO"; category: "Red" | "Orange" | "Green" | "White"; number: string; issued: string; valid: string };
function PollutionConsentTracker() {
  const [items, setItems] = useFeatureState<Consent[]>("comp-pollution-consents", []);
  const [kind, setKind] = useState<Consent["kind"]>("CTO");
  const [category, setCategory] = useState<Consent["category"]>("Green");
  const [number, setNumber] = useState("");
  const [issued, setIssued] = useState("");
  const [valid, setValid] = useState("");
  // SPCB consent validity by category: Red 5yr, Orange 10yr, Green 15yr, White exempt (intimation only).
  const CAT_VALIDITY: Record<Consent["category"], string> = { Red: "5 years", Orange: "10 years", Green: "15 years", White: "Exempt - intimation only" };
  const add = () => {
    if (category !== "White" && (!number || !valid)) { toast.error("Enter consent number and validity date"); return; }
    setItems(prev => [...prev, { id: Math.random().toString(36).slice(2), kind, category, number, issued, valid }]);
    setNumber(""); setIssued(""); setValid(""); toast.success("Consent added");
  };
  const today = new Date();
  const sorted = [...items].sort((a, b) => (a.valid || "9999").localeCompare(b.valid || "9999"));
  const CAT_COLOR: Record<Consent["category"], string> = { Red: "text-red-400", Orange: "text-orange-400", Green: "text-green-400", White: "text-[var(--color-muted)]" };
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Leaf size={14} className="text-[var(--color-primary)]" /> Environmental Consent (CTE / CTO) Tracker</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">State Pollution Control Board Consent-to-Establish (before setup) and Consent-to-Operate (renewable). Validity depends on the unit's pollution category. A lapsed CTO can halt operations on inspection.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select className={INP} value={kind} onChange={e => setKind(e.target.value as Consent["kind"])}>
            <option value="CTE">CTE (Establish)</option>
            <option value="CTO">CTO (Operate)</option>
          </select>
          <select className={INP} value={category} onChange={e => setCategory(e.target.value as Consent["category"])}>
            {(["Red", "Orange", "Green", "White"] as const).map(c => <option key={c} value={c}>{c} category</option>)}
          </select>
          <input className={INP} placeholder="Consent no." value={number} onChange={e => setNumber(e.target.value)} />
          <input type="date" className={INP} title="Issued" value={issued} onChange={e => setIssued(e.target.value)} />
          <input type="date" className={INP} title="Valid until" value={valid} onChange={e => setValid(e.target.value)} />
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Validity for {category}: <span className={CAT_COLOR[category]}>{CAT_VALIDITY[category]}</span></p>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium bg-[var(--color-primary)] text-[var(--color-bg)]"><Plus size={12} /> Add consent</button>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        {sorted.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-4">No consents tracked yet.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {sorted.map(c => {
              const days = c.valid ? differenceInDays(new Date(c.valid), today) : null;
              return (
                <div key={c.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{c.kind} <span className={`text-[10px] font-semibold ${CAT_COLOR[c.category]}`}>· {c.category}</span></p>
                      {c.number && <span className="text-[9px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full text-[var(--color-muted)] font-mono">{c.number}</span>}
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)]">{[c.issued && `Issued ${c.issued}`, c.valid && `Valid until ${c.valid}`].filter(Boolean).join(" · ") || "Validity not set"}</p>
                  </div>
                  {days !== null && <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${days < 0 ? "bg-red-900/30 text-red-400 border-red-800/40" : days <= 90 ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{days < 0 ? `Expired ${-days}d` : `${days}d left`}</span>}
                  <button onClick={() => setItems(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── #138 FIRE / SAFETY NOC TRACKER ──────────────────────────────────────────
type FireRecord = { id: string; premise: string; type: "Provisional NOC" | "Final NOC" | "Fire Safety Certificate"; number: string; issued: string; valid: string; mockDrill: string };
function FireNocTracker() {
  const [records, setRecords] = useFeatureState<FireRecord[]>("comp-fire-noc", []);
  const [premise, setPremise] = useState("");
  const [type, setType] = useState<FireRecord["type"]>("Fire Safety Certificate");
  const [number, setNumber] = useState("");
  const [valid, setValid] = useState("");
  const add = () => {
    if (!premise || !valid) { toast.error("Enter premise and validity date"); return; }
    setRecords(prev => [...prev, { id: Math.random().toString(36).slice(2), premise, type, number, issued: "", valid, mockDrill: "" }]);
    setPremise(""); setNumber(""); setValid(""); toast.success("Fire NOC added");
  };
  const today = new Date();
  const sorted = [...records].sort((a, b) => a.valid.localeCompare(b.valid));
  const expiringSoon = records.filter(r => { const d = differenceInDays(new Date(r.valid), today); return d >= 0 && d <= 60; }).length;
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Flame size={14} className="text-[var(--color-primary)]" /> Fire / Safety NOC Tracker {expiringSoon > 0 && <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">{expiringSoon} renewing ≤60d</span>}</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Fire NOC / fire-safety certificate from the State Fire Service is mandatory for factories, offices above prescribed area, and high-occupancy premises. Usually renewed yearly. Track per premise and log periodic mock drills.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input className={INP} placeholder="Premise / branch *" value={premise} onChange={e => setPremise(e.target.value)} />
          <select className={INP} value={type} onChange={e => setType(e.target.value as FireRecord["type"])}>
            {(["Provisional NOC", "Final NOC", "Fire Safety Certificate"] as const).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className={INP} placeholder="Certificate no." value={number} onChange={e => setNumber(e.target.value)} />
          <input type="date" className={INP} title="Valid until" value={valid} onChange={e => setValid(e.target.value)} />
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium bg-[var(--color-primary)] text-[var(--color-bg)]"><Plus size={12} /> Add NOC</button>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        {sorted.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-4">No fire NOCs tracked yet.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {sorted.map(r => {
              const days = differenceInDays(new Date(r.valid), today);
              return (
                <div key={r.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{r.premise}</p>
                      <span className="text-[9px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full text-[var(--color-muted)]">{r.type}</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)]">{[r.number && `No. ${r.number}`, `Valid until ${r.valid}`].filter(Boolean).join(" · ")}</p>
                    <input value={r.mockDrill} onChange={e => setRecords(prev => prev.map(x => x.id === r.id ? { ...x, mockDrill: e.target.value } : x))} placeholder="Last mock-drill date / note…" className="w-full mt-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] outline-none focus:border-[var(--color-primary)]" />
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${days < 0 ? "bg-red-900/30 text-red-400 border-red-800/40" : days <= 60 ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{days < 0 ? `Expired ${-days}d` : `${days}d left`}</span>
                    <button onClick={() => setRecords(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── #139 CSR APPLICABILITY & SPEND TRACKER ──────────────────────────────────
function CsrSpendTracker() {
  const { store } = useApp();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const [netWorth, setNetWorth] = useState("");
  const [turnover, setTurnover] = useState(() => String(Math.round(store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))));
  const [netProfit, setNetProfit] = useState(() => String(Math.round(snap.estAnnualProfit ?? 0)));
  const [spent, setSpent] = useState("");
  const nw = parseFloat(netWorth) || 0;
  const to = parseFloat(turnover) || 0;
  const np = parseFloat(netProfit) || 0;
  const sp = parseFloat(spent) || 0;
  // Sec 135: applies if net worth ≥ ₹500cr OR turnover ≥ ₹1000cr OR net profit ≥ ₹5cr in immediately preceding FY.
  const applies = nw >= 5000000000 || to >= 10000000000 || np >= 50000000;
  // Obligation = 2% of avg net profit of last 3 FY (proxied here by current net profit).
  const obligation = applies ? Math.round(np * 0.02) : 0;
  const shortfall = Math.max(0, obligation - sp);
  const pct = obligation > 0 ? Math.min(100, Math.round((sp / obligation) * 100)) : 0;
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><HandCoins size={14} className="text-[var(--color-primary)]" /> CSR Applicability & Spend Tracker</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Section 135 CSR applies if any of: net worth ≥ ₹500 cr, turnover ≥ ₹1,000 cr, or net profit ≥ ₹5 cr. Obligation is 2% of the average net profit of the last 3 financial years.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Net worth (₹)</label><input type="number" className={INP} placeholder="e.g. 200000000" value={netWorth} onChange={e => setNetWorth(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Turnover (₹)</label><input type="number" className={INP} value={turnover} onChange={e => setTurnover(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Net profit (₹)</label><input type="number" className={INP} value={netProfit} onChange={e => setNetProfit(e.target.value)} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">CSR spent this FY (₹)</label><input type="number" className={INP} placeholder="0" value={spent} onChange={e => setSpent(e.target.value)} /></div>
        </div>
      </div>
      <div className={`rounded-lg p-4 border ${applies ? "border-[var(--color-primary)]/40 bg-[var(--color-accent)]" : "border-green-800/40 bg-green-950/20"}`}>
        <p className="text-sm font-semibold">{applies ? "CSR is applicable to your company." : "CSR is not applicable - you are below all three thresholds."}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">{applies ? "Constitute a CSR committee, adopt a policy, spend, and file Form CSR-2 with AOC-4." : "Re-check at each year-end; CSR triggers if you cross any one threshold."}</p>
      </div>
      {applies && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">2% obligation</p><p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(obligation)}</p></div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Spent</p><p className="text-lg font-bold tabular-nums text-blue-400">{formatCurrency(sp)}</p></div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 col-span-2 md:col-span-1"><p className="text-xs text-[var(--color-muted)] mb-1">Shortfall</p><p className={`text-lg font-bold tabular-nums ${shortfall > 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(shortfall)}</p></div>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-semibold">CSR spend progress</p><span className="text-xs text-[var(--color-muted)]">{pct}%</span></div>
            <div className="h-2.5 rounded-full bg-[var(--color-bg)] overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-green-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} /></div>
            <p className="text-[11px] text-[var(--color-muted)] mt-3">{shortfall > 0 ? `Unspent CSR (other than ongoing projects) must be transferred to a Schedule-VII fund within 6 months of FY-end. Ongoing-project unspent goes to a separate Unspent CSR Account within 30 days.` : "CSR obligation met for this year. File Form CSR-2."}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── #140 RELATED-PARTY TRANSACTION (RPT) REGISTER ───────────────────────────
type Rpt = { id: string; party: string; relation: string; nature: string; amount: number; basis: "Arm's length" | "Not arm's length"; boardApproval: boolean; date: string };
function RelatedPartyRegister() {
  const [rows, setRows] = useFeatureState<Rpt[]>("comp-rpt-register", []);
  const [party, setParty] = useState("");
  const [relation, setRelation] = useState("Director");
  const [nature, setNature] = useState("");
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<Rpt["basis"]>("Arm's length");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const RELATIONS = ["Director", "KMP", "Relative of Director/KMP", "Holding Company", "Subsidiary", "Associate", "Director's other firm", "Other"];
  const add = () => {
    if (!party || !nature) { toast.error("Enter party and nature of transaction"); return; }
    setRows(prev => [...prev, { id: Math.random().toString(36).slice(2), party, relation, nature, amount: parseFloat(amount) || 0, basis, boardApproval: false, date }]);
    setParty(""); setNature(""); setAmount(""); toast.success("RPT logged");
  };
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const needApproval = rows.filter(r => !r.boardApproval).length;
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Related-Party Transaction Register</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Section 188 / MBP-4. Log every transaction with directors, KMP, their relatives and group companies. Non-arm's-length RPTs need board (and sometimes shareholder) approval and AOC-2 disclosure.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <input className={INP} placeholder="Related party *" value={party} onChange={e => setParty(e.target.value)} />
          <select className={INP} value={relation} onChange={e => setRelation(e.target.value)}>{RELATIONS.map(r => <option key={r}>{r}</option>)}</select>
          <input className={INP} placeholder="Nature (sale/loan/lease…) *" value={nature} onChange={e => setNature(e.target.value)} />
          <input type="number" className={INP} placeholder="Amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} />
          <select className={INP} value={basis} onChange={e => setBasis(e.target.value as Rpt["basis"])}>
            {(["Arm's length", "Not arm's length"] as const).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input type="date" className={INP} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium bg-[var(--color-primary)] text-[var(--color-bg)]"><Plus size={12} /> Log transaction</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Transactions</p><p className="text-lg font-bold tabular-nums">{rows.length}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Total value</p><p className="text-lg font-bold tabular-nums text-blue-400">{formatCurrency(total)}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 col-span-2 md:col-span-1"><p className="text-xs text-[var(--color-muted)] mb-1">Awaiting approval</p><p className={`text-lg font-bold tabular-nums ${needApproval > 0 ? "text-yellow-400" : "text-green-400"}`}>{needApproval}</p></div>
      </div>
      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
          {[...rows].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
            <div key={r.id} className="p-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{r.party}</p>
                  <span className="text-[9px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full text-[var(--color-muted)]">{r.relation}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.basis === "Arm's length" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-orange-900/30 text-orange-400 border-orange-800/40"}`}>{r.basis}</span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">{r.nature}{r.amount > 0 ? ` · ${formatCurrency(r.amount)}` : ""} · {r.date}</p>
              </div>
              <button onClick={() => setRows(prev => prev.map(x => x.id === r.id ? { ...x, boardApproval: !x.boardApproval } : x))} className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${r.boardApproval ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.boardApproval ? "Board-approved" : "Approve"}</button>
              <button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />RPTs above prescribed thresholds (e.g. ≥10% of turnover) require prior shareholder approval by ordinary resolution. All RPTs must be entered in register MBP-4 and disclosed in AOC-2.</p>
    </div>
  );
}

// ── #141 DIRECTOR DISQUALIFICATION CHECKER (Sec 164) ────────────────────────
type DirCheck = { id: string; name: string; din: string; flags: Record<string, boolean> };
function DirectorDisqualChecker() {
  const TRIGGERS: { key: string; label: string; sub: string }[] = [
    { key: "unsound", label: "Of unsound mind (declared by a court)", sub: "Sec 164(1)(a)" },
    { key: "insolvent", label: "Undischarged insolvent / applied to be adjudged insolvent", sub: "Sec 164(1)(b)/(c)" },
    { key: "convicted", label: "Convicted of an offence (≥6 months, last 5 years)", sub: "Sec 164(1)(d)" },
    { key: "courtOrder", label: "Disqualified by a court/Tribunal order in force", sub: "Sec 164(1)(e)" },
    { key: "unpaidCalls", label: "Unpaid calls on shares for over 6 months", sub: "Sec 164(1)(f)" },
    { key: "relatedConvict", label: "Convicted of related-party-transaction offence (last 5 yrs)", sub: "Sec 164(1)(g)" },
    { key: "noDin", label: "Has not complied with DIN / DIR-3 KYC requirements", sub: "Sec 164(1)(h)" },
    { key: "noFiling3yr", label: "Other company failed to file financials/returns for 3 continuous FYs", sub: "Sec 164(2)(a)" },
    { key: "deposits", label: "Other company failed to repay deposits / pay dividend ≥1 year", sub: "Sec 164(2)(b)" },
  ];
  const [dirs, setDirs] = useFeatureState<DirCheck[]>("comp-dir-disqual", []);
  const [name, setName] = useState("");
  const [din, setDin] = useState("");
  const add = () => {
    if (!name) { toast.error("Enter director name"); return; }
    setDirs(prev => [...prev, { id: Math.random().toString(36).slice(2), name, din, flags: {} }]);
    setName(""); setDin("");
  };
  const toggle = (id: string, key: string) => setDirs(prev => prev.map(d => d.id === id ? { ...d, flags: { ...d.flags, [key]: !d.flags[key] } } : d));
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><UserX size={14} className="text-[var(--color-primary)]" /> Director Disqualification Checker (Sec 164)</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Self-assessment against Section 164 disqualification triggers. A director defaulting under 164(2) in one company is disqualified across all companies for 5 years - verify each board member.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <input className={INP} placeholder="Director name *" value={name} onChange={e => setName(e.target.value)} />
          <input className={INP} placeholder="DIN" value={din} onChange={e => setDin(e.target.value)} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"><Plus size={12} /> Add director</button>
        </div>
      </div>
      {dirs.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-center text-xs text-[var(--color-muted)]">Add a director to run the disqualification self-check.</div>
      ) : dirs.map(d => {
        const hit = TRIGGERS.filter(t => d.flags[t.key]).length;
        const disqualified = hit > 0;
        return (
          <div key={d.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-semibold flex-1">{d.name} {d.din && <span className="text-[10px] text-[var(--color-muted)] font-mono">· DIN {d.din}</span>}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${disqualified ? "bg-red-900/30 text-red-400 border border-red-800/40" : "bg-green-900/30 text-green-400 border border-green-800/40"}`}>{disqualified ? `Disqualified - ${hit} trigger${hit > 1 ? "s" : ""}` : "No triggers flagged"}</span>
              <button onClick={() => setDirs(prev => prev.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {TRIGGERS.map(t => (
                <label key={t.key} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={!!d.flags[t.key]} onChange={() => toggle(d.id, t.key)} className="mt-0.5 accent-red-500 shrink-0" />
                  <span className={d.flags[t.key] ? "text-red-400" : "text-[var(--color-muted)]"}>{t.label} <span className="opacity-60">· {t.sub}</span></span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Acting as a director while disqualified is an offence (fine + imprisonment). This is an indicative self-check - confirm DIN status on the MCA portal.</p>
    </div>
  );
}

// ── #142 EVENT-BASED ROC FILING TRACKER (PAS-3 / MGT-14 / DIR-12 / CHG-1) ────
type EventFiling = { id: string; form: string; event: string; eventDate: string; filed: boolean };
function EventBasedRocTracker() {
  // Most event-based forms must be filed within a fixed number of days of the triggering event.
  const FORMS: { form: string; event: string; window: number; note: string }[] = [
    { form: "PAS-3", event: "Allotment of shares", window: 30, note: "Return of allotment within 30 days of allotment." },
    { form: "MGT-14", event: "Special / specified board resolution passed", window: 30, note: "File certain resolutions within 30 days of passing." },
    { form: "DIR-12", event: "Director appointment / resignation / change", window: 30, note: "File within 30 days of the change in directors." },
    { form: "CHG-1", event: "Charge created / modified (loan secured)", window: 30, note: "Register charge within 30 days; condonation needed after." },
    { form: "CHG-4", event: "Satisfaction of charge (loan repaid)", window: 30, note: "Intimate satisfaction within 30 days of repayment." },
    { form: "INC-22", event: "Change of registered office", window: 30, note: "Notice of situation/change of registered office, within 30 days." },
    { form: "SH-7", event: "Increase in authorised share capital", window: 30, note: "Notice of alteration of share capital, within 30 days." },
    { form: "ADT-3", event: "Resignation of auditor", window: 30, note: "Auditor files within 30 days of resignation." },
  ];
  const [filings, setFilings] = useFeatureState<EventFiling[]>("comp-event-roc", []);
  const [form, setForm] = useState(FORMS[0].form);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().split("T")[0]);
  const meta = (f: string) => FORMS.find(x => x.form === f)!;
  const add = () => {
    if (!eventDate) { toast.error("Pick the event date"); return; }
    const m = meta(form);
    setFilings(prev => [...prev, { id: Math.random().toString(36).slice(2), form, event: m.event, eventDate, filed: false }]);
    toast.success(`${form} obligation added`);
  };
  const today = new Date();
  const enriched = filings.map(f => {
    const m = meta(f.form);
    const due = new Date(f.eventDate); due.setDate(due.getDate() + (m?.window ?? 30));
    return { ...f, due, daysLeft: differenceInDays(due, today) };
  }).sort((a, b) => a.due.getTime() - b.due.getTime());
  const overdue = enriched.filter(f => !f.filed && f.daysLeft < 0).length;
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><FileClock size={14} className="text-[var(--color-primary)]" /> Event-Based ROC Filing Tracker {overdue > 0 && <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">{overdue} overdue</span>}</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Unlike annual filings, these are triggered by corporate events (allotment, resolution, director change, charge) and must reach MCA within a fixed window - usually 30 days. Log the event date to get the deadline.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className={INP} value={form} onChange={e => setForm(e.target.value)}>
            {FORMS.map(f => <option key={f.form} value={f.form}>{f.form} - {f.event}</option>)}
          </select>
          <input type="date" className={INP} title="Event date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"><Plus size={12} /> Add filing</button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">{meta(form).note}</p>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        {enriched.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-4">No event-based filings tracked. Log a corporate event above.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {enriched.map(f => (
              <div key={f.id} className="py-3 flex items-center gap-3">
                <button onClick={() => setFilings(prev => prev.map(x => x.id === f.id ? { ...x, filed: !x.filed } : x))} className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${f.filed ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{f.filed ? "Filed" : "Pending"}</button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium"><span className="font-mono text-[var(--color-primary)] text-xs">{f.form}</span> · {f.event}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">Event {f.eventDate} · due {format(f.due, "dd MMM yyyy")}</p>
                </div>
                {!f.filed && <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${f.daysLeft < 0 ? "bg-red-900/30 text-red-400 border-red-800/40" : f.daysLeft <= 7 ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{f.daysLeft < 0 ? `${-f.daysLeft}d overdue` : `${f.daysLeft}d left`}</span>}
                <button onClick={() => setFilings(prev => prev.filter(x => x.id !== f.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Late event-based filings attract ₹100/day MCA additional fee with no cap; charge forms (CHG-1) filed beyond 30 days need a separate condonation route. Windows are indicative - confirm the exact rule per form.</p>
    </div>
  );
}

// ── #143 ANNUAL COMPLIANCE MASTER CALENDAR (consolidated GST / IT / ROC / Labour) ─
function AnnualMasterCalendar() {
  const { store } = useApp();
  const now = new Date();
  // Pick the financial year currently in progress (Apr-Mar). fyStart = April of the FY we're in.
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  type Stream = "GST" | "Income Tax" | "ROC / MCA" | "Labour" | "TDS";
  type Row = { stream: Stream; form: string; freq: string; due: Date; note: string };

  const gstReg = store.firm.gstRegistered ?? true;
  const hasPayroll = store.transactions.some(t => t.category === "payroll");

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const d = (m: number, day: number) => {
      // months 3..14 map to Apr(this FY) .. Mar(next year)
      const year = m <= 11 ? fyStartYear : fyStartYear + 1;
      const month = m <= 11 ? m : m - 12;
      return new Date(year, month, day);
    };
    // Monthly recurring (show next occurrence for brevity, plus frequency label)
    out.push({ stream: "TDS", form: "TDS challan (281)", freq: "Monthly · 7th", due: d(now.getMonth(), 7), note: "Deposit tax deducted last month by the 7th." });
    if (gstReg) {
      out.push({ stream: "GST", form: "GSTR-1", freq: "Monthly · 11th", due: d(now.getMonth(), 11), note: "Outward supplies for last month." });
      out.push({ stream: "GST", form: "GSTR-3B", freq: "Monthly · 20th", due: d(now.getMonth(), 20), note: "Summary return + net GST payment." });
    }
    if (hasPayroll) out.push({ stream: "Labour", form: "PF ECR + ESI", freq: "Monthly · 15th", due: d(now.getMonth(), 15), note: "Provident fund & ESI contributions." });
    // Annual / periodic fixed dates within the FY
    out.push({ stream: "Income Tax", form: "Advance tax Q1 (15%)", freq: "15-Jun", due: d(5, 15), note: "First advance-tax instalment." });
    out.push({ stream: "Income Tax", form: "Advance tax Q2 (45%)", freq: "15-Sep", due: d(8, 15), note: "Cumulative 45% of estimated tax." });
    out.push({ stream: "Income Tax", form: "Advance tax Q3 (75%)", freq: "15-Dec", due: d(11, 15), note: "Cumulative 75% of estimated tax." });
    out.push({ stream: "Income Tax", form: "Advance tax Q4 (100%)", freq: "15-Mar", due: d(14, 15), note: "Full estimated tax paid." });
    out.push({ stream: "Income Tax", form: "Tax audit (3CA/3CB-3CD)", freq: "30-Sep", due: d(8, 30), note: "If turnover > ₹1 cr (₹10 cr if cash ≤5%) or §44AB applies." });
    out.push({ stream: "Income Tax", form: "ITR (audited)", freq: "31-Oct", due: d(9, 31), note: "Return for companies/audited assessees." });
    out.push({ stream: "ROC / MCA", form: "DPT-3", freq: "30-Jun", due: d(5, 30), note: "Return of deposits & exempted loans as on 31 Mar." });
    out.push({ stream: "ROC / MCA", form: "DIR-3 KYC", freq: "30-Sep", due: d(8, 30), note: "Annual KYC of every DIN holder." });
    out.push({ stream: "ROC / MCA", form: "AOC-4", freq: "Within 30d of AGM", due: d(9, 29), note: "Financial statements (default 29-Oct for 30-Sep AGM)." });
    out.push({ stream: "ROC / MCA", form: "MGT-7 / 7A", freq: "Within 60d of AGM", due: d(10, 29), note: "Annual return (default 29-Nov)." });
    out.push({ stream: "GST", form: "GSTR-9 / 9C", freq: "31-Dec", due: d(11, 31), note: "Annual return & reconciliation (if turnover > ₹2 cr / ₹5 cr)." });
    out.push({ stream: "ROC / MCA", form: "MSME Form-1 (H2)", freq: "30-Apr", due: d(13, 30), note: "Oct-Mar dues > 45 days to MSE suppliers." });
    out.push({ stream: "ROC / MCA", form: "MSME Form-1 (H1)", freq: "31-Oct", due: d(9, 31), note: "Apr-Sep dues > 45 days to MSE suppliers." });
    return out.sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [fyStartYear, gstReg, hasPayroll]);

  const STREAM_STYLE: Record<Stream, string> = {
    "GST": "bg-blue-900/30 text-blue-400 border-blue-800/40",
    "Income Tax": "bg-orange-900/30 text-orange-400 border-orange-800/40",
    "ROC / MCA": "bg-pink-900/30 text-pink-400 border-pink-800/40",
    "Labour": "bg-green-900/30 text-green-400 border-green-800/40",
    "TDS": "bg-purple-900/30 text-purple-400 border-purple-800/40",
  };
  const STREAMS: Stream[] = ["GST", "Income Tax", "ROC / MCA", "Labour", "TDS"];
  const [active, setActive] = useState<Stream | "all">("all");
  const shown = active === "all" ? rows : rows.filter(r => r.stream === active);

  const copyAll = () => {
    const text = rows.map(r => `${format(r.due, "dd MMM yyyy")}\t${r.stream}\t${r.form}\t${r.freq}`).join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Calendar copied to clipboard")).catch(() => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><CalendarRange size={14} className="text-[var(--color-primary)]" /> Annual Compliance Master Calendar - FY {fyStartYear}-{(fyStartYear + 1).toString().slice(2)}</h3>
            <p className="text-xs text-[var(--color-muted)]">Every statutory due date for the year in one place - GST, income tax, TDS, ROC/MCA and labour - scoped to your firm profile (GST {gstReg ? "registered" : "not registered"}{hasPayroll ? ", payroll active" : ""}).</p>
          </div>
          <button onClick={copyAll} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] shrink-0"><Copy size={12} /> Copy all</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(["all", ...STREAMS] as const).map(s => (
            <button key={s} onClick={() => setActive(s)} className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${active === s ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{s === "all" ? "All streams" : s}</button>
          ))}
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
        {shown.map((r, i) => {
          const days = differenceInDays(r.due, now);
          const urgent = days >= 0 && days <= 14;
          return (
            <div key={`${r.form}-${i}`} className="flex items-center gap-4 px-5 py-3">
              <div className="w-14 text-center shrink-0">
                <p className={`text-base font-bold leading-none ${urgent ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{format(r.due, "d")}</p>
                <p className="text-[10px] text-[var(--color-muted)] uppercase">{format(r.due, "MMM")}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{r.form}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${STREAM_STYLE[r.stream]}`}>{r.stream}</span>
                  <span className="text-[9px] bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] px-1.5 py-0.5 rounded-full">{r.freq}</span>
                </div>
                <p className="text-[10px] text-[var(--color-muted)] truncate">{r.note}</p>
              </div>
              <p className={`text-[10px] shrink-0 ${urgent ? "text-yellow-400 font-semibold" : "text-[var(--color-muted)]"}`}>{days < 0 ? `${-days}d ago` : days === 0 ? "Today" : `in ${days}d`}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Monthly rows show the next occurrence; AGM-linked ROC dates assume a 30-Sep AGM. Adjust for actual AGM date and turnover-based applicability.</p>
    </div>
  );
}

// ── #144 MSME FORM-1 (delayed-payment to MSE suppliers > 45 days) TRACKER ────────
type MsmeDue = { id: string; supplier: string; udyam: string; invoiceDate: string; amount: number; paid: boolean };
function MsmeForm1Tracker() {
  const [dues, setDues] = useFeatureState<MsmeDue[]>("comp-msme-form1", []);
  const [supplier, setSupplier] = useState("");
  const [udyam, setUdyam] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!supplier || amt <= 0) { toast.error("Enter supplier and amount"); return; }
    setDues(prev => [...prev, { id: Math.random().toString(36).slice(2), supplier, udyam, invoiceDate, amount: amt, paid: false }]);
    setSupplier(""); setUdyam(""); setAmount(""); toast.success("Outstanding due added");
  };

  const today = new Date();
  // RBI / MSMED accepted-day default: 45 days. Interest = 3× bank rate (~3 × 6.5% = 19.5% p.a., compounded monthly - simplified to simple here).
  const RATE = 0.195;
  const enriched = dues.map(d => {
    const ageDays = differenceInDays(today, new Date(d.invoiceDate));
    const overdueDays = Math.max(0, ageDays - 45);
    const interest = d.paid ? 0 : (d.amount * RATE * overdueDays) / 365;
    return { ...d, ageDays, overdueDays, interest, reportable: !d.paid && overdueDays > 0 };
  }).sort((a, b) => b.overdueDays - a.overdueDays);

  const reportable = enriched.filter(d => d.reportable);
  const totalReportable = reportable.reduce((s, d) => s + d.amount, 0);
  const totalInterest = reportable.reduce((s, d) => s + d.interest, 0);
  const period = today.getMonth() >= 3 && today.getMonth() <= 8 ? "Apr-Sep (due 31 Oct)" : "Oct-Mar (due 30 Apr)";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Banknote size={14} className="text-[var(--color-primary)]" /> MSME Form-1 - Delayed Payments to MSE Suppliers</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Half-yearly MCA return (MSME-1) disclosing amounts outstanding beyond 45 days to Micro & Small suppliers. Current half-year: <span className="text-[var(--color-text)] font-medium">{period}</span>. Also feeds §43B(h) - unpaid dues lose income-tax deduction.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className={INP} placeholder="MSE supplier name" value={supplier} onChange={e => setSupplier(e.target.value)} />
          <input className={INP} placeholder="Udyam no. (optional)" value={udyam} onChange={e => setUdyam(e.target.value)} />
          <input type="date" className={INP} title="Invoice / supply date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
          <input type="number" className={INP} placeholder="Amount due (₹)" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"><Plus size={12} /> Add outstanding due</button>
      </div>

      {enriched.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Reportable in MSME-1", value: formatCurrency(totalReportable), sub: `${reportable.length} supplier(s) > 45d`, color: reportable.length > 0 ? "text-red-400" : "text-green-400" },
            { label: "Est. interest exposure", value: formatCurrency(totalInterest), sub: "≈ 3× bank rate, simple", color: "text-orange-400" },
            { label: "Total tracked", value: formatCurrency(dues.reduce((s, d) => s + d.amount, 0)), sub: `${dues.length} entries`, color: "text-[var(--color-text)]" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-[11px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        {enriched.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-4">No MSE dues tracked. Add outstanding supplier invoices to compute the MSME-1 disclosure.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {enriched.map(d => (
              <div key={d.id} className="py-3 flex items-center gap-3">
                <button onClick={() => setDues(prev => prev.map(x => x.id === d.id ? { ...x, paid: !x.paid } : x))} className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${d.paid ? "bg-green-900/30 text-green-400 border-green-800/40" : d.reportable ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{d.paid ? "Paid" : d.reportable ? "Reportable" : "Within 45d"}</button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.supplier} {d.udyam && <span className="text-[10px] text-[var(--color-muted)] font-mono">· {d.udyam}</span>}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">Invoice {d.invoiceDate} · {d.ageDays}d old{d.overdueDays > 0 && !d.paid ? ` · ${d.overdueDays}d past 45-day limit` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(d.amount)}</p>
                  {d.reportable && d.interest > 0 && <p className="text-[10px] text-orange-400 tabular-nums">+{formatCurrency(d.interest)} int.</p>}
                </div>
                <button onClick={() => setDues(prev => prev.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />45-day limit applies where there is a written agreement (else 15 days). Interest is compounded monthly under the MSMED Act - figures here are a simplified estimate. Confirm supplier MSE status from their Udyam certificate.</p>
    </div>
  );
}

// ── #145 BENEFICIAL OWNER (SBO / BEN-2) REGISTER ─────────────────────────────────
type Sbo = { id: string; name: string; pan: string; directPct: number; indirectPct: number; declared: boolean };
function BeneficialOwnerRegister() {
  const [owners, setOwners] = useFeatureState<Sbo[]>("comp-sbo-register", []);
  const [name, setName] = useState("");
  const [pan, setPan] = useState("");
  const [directPct, setDirectPct] = useState("");
  const [indirectPct, setIndirectPct] = useState("");

  const add = () => {
    const dp = parseFloat(directPct) || 0;
    const ip = parseFloat(indirectPct) || 0;
    if (!name) { toast.error("Enter the individual's name"); return; }
    if (dp + ip > 100) { toast.error("Holding cannot exceed 100%"); return; }
    setOwners(prev => [...prev, { id: Math.random().toString(36).slice(2), name, pan, directPct: dp, indirectPct: ip, declared: false }]);
    setName(""); setPan(""); setDirectPct(""); setIndirectPct(""); toast.success("Individual added to register");
  };

  // SBO threshold: ≥ 10% beneficial interest (shares/voting/dividend) held indirectly, or with any direct holding.
  const THRESHOLD = 10;
  const enriched = owners.map(o => {
    const total = o.directPct + o.indirectPct;
    // An SBO is significant where the indirect holding (or indirect + any direct) is ≥ 10%.
    const isSbo = (o.indirectPct >= THRESHOLD) || (o.indirectPct > 0 && total >= THRESHOLD);
    const needsBen2 = isSbo && !o.declared;
    return { ...o, total, isSbo, needsBen2 };
  }).sort((a, b) => b.total - a.total);

  const sbos = enriched.filter(o => o.isSbo);
  const pending = enriched.filter(o => o.needsBen2).length;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><UserCog size={14} className="text-[var(--color-primary)]" /> Significant Beneficial Owner (SBO) Register {pending > 0 && <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-semibold">{pending} BEN-2 pending</span>}</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Maintain Form BEN-3 register of individuals holding ≥ 10% beneficial interest (directly or via layered entities). Each SBO files BEN-1 to the company; the company files BEN-2 to ROC within 30 days.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className={INP} placeholder="Individual name" value={name} onChange={e => setName(e.target.value)} />
          <input className={INP} placeholder="PAN (optional)" value={pan} onChange={e => setPan(e.target.value)} />
          <input type="number" className={INP} placeholder="Direct holding %" value={directPct} onChange={e => setDirectPct(e.target.value)} />
          <input type="number" className={INP} placeholder="Indirect holding %" value={indirectPct} onChange={e => setIndirectPct(e.target.value)} />
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90"><Plus size={12} /> Add to register</button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        {enriched.length === 0 ? <p className="text-xs text-[var(--color-muted)] text-center py-4">No individuals tracked. Add holders to identify Significant Beneficial Owners.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {enriched.map(o => (
              <div key={o.id} className="py-3 flex items-center gap-3">
                <button onClick={() => setOwners(prev => prev.map(x => x.id === o.id ? { ...x, declared: !x.declared } : x))} className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${!o.isSbo ? "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]" : o.declared ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"}`}>{!o.isSbo ? "Below 10%" : o.declared ? "BEN-2 filed" : "BEN-2 due"}</button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{o.name} {o.pan && <span className="text-[10px] text-[var(--color-muted)] font-mono">· {o.pan}</span>}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">Direct {o.directPct}% · Indirect {o.indirectPct}% {o.isSbo && <span className="text-[var(--color-primary)] font-medium">· SBO</span>}</p>
                </div>
                <p className={`text-sm font-bold tabular-nums shrink-0 ${o.isSbo ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{o.total}%</p>
                <button onClick={() => setOwners(prev => prev.filter(x => x.id !== o.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
        {sbos.length > 0 && <p className="text-[11px] text-[var(--color-muted)] mt-3 pt-3 border-t border-[var(--color-border)]">{sbos.length} significant beneficial owner(s) identified - each must file BEN-1; the company files BEN-2 within 30 days of receiving it.</p>}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />The 10% SBO threshold tests beneficial interest in shares, voting rights, dividend or control held indirectly (alone or with direct holdings). Pure direct shareholders shown on the register are not SBOs. Determination is fact-specific - confirm with your CS.</p>
    </div>
  );
}

// ── #146 SECRETARIAL STANDARDS (SS-1 board / SS-2 general meetings) CHECKLIST ─────
function SecretarialStandardsChecklist() {
  const [done, setDone] = useFeatureState<Record<string, boolean>>("comp-secretarial-std", {});
  const toggle = (id: string) => setDone(prev => ({ ...prev, [id]: !prev[id] }));

  type Item = { id: string; std: "SS-1" | "SS-2"; text: string };
  const ITEMS: Item[] = [
    { id: "ss1-notice", std: "SS-1", text: "Board notice issued ≥ 7 days before the meeting (with agenda & notes)." },
    { id: "ss1-quorum", std: "SS-1", text: "Quorum present: 1/3rd of total strength or 2 directors, whichever higher." },
    { id: "ss1-freq", std: "SS-1", text: "Minimum 4 board meetings held in the year with gap ≤ 120 days." },
    { id: "ss1-leave", std: "SS-1", text: "No director absent from all meetings for 12 months (vacation of office)." },
    { id: "ss1-minutes", std: "SS-1", text: "Minutes entered in the minute book within 30 days; pages numbered & signed." },
    { id: "ss1-draftcirc", std: "SS-1", text: "Draft minutes circulated to directors within 15 days of the meeting." },
    { id: "ss2-notice21", std: "SS-2", text: "AGM/EGM notice given ≥ 21 clear days to every member, director & auditor." },
    { id: "ss2-explan", std: "SS-2", text: "Explanatory statement annexed for each item of special business." },
    { id: "ss2-quorum", std: "SS-2", text: "Quorum (5/15/30 members per company size) present throughout." },
    { id: "ss2-proxy", std: "SS-2", text: "Proxy form (MGT-11) enclosed; proxies lodged ≥ 48 hours before." },
    { id: "ss2-attend", std: "SS-2", text: "Attendance register maintained and signed by members present." },
    { id: "ss2-minutes", std: "SS-2", text: "General meeting minutes recorded in a separate minute book within 30 days." },
  ];

  const groups: { std: Item["std"]; label: string }[] = [
    { std: "SS-1", label: "SS-1 - Meetings of the Board of Directors" },
    { std: "SS-2", label: "SS-2 - General Meetings" },
  ];
  const total = ITEMS.length;
  const checked = ITEMS.filter(i => done[i.id]).length;
  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> Secretarial Standards Checklist (SS-1 / SS-2)</h3>
            <p className="text-xs text-[var(--color-muted)]">ICSI Secretarial Standards on board and general meetings are mandatory under §118(10). This checklist confirms your meeting process is compliant.</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-2xl font-bold tabular-nums ${pct === 100 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400"}`}>{pct}%</p>
            <p className="text-[10px] text-[var(--color-muted)]">{checked}/{total} confirmed</p>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
          <div className={`h-full ${pct === 100 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {groups.map(g => (
        <div key={g.std} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{g.label}</p></div>
          <div className="divide-y divide-[var(--color-border)]">
            {ITEMS.filter(i => i.std === g.std).map(i => (
              <label key={i.id} className="flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-white/2 transition-colors">
                <input type="checkbox" checked={!!done[i.id]} onChange={() => toggle(i.id)} className="mt-0.5 accent-[var(--color-primary)] shrink-0" />
                <span className={`text-sm ${done[i.id] ? "line-through text-[var(--color-muted)]" : ""}`}>{i.text}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Non-compliance with SS-1/SS-2 is reported in the secretarial audit (MR-3) and can invalidate resolutions. Quorum and notice thresholds vary by company class - verify with your CS.</p>
    </div>
  );
}

// ── #147 GST TURNOVER vs BOOKS RECONCILIATION (GSTR-9C prep) ─────────────────────
function GstTurnoverRecon() {
  const { store } = useApp();
  // Books turnover = positive (income) transactions for the firm.
  const booksTurnover = useMemo(() => store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), [store.transactions]);

  const [gstrTurnover, setGstrTurnover] = useFeatureState<string>("comp-gst-recon-gstr", "");
  const [unbilled, setUnbilled] = useFeatureState<string>("comp-gst-recon-unbilled", "");
  const [exempt, setExempt] = useFeatureState<string>("comp-gst-recon-exempt", "");
  const [nonGst, setNonGst] = useFeatureState<string>("comp-gst-recon-nongst", "");

  const n = (v: string) => parseFloat(v) || 0;
  const gstr = n(gstrTurnover);
  // Adjusted books turnover that should match GST returns = books − exempt/non-GST income + unbilled revenue recognised in books.
  const adjustments = -n(exempt) - n(nonGst) + n(unbilled);
  const adjustedBooks = booksTurnover + adjustments;
  const diff = gstr === 0 ? 0 : adjustedBooks - gstr;
  const absDiff = Math.abs(diff);
  const pctDiff = gstr === 0 ? 0 : (absDiff / gstr) * 100;
  const status = gstr === 0 ? "info" : absDiff < 1 ? "ok" : pctDiff <= 1 ? "minor" : "review";

  const STATUS: Record<string, { cls: string; label: string }> = {
    info: { cls: "bg-[var(--color-accent)] text-[var(--color-muted)]", label: "Enter GST turnover to reconcile" },
    ok: { cls: "bg-green-950/30 text-green-400 border border-green-800/40", label: "Reconciled - books match GST returns" },
    minor: { cls: "bg-yellow-950/30 text-yellow-400 border border-yellow-800/40", label: "Minor difference - within 1%, document the reason" },
    review: { cls: "bg-red-950/30 text-red-400 border border-red-800/40", label: "Material difference - investigate before GSTR-9C" },
  };

  const rows = [
    { label: "Turnover as per books (income)", value: booksTurnover, sub: "From your transactions" },
    { label: "Less: exempt / nil-rated supplies", value: -n(exempt), sub: "Not reported as taxable" },
    { label: "Less: non-GST income (e.g. interest)", value: -n(nonGst), sub: "Outside GST scope" },
    { label: "Add: unbilled revenue in books", value: n(unbilled), sub: "Recognised but not yet invoiced" },
    { label: "Adjusted books turnover", value: adjustedBooks, sub: "Comparable to GST returns", bold: true },
    { label: "Turnover as per GSTR-1 / 3B", value: gstr, sub: "As filed", bold: true },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Scale size={14} className="text-[var(--color-primary)]" /> GST vs Books Turnover Reconciliation</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Reconciles turnover declared in GST returns against your books - the core of GSTR-9C (mandatory above ₹5 cr) and a common GST-audit query. Books turnover is pulled from your transactions; enter GST and adjustment figures below.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Turnover as per GSTR-1 / 3B (₹)</label>
            <input type="number" className={INP} placeholder="As filed in GST returns" value={gstrTurnover} onChange={e => setGstrTurnover(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Unbilled revenue in books (₹)</label>
            <input type="number" className={INP} placeholder="Recognised, not yet invoiced" value={unbilled} onChange={e => setUnbilled(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Exempt / nil-rated supplies (₹)</label>
            <input type="number" className={INP} placeholder="In books, not taxable" value={exempt} onChange={e => setExempt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Non-GST income (₹)</label>
            <input type="number" className={INP} placeholder="e.g. interest, dividend" value={nonGst} onChange={e => setNonGst(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.label} className={`flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0 ${r.bold ? "font-semibold" : ""}`}>
              <div><span>{r.label}</span><span className="text-[10px] text-[var(--color-muted)] ml-2">{r.sub}</span></div>
              <span className={`tabular-nums ${r.value < 0 ? "text-red-400" : ""}`}>{formatCurrency(r.value)}</span>
            </div>
          ))}
        </div>
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm flex items-center justify-between ${STATUS[status].cls}`}>
          <span className="font-medium">{STATUS[status].label}</span>
          {gstr !== 0 && <span className="tabular-nums font-bold">Diff {formatCurrency(diff)} ({pctDiff.toFixed(1)}%)</span>}
        </div>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />A clean reconciliation needs every difference explained (timing, schemes, credit notes, cross-charges). GSTR-9C requires the auditor to certify these adjustments - this is a prep aid, not the certified statement.</p>
    </div>
  );
}
