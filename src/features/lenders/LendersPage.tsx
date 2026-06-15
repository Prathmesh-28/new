import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { Navigate } from "react-router-dom";
import {
  ShieldCheck, TrendingUp, Landmark, CheckCircle2, X,
  Gauge, FileSpreadsheet, ClipboardList, AlertTriangle, Plus, Trash2,
  Users, Scale, ListChecks, CalendarClock, Handshake, History, Star,
  Layers, Lock, Repeat, Phone, Activity, PieChart, Percent, ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import PreviewBadge from "@/components/PreviewBadge";

interface Application {
  id: string;
  business_name: string;
  city: string;
  industry: string;
  loan_amount: number;
  revenue_monthly: number;
  credit_score: number;
  aa_verified: boolean;
  requested_at: string;
}

function BidModal({ app, onClose, onBid }: { app: Application; onClose: () => void; onBid: () => void }) {
  const [rate, setRate]   = useState("");
  const [fee, setFee]     = useState("");
  const [bidding, setBidding] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBidding(true);
    try {
      await api.post("/api/lenders/bid", { application_id: app.id, interest_rate: parseFloat(rate), processing_fee: parseFloat(fee || "0") });
      toast.success(`Bid placed at ${rate}% p.a. You'll be notified of the borrower's decision within 48 hours.`);
      onBid();
      onClose();
    } catch {
      toast.error("Bid failed");
    } finally { setBidding(false); }
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Place Bid</h2>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
          <p className="text-sm font-semibold">{app.business_name}</p>
          <div className="flex gap-3 mt-1 text-xs text-[var(--color-muted)]">
            <span>{app.city} · {app.industry}</span>
            <span>Loan: <span className="text-[var(--color-text)] font-semibold">{formatCurrency(app.loan_amount)}</span></span>
            {app.aa_verified && <span className="text-green-400 flex items-center gap-0.5"><ShieldCheck size={10} /> AA Verified</span>}
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest rate (% p.a.) *</label>
            <input type="number" min="8" max="36" step="0.25" value={rate} onChange={e => setRate(e.target.value)} required className={inp} placeholder="e.g. 14.5" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Processing fee (%)</label>
            <input type="number" min="0" max="5" step="0.1" value={fee} onChange={e => setFee(e.target.value)} className={inp} placeholder="e.g. 1.5" />
          </div>
          {rate && (
            <div className="bg-[var(--color-accent)] rounded-lg p-3 text-xs">
              <p className="text-[var(--color-muted)] mb-1">Monthly interest income (estimated)</p>
              <p className="text-xl font-bold text-[var(--color-primary)]">
                {formatCurrency(app.loan_amount * (parseFloat(rate)/100) / 12)}
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={bidding || !rate}
              className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40">
              {bidding ? "Placing bid…" : "Place Bid"}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type LenderTab = "marketplace" | "covenants" | "borrowing-base" | "mis-pack"
  | "lender-shortlist" | "offer-compare" | "app-tracker" | "disbursement" | "rate-prep" | "repayment-record"
  | "syndication" | "collateral-register" | "refinance-scanner" | "lender-crm" | "utilization-trend"
  | "concentration-risk" | "interest-paid" | "sanction-vs-drawn";

export default function LendersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<LenderTab>("marketplace");

  if (!user || !["investor", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">Lender Dashboard <PreviewBadge capability="lenderMarketplace" /></h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">AA-verified applications · Covenants · Borrowing base · Recurring MIS</p>
        </div>
        <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {([["marketplace", "Marketplace", Landmark], ["covenants", "Covenant Dashboard", Gauge], ["borrowing-base", "Borrowing Base", FileSpreadsheet], ["mis-pack", "MIS Pack", ClipboardList], ["lender-shortlist", "Lender Shortlist", Users], ["offer-compare", "Offer Compare", Scale], ["app-tracker", "Application Tracker", ListChecks], ["disbursement", "Disbursement Plan", CalendarClock], ["rate-prep", "Rate Negotiation", Handshake], ["repayment-record", "Repayment Record", History], ["syndication", "Syndication Split", Layers], ["collateral-register", "Collateral Register", Lock], ["refinance-scanner", "Refinance Scanner", Repeat], ["lender-crm", "Lender CRM", Phone], ["utilization-trend", "Utilization Trend", Activity], ["concentration-risk", "Concentration Risk", PieChart], ["interest-paid", "Interest Paid", Percent], ["sanction-vs-drawn", "Sanction vs Drawn", ArrowLeftRight]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "marketplace" && <Marketplace />}
      {tab === "covenants" && <CovenantDashboard />}
      {tab === "borrowing-base" && <BorrowingBaseGenerator />}
      {tab === "mis-pack" && <LenderMisPack />}
      {tab === "lender-shortlist" && <LenderShortlist />}
      {tab === "offer-compare" && <OfferCompare />}
      {tab === "app-tracker" && <ApplicationTracker />}
      {tab === "disbursement" && <DisbursementPlanner />}
      {tab === "rate-prep" && <RateNegotiationPrep />}
      {tab === "repayment-record" && <RepaymentRecord />}
      {tab === "syndication" && <SyndicationSplit />}
      {tab === "collateral-register" && <CollateralRegister />}
      {tab === "refinance-scanner" && <RefinanceScanner />}
      {tab === "lender-crm" && <LenderCrm />}
      {tab === "utilization-trend" && <UtilizationTrend />}
      {tab === "concentration-risk" && <ConcentrationRisk />}
      {tab === "interest-paid" && <InterestPaidSummary />}
      {tab === "sanction-vs-drawn" && <SanctionVsDrawn />}
    </div>
  );
}

function Marketplace() {
  const [apps, setApps]       = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidApp, setBidApp]   = useState<Application | null>(null);
  const [bids, setBids]       = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<Application[]>("/api/lenders/queue")
      .then(setApps)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3">
        <p className="text-sm font-semibold text-blue-300 mb-1">Co-lending Auction</p>
        <p className="text-xs text-[var(--color-muted)]">Every application goes to 3–5 lenders simultaneously. The business picks the lowest rate. You only pay acquisition cost when you win — no cold-calling, no relationship-building from scratch. All financials are AA-verified, not founder-reported.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "In Queue",      value: apps.length.toString(),                                   color: "text-[var(--color-primary)]" },
          { label: "AA-Verified",   value: apps.filter(a=>a.aa_verified).length.toString(),          color: "text-green-400" },
          { label: "Total Volume",  value: formatCurrency(apps.reduce((s,a)=>s+a.loan_amount,0)),    color: "text-[var(--color-muted)]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
      ) : apps.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Landmark size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No applications in the queue right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <div key={app.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${bids.has(app.id) ? "border-green-700/40" : "border-[var(--color-border)]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-sm font-semibold">{app.business_name}</p>
                    {app.aa_verified && (
                      <span className="flex items-center gap-0.5 text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full">
                        <ShieldCheck size={9} /> AA Verified
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
                    <span>{app.city} · {app.industry}</span>
                    <span>Revenue: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(app.revenue_monthly)}/mo</span></span>
                    <span>Score: <span className={`font-bold ${app.credit_score >= 70 ? "text-green-400" : app.credit_score >= 55 ? "text-yellow-400" : "text-red-400"}`}>{app.credit_score}/100</span></span>
                    <span>Asked: {new Date(app.requested_at).toLocaleDateString("en-IN")}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(app.loan_amount)}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mb-2">loan requested</p>
                  {bids.has(app.id) ? (
                    <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={11} /> Bid placed</span>
                  ) : (
                    <button onClick={() => setBidApp(app)}
                      className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
                      <TrendingUp size={11} /> Place Bid
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {bidApp && <BidModal app={bidApp} onClose={() => setBidApp(null)} onBid={() => setBids(s => new Set([...s, bidApp!.id]))} />}
    </div>
  );
}

const card = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";
const inp  = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

// Shared live-financial snapshot derived from the synced store. Used by every
// lender tool so the borrower and lender see one consistent set of numbers.
function useLenderFinancials() {
  const { store } = useApp();
  return useMemo(() => {
    const txns     = store.transactions ?? [];
    const invoices = store.invoices ?? [];
    const inventory = store.inventory ?? [];
    const banks    = store.bankAccounts ?? [];

    const revenue  = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const expenses = txns.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const interest = txns.filter(t => t.category === "loan").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const ebitda   = revenue - expenses;

    const cash       = banks.reduce((s, b) => s + (b.balance || 0), 0);
    const debtService = store.activeLoans?.reduce((s, l) => s + (l.monthlyEmi || 0) * 12, 0) ?? 0;
    const debtOutstanding = store.activeLoans?.reduce((s, l) => s + (l.outstanding || 0), 0) ?? 0;

    const arOpen     = invoices.filter(i => i.status !== "paid");
    const ar         = arOpen.reduce((s, i) => s + (i.amount || 0), 0);
    const arOverdue  = arOpen.filter(i => i.status === "overdue").reduce((s, i) => s + (i.amount || 0), 0);
    const stockValue = inventory.reduce((s, it) => s + (it.quantity || 0) * (it.unitCost || 0), 0);

    const currentAssets = cash + ar + stockValue;
    const currentRatio  = debtOutstanding > 0 ? currentAssets / debtOutstanding : currentAssets > 0 ? 99 : 0;
    const dscr          = debtService > 0 ? ebitda / debtService : ebitda > 0 ? 99 : 0;
    const leverage      = ebitda > 0 ? debtOutstanding / ebitda : debtOutstanding > 0 ? 99 : 0;
    const interestCover = interest > 0 ? ebitda / interest : ebitda > 0 ? 99 : 0;

    return {
      firmName: store.firm?.name ?? "Your Business",
      revenue, expenses, ebitda, interest, cash, debtService, debtOutstanding,
      ar, arOverdue, stockValue, currentRatio, dscr, leverage, interestCover,
    };
  }, [store]);
}

// ── #117 LENDER COVENANT DASHBOARD ──────────────────────────────────────────────
// All loan covenants in one view, each tested against the live financial snapshot.
// Breach risk = how close the actual sits to the covenant boundary (headroom %).
type CovenantMetric = "dscr" | "currentRatio" | "leverage" | "interestCover";
type CovenantOp = "min" | "max";
interface Covenant {
  id: string;
  label: string;
  metric: CovenantMetric;
  op: CovenantOp;        // "min" → actual must be ≥ threshold; "max" → actual ≤ threshold
  threshold: number;
}

const METRIC_LABEL: Record<CovenantMetric, string> = {
  dscr: "DSCR (EBITDA / debt service)",
  currentRatio: "Current Ratio",
  leverage: "Debt / EBITDA (leverage)",
  interestCover: "Interest Coverage",
};

function CovenantDashboard() {
  const fin = useLenderFinancials();
  const [covenants, setCovenants] = useFeatureState<Covenant[]>("lender-covenants", [
    { id: "c1", label: "Min DSCR", metric: "dscr", op: "min", threshold: 1.25 },
    { id: "c2", label: "Min Current Ratio", metric: "currentRatio", op: "min", threshold: 1.1 },
    { id: "c3", label: "Max Leverage", metric: "leverage", op: "max", threshold: 3.5 },
  ]);
  const [label, setLabel]         = useState("");
  const [metric, setMetric]       = useState<CovenantMetric>("dscr");
  const [op, setOp]               = useState<CovenantOp>("min");
  const [threshold, setThreshold] = useState("");

  const actuals: Record<CovenantMetric, number> = {
    dscr: fin.dscr, currentRatio: fin.currentRatio, leverage: fin.leverage, interestCover: fin.interestCover,
  };

  const rows = covenants.map(c => {
    const actual = actuals[c.metric];
    const breached = c.op === "min" ? actual < c.threshold : actual > c.threshold;
    // headroom: positive % = how much buffer before breach; negative = how far past
    const headroom = c.op === "min"
      ? (actual - c.threshold) / c.threshold
      : (c.threshold - actual) / c.threshold;
    const status: "breach" | "warn" | "ok" = breached ? "breach" : headroom < 0.1 ? "warn" : "ok";
    return { ...c, actual, breached, headroom, status };
  });

  const breaches = rows.filter(r => r.status === "breach").length;
  const warns    = rows.filter(r => r.status === "warn").length;

  const add = () => {
    const t = parseFloat(threshold);
    if (!label.trim() || isNaN(t)) { toast.error("Enter a covenant label and threshold"); return; }
    setCovenants(prev => [...prev, { id: crypto.randomUUID(), label: label.trim(), metric, op, threshold: t }]);
    setLabel(""); setThreshold("");
    toast.success("Covenant added");
  };

  const STATUS = {
    breach: { color: "text-red-400", badge: "bg-red-950/30 text-red-400 border-red-800/40", text: "BREACH" },
    warn:   { color: "text-yellow-400", badge: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40", text: "AT RISK" },
    ok:     { color: "text-green-400", badge: "bg-green-950/30 text-green-400 border-green-800/40", text: "OK" },
  } as const;

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Covenant Dashboard</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Every loan covenant tested live against your synced P&L, balance sheet and debt schedule. Breach risk flags covenants within 10% of their boundary.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Covenants tracked", value: covenants.length.toString(), color: "text-[var(--color-text)]" },
          { label: "At risk", value: warns.toString(), color: warns > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "In breach", value: breaches.toString(), color: breaches > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Covenant", "Required", "Actual", "Headroom", "Status", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No covenants yet — add one below.</td></tr>
            )}
            {rows.map(r => {
              const s = STATUS[r.status];
              return (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.label}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{METRIC_LABEL[r.metric]}</p>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.op === "min" ? "≥" : "≤"} {r.threshold.toFixed(2)}×</td>
                  <td className={`px-4 py-2.5 tabular-nums font-semibold ${s.color}`}>{r.actual >= 99 ? "n/a" : `${r.actual.toFixed(2)}×`}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.headroom < 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{r.actual >= 99 ? "—" : `${(r.headroom * 100).toFixed(0)}%`}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${s.badge}`}>{s.text}</span></td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setCovenants(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add covenant</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label e.g. Min DSCR" className={inp} />
          <select value={metric} onChange={e => setMetric(e.target.value as CovenantMetric)} className={inp}>
            {(Object.keys(METRIC_LABEL) as CovenantMetric[]).map(m => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
          </select>
          <select value={op} onChange={e => setOp(e.target.value as CovenantOp)} className={inp}>
            <option value="min">Minimum (≥)</option>
            <option value="max">Maximum (≤)</option>
          </select>
          <input type="number" step="0.05" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Threshold e.g. 1.25" className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add covenant</button>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Ratios are derived from your live store (EBITDA from revenue minus expenses/payroll, debt service from active loans, current assets = cash + AR + stock). "n/a" appears when there is no debt or no service to test against. Confirm definitions against your facility agreement.
      </div>
    </div>
  );
}

// ── #118 BORROWING-BASE CERTIFICATE GENERATOR ───────────────────────────────────
// Eligible AR (open invoices, less overdue) and eligible stock × advance rates →
// gross drawing power, then net of the outstanding line = available headroom.
function BorrowingBaseGenerator() {
  const fin = useLenderFinancials();
  const [arAdvance, setArAdvance]       = useState("80");
  const [stockAdvance, setStockAdvance] = useState("50");
  const [excludeOverdue, setExcludeOverdue] = useState(true);
  const [lineLimit, setLineLimit]       = useState("");
  const [drawn, setDrawn]               = useState("");

  const arEligible    = excludeOverdue ? Math.max(0, fin.ar - fin.arOverdue) : fin.ar;
  const arRate        = Math.min(100, Math.max(0, parseFloat(arAdvance) || 0));
  const stockRate     = Math.min(100, Math.max(0, parseFloat(stockAdvance) || 0));
  const arDP          = Math.round(arEligible * arRate / 100);
  const stockDP       = Math.round(fin.stockValue * stockRate / 100);
  const grossDP       = arDP + stockDP;
  const limit         = parseFloat(lineLimit) || 0;
  const drawnAmt      = parseFloat(drawn) || 0;
  const cappedDP      = limit > 0 ? Math.min(grossDP, limit) : grossDP;
  const available     = Math.max(0, cappedDP - drawnAmt);
  const overDrawn     = drawnAmt > cappedDP;

  const lines = [
    { label: "Open receivables (AR)", value: fin.ar, sub: "all unpaid invoices" },
    ...(excludeOverdue ? [{ label: "Less: overdue AR (ineligible)", value: -fin.arOverdue, sub: "removed from base" }] : []),
    { label: `Eligible AR × ${arRate}%`, value: arDP, sub: "AR drawing power", bold: true },
    { label: "Inventory at cost", value: fin.stockValue, sub: "quantity × unit cost" },
    { label: `Eligible stock × ${stockRate}%`, value: stockDP, sub: "stock drawing power", bold: true },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet size={14} className="text-[var(--color-primary)]" /> Borrowing-Base Certificate</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Eligible AR and stock from your live data, advanced at the lender's rates, give the drawing power on your working-capital line.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">AR advance rate (%)</label>
            <input type="number" min={0} max={100} value={arAdvance} onChange={e => setArAdvance(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stock advance rate (%)</label>
            <input type="number" min={0} max={100} value={stockAdvance} onChange={e => setStockAdvance(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sanctioned limit (₹, optional)</label>
            <input type="number" min={0} value={lineLimit} onChange={e => setLineLimit(e.target.value)} placeholder="e.g. 5000000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Currently drawn (₹)</label>
            <input type="number" min={0} value={drawn} onChange={e => setDrawn(e.target.value)} placeholder="0" className={inp} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer mt-3">
          <input type="checkbox" checked={excludeOverdue} onChange={e => setExcludeOverdue(e.target.checked)} className="accent-[var(--color-primary)]" />
          Exclude overdue receivables from the eligible base (standard lender practice)
        </label>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">{fin.firmName} — Borrowing-Base Certificate</p>
          <p className="text-[10px] text-[var(--color-muted)]">As at {format(new Date(), "d MMM yyyy")}</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {lines.map(l => (
              <tr key={l.label} className={`border-b border-[var(--color-border)] ${l.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{l.label}<span className="block text-[10px] text-[var(--color-muted)] font-normal">{l.sub}</span></td>
                <td className="px-4 py-2.5 tabular-nums text-right">{l.value < 0 ? `(${formatCurrency(Math.abs(l.value))})` : formatCurrency(l.value)}</td>
              </tr>
            ))}
            <tr className="bg-[var(--color-accent)] font-bold">
              <td className="px-4 py-2.5">Gross Drawing Power</td>
              <td className="px-4 py-2.5 tabular-nums text-right text-[var(--color-primary)]">{formatCurrency(grossDP)}</td>
            </tr>
            {limit > 0 && (
              <tr className="border-b border-[var(--color-border)]">
                <td className="px-4 py-2.5">Capped to sanctioned limit</td>
                <td className="px-4 py-2.5 tabular-nums text-right">{formatCurrency(cappedDP)}</td>
              </tr>
            )}
            <tr className="border-b border-[var(--color-border)]">
              <td className="px-4 py-2.5">Less: amount drawn</td>
              <td className="px-4 py-2.5 tabular-nums text-right text-[var(--color-muted)]">({formatCurrency(drawnAmt)})</td>
            </tr>
            <tr className={`font-bold ${overDrawn ? "bg-red-950/20" : ""}`}>
              <td className="px-4 py-2.5">{overDrawn ? "Excess over drawing power" : "Available headroom"}</td>
              <td className={`px-4 py-2.5 tabular-nums text-right ${overDrawn ? "text-red-400" : "text-green-400"}`}>{overDrawn ? `(${formatCurrency(drawnAmt - cappedDP)})` : formatCurrency(available)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {overDrawn && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0 mt-px" />
          <p className="text-xs text-red-300">Drawn balance exceeds drawing power by {formatCurrency(drawnAmt - cappedDP)}. Expect a margin call or regularisation request — collect receivables or reduce the outstanding.</p>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Eligible AR excludes overdue invoices by default; lenders may also exclude inter-company, &gt;90-day, or concentration balances. Stock is valued at cost from your inventory module. Final eligibility is set by your facility agreement.
      </div>
    </div>
  );
}

// ── #119 LENDER REPORTING PACK (MIS) ─────────────────────────────────────────────
// The recurring MIS lenders demand, auto-built from the live store. Pick a period
// and a cadence; the pack assembles P&L, key ratios, AR and cash from synced data.
function LenderMisPack() {
  const fin = useLenderFinancials();
  const { store } = useApp();
  const [cadence, setCadence] = useFeatureState<"monthly" | "quarterly">("lender-mis-cadence", "monthly");
  const [period, setPeriod]   = useState(() => format(new Date(), "yyyy-MM"));

  // Period-scoped figures from transactions for the selected month.
  const scoped = useMemo(() => {
    const txns = (store.transactions ?? []).filter(t => (t.date || "").startsWith(period));
    const rev  = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const exp  = txns.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    return { rev, exp, profit: rev - exp, count: txns.length };
  }, [store.transactions, period]);

  const sections: { title: string; rows: { label: string; value: string }[] }[] = [
    {
      title: "Profit & Loss (period)",
      rows: [
        { label: "Revenue", value: formatCurrency(scoped.rev) },
        { label: "Operating expenses", value: formatCurrency(scoped.exp) },
        { label: "Net profit", value: formatCurrency(scoped.profit) },
      ],
    },
    {
      title: "Key covenant ratios (live)",
      rows: [
        { label: "DSCR", value: fin.dscr >= 99 ? "n/a" : `${fin.dscr.toFixed(2)}×` },
        { label: "Current ratio", value: fin.currentRatio >= 99 ? "n/a" : `${fin.currentRatio.toFixed(2)}×` },
        { label: "Debt / EBITDA", value: fin.leverage >= 99 ? "n/a" : `${fin.leverage.toFixed(2)}×` },
        { label: "Interest coverage", value: fin.interestCover >= 99 ? "n/a" : `${fin.interestCover.toFixed(2)}×` },
      ],
    },
    {
      title: "Receivables & liquidity",
      rows: [
        { label: "Open receivables", value: formatCurrency(fin.ar) },
        { label: "Overdue receivables", value: formatCurrency(fin.arOverdue) },
        { label: "Inventory at cost", value: formatCurrency(fin.stockValue) },
        { label: "Cash & bank balance", value: formatCurrency(fin.cash) },
        { label: "Debt outstanding", value: formatCurrency(fin.debtOutstanding) },
      ],
    },
  ];

  const copyPack = () => {
    const lines = [
      `${fin.firmName} — Lender MIS (${cadence}) — ${period}`,
      "",
      ...sections.flatMap(s => [s.title, ...s.rows.map(r => `  ${r.label}: ${r.value}`), ""]),
    ].join("\n");
    navigator.clipboard?.writeText(lines)
      .then(() => toast.success("MIS pack copied to clipboard"))
      .catch(() => toast.error("Could not copy"));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} className="text-[var(--color-primary)]" /> Lender MIS Pack</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">The recurring management-information pack lenders demand — auto-assembled from your synced transactions, AR, inventory, cash and debt.</p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reporting period</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cadence (saved)</label>
            <select value={cadence} onChange={e => setCadence(e.target.value as "monthly" | "quarterly")} className={inp}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">{scoped.count} transaction(s) in this period. P&L is period-scoped; ratios, AR and cash reflect the current live position.</p>
      </div>

      {sections.map(s => (
        <div key={s.title} className={`${card} overflow-hidden`}>
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{s.title}</div>
          <table className="w-full text-sm">
            <tbody>
              {s.rows.map(r => (
                <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5">{r.label}</td>
                  <td className="px-4 py-2.5 tabular-nums text-right font-medium">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <button onClick={copyPack} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
        <ClipboardList size={12} /> Copy MIS pack
      </button>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Your selected cadence is saved across devices. Figures are computed from the live store, not audited financials — share alongside your signed statements at each reporting date.
      </div>
    </div>
  );
}

// ── #120 LENDER DIRECTORY & SHORTLIST ────────────────────────────────────────────
// Maintain a working shortlist of lenders with the terms each indicated, then score
// them on a blended fit (rate, speed, relationship). Pick the right partner faster.
interface ShortlistLender {
  id: string;
  name: string;
  type: "Bank" | "NBFC" | "Fintech";
  indicativeRate: number;   // % p.a.
  maxTicket: number;        // ₹
  turnaroundDays: number;
  relationship: 1 | 2 | 3 | 4 | 5;  // existing relationship strength
}

function LenderShortlist() {
  const [lenders, setLenders] = useFeatureState<ShortlistLender[]>("lnd-shortlist", [
    { id: "l1", name: "HDFC Bank",   type: "Bank",    indicativeRate: 12.5, maxTicket: 10000000, turnaroundDays: 14, relationship: 4 },
    { id: "l2", name: "Lendingkart", type: "Fintech", indicativeRate: 18,   maxTicket: 5000000,  turnaroundDays: 3,  relationship: 2 },
    { id: "l3", name: "Bajaj Finserv", type: "NBFC",  indicativeRate: 15,   maxTicket: 7500000,  turnaroundDays: 7,  relationship: 3 },
  ]);
  const [name, setName]     = useState("");
  const [type, setType]     = useState<ShortlistLender["type"]>("Bank");
  const [rate, setRate]     = useState("");
  const [ticket, setTicket] = useState("");
  const [tat, setTat]       = useState("");

  // Blended fit score 0-100: cheaper rate, faster TAT and stronger relationship rank higher.
  const rates = lenders.map(l => l.indicativeRate);
  const tats  = lenders.map(l => l.turnaroundDays);
  const minRate = Math.min(...rates, Infinity), maxRate = Math.max(...rates, 0);
  const minTat  = Math.min(...tats, Infinity),  maxTat  = Math.max(...tats, 0);
  const scored = lenders.map(l => {
    const rateScore = maxRate === minRate ? 1 : (maxRate - l.indicativeRate) / (maxRate - minRate);
    const tatScore  = maxTat === minTat ? 1 : (maxTat - l.turnaroundDays) / (maxTat - minTat);
    const relScore  = l.relationship / 5;
    const score = Math.round((rateScore * 0.5 + tatScore * 0.3 + relScore * 0.2) * 100);
    return { ...l, score };
  }).sort((a, b) => b.score - a.score);

  const add = () => {
    const r = parseFloat(rate), t = parseFloat(ticket), d = parseFloat(tat);
    if (!name.trim() || isNaN(r) || isNaN(t) || isNaN(d)) { toast.error("Fill name, rate, ticket and turnaround"); return; }
    setLenders(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), type, indicativeRate: r, maxTicket: t, turnaroundDays: Math.round(d), relationship: 3 }]);
    setName(""); setRate(""); setTicket(""); setTat("");
    toast.success("Lender added to shortlist");
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Lender Directory & Shortlist</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Track the lenders you are courting and the terms each indicated. The fit score blends rate (50%), turnaround (30%) and relationship strength (20%).</p>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Lender", "Type", "Rate", "Max ticket", "TAT", "Relationship", "Fit", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scored.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No lenders yet — add one below.</td></tr>
            )}
            {scored.map((l, i) => (
              <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{i === 0 && <Star size={11} className="inline mr-1 text-yellow-400" />}{l.name}</td>
                <td className="px-4 py-2.5 text-[var(--color-muted)]">{l.type}</td>
                <td className="px-4 py-2.5 tabular-nums">{l.indicativeRate.toFixed(2)}%</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(l.maxTicket)}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{l.turnaroundDays}d</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setLenders(prev => prev.map(x => x.id === l.id ? { ...x, relationship: n as ShortlistLender["relationship"] } : x))}>
                        <Star size={11} className={n <= l.relationship ? "text-yellow-400 fill-yellow-400" : "text-[var(--color-muted)] opacity-40"} />
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5"><span className={`text-xs font-bold tabular-nums ${l.score >= 70 ? "text-green-400" : l.score >= 45 ? "text-yellow-400" : "text-red-400"}`}>{l.score}</span></td>
                <td className="px-4 py-2.5">
                  <button onClick={() => setLenders(prev => prev.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add lender</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Lender name" className={inp} />
          <select value={type} onChange={e => setType(e.target.value as ShortlistLender["type"])} className={inp}>
            <option value="Bank">Bank</option><option value="NBFC">NBFC</option><option value="Fintech">Fintech</option>
          </select>
          <input type="number" step="0.25" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate %" className={inp} />
          <input type="number" value={ticket} onChange={e => setTicket(e.target.value)} placeholder="Max ticket ₹" className={inp} />
          <input type="number" value={tat} onChange={e => setTat(e.target.value)} placeholder="TAT days" className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add lender</button>
      </div>
    </div>
  );
}

// ── #121 LOAN-OFFER COMPARISON ───────────────────────────────────────────────────
// Put competing offers side by side and rank them on true cost: total interest over
// tenure plus processing fee, expressed as an effective annual cost on the principal.
interface LoanOffer {
  id: string;
  lender: string;
  amount: number;
  rate: number;       // % p.a. (reducing)
  tenureMonths: number;
  feePct: number;     // processing fee % of principal
}

function offerMetrics(o: LoanOffer) {
  const r = o.rate / 100 / 12;
  const n = o.tenureMonths;
  const emi = r > 0 ? (o.amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : o.amount / n;
  const totalPaid = emi * n;
  const totalInterest = totalPaid - o.amount;
  const fee = o.amount * o.feePct / 100;
  const totalCost = totalInterest + fee;
  // Effective annual cost = total cost / principal, annualised over the tenure.
  const effectiveAnnual = o.amount > 0 ? (totalCost / o.amount) / (n / 12) * 100 : 0;
  return { emi, totalInterest, fee, totalCost, effectiveAnnual };
}

function OfferCompare() {
  const [offers, setOffers] = useState<LoanOffer[]>([
    { id: "o1", lender: "HDFC Bank",   amount: 5000000, rate: 12.5, tenureMonths: 36, feePct: 1.0 },
    { id: "o2", lender: "Lendingkart", amount: 5000000, rate: 17,   tenureMonths: 24, feePct: 2.0 },
  ]);
  const [lender, setLender]   = useState("");
  const [amount, setAmount]   = useState("");
  const [rate, setRate]       = useState("");
  const [tenure, setTenure]   = useState("");
  const [fee, setFee]         = useState("");

  const rows = offers.map(o => ({ ...o, m: offerMetrics(o) }));
  const best = rows.length ? rows.reduce((a, b) => b.m.effectiveAnnual < a.m.effectiveAnnual ? b : a) : null;

  const add = () => {
    const a = parseFloat(amount), r = parseFloat(rate), t = parseFloat(tenure), f = parseFloat(fee || "0");
    if (!lender.trim() || isNaN(a) || isNaN(r) || isNaN(t) || t <= 0) { toast.error("Fill lender, amount, rate and tenure"); return; }
    setOffers(prev => [...prev, { id: crypto.randomUUID(), lender: lender.trim(), amount: a, rate: r, tenureMonths: Math.round(t), feePct: isNaN(f) ? 0 : f }]);
    setLender(""); setAmount(""); setRate(""); setTenure(""); setFee("");
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Loan-Offer Comparison</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Compare competing sanctions on true cost — EMI, total interest, processing fee and an effective annual cost so headline rates do not mislead.</p>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Lender", "Amount", "Rate", "Tenure", "EMI", "Total interest", "Fee", "Effective cost", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No offers yet — add one below.</td></tr>
            )}
            {rows.map(o => {
              const isBest = best?.id === o.id;
              return (
                <tr key={o.id} className={`border-b border-[var(--color-border)] last:border-0 ${isBest ? "bg-green-950/15" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{isBest && <Star size={11} className="inline mr-1 text-green-400" />}{o.lender}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(o.amount)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{o.rate.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{o.tenureMonths}m</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(o.m.emi))}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(o.m.totalInterest))}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(o.m.fee))}</td>
                  <td className={`px-4 py-2.5 tabular-nums font-bold ${isBest ? "text-green-400" : "text-[var(--color-text)]"}`}>{o.m.effectiveAnnual.toFixed(2)}%</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setOffers(prev => prev.filter(x => x.id !== o.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {best && rows.length > 1 && (
        <div className="rounded-lg border border-green-800/40 bg-green-950/20 px-4 py-3 text-xs text-green-300">
          Lowest effective cost: <span className="font-semibold">{best.lender}</span> at {best.m.effectiveAnnual.toFixed(2)}% effective annual cost ({formatCurrency(Math.round(best.m.totalCost))} total cost of credit).
        </div>
      )}

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add offer</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input value={lender} onChange={e => setLender(e.target.value)} placeholder="Lender" className={inp} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ₹" className={inp} />
          <input type="number" step="0.25" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate % p.a." className={inp} />
          <input type="number" value={tenure} onChange={e => setTenure(e.target.value)} placeholder="Tenure (months)" className={inp} />
          <input type="number" step="0.1" value={fee} onChange={e => setFee(e.target.value)} placeholder="Fee %" className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add offer</button>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        EMI assumes a reducing-balance loan. Effective annual cost = (total interest + processing fee) ÷ principal, annualised over the tenure — a simple comparison metric, not a regulatory APR. Confirm GST on fees and any insurance separately.
      </div>
    </div>
  );
}

// ── #122 APPLICATION-STATUS TRACKER ──────────────────────────────────────────────
// Track each live application through the funnel from submission to disbursal, so
// no lender goes dark and follow-ups happen on time.
type AppStage = "submitted" | "docs" | "underwriting" | "sanctioned" | "disbursed" | "declined";
interface TrackedApp {
  id: string;
  lender: string;
  amount: number;
  stage: AppStage;
  appliedOn: string;     // yyyy-MM-dd
}

const STAGE_ORDER: AppStage[] = ["submitted", "docs", "underwriting", "sanctioned", "disbursed"];
const STAGE_LABEL: Record<AppStage, string> = {
  submitted: "Submitted", docs: "Docs pending", underwriting: "Underwriting",
  sanctioned: "Sanctioned", disbursed: "Disbursed", declined: "Declined",
};

function ApplicationTracker() {
  const [apps, setApps] = useFeatureState<TrackedApp[]>("lnd-app-tracker", [
    { id: "a1", lender: "HDFC Bank",   amount: 5000000, stage: "underwriting", appliedOn: "2026-05-28" },
    { id: "a2", lender: "Lendingkart", amount: 2500000, stage: "sanctioned",   appliedOn: "2026-06-02" },
  ]);
  const [lender, setLender] = useState("");
  const [amount, setAmount] = useState("");

  const add = () => {
    const a = parseFloat(amount);
    if (!lender.trim() || isNaN(a)) { toast.error("Enter lender and amount"); return; }
    setApps(prev => [...prev, { id: crypto.randomUUID(), lender: lender.trim(), amount: a, stage: "submitted", appliedOn: format(new Date(), "yyyy-MM-dd") }]);
    setLender(""); setAmount("");
    toast.success("Application added");
  };

  const setStage = (id: string, stage: AppStage) =>
    setApps(prev => prev.map(x => x.id === id ? { ...x, stage } : x));

  const active = apps.filter(a => a.stage !== "disbursed" && a.stage !== "declined").length;
  const sanctionedValue = apps.filter(a => a.stage === "sanctioned" || a.stage === "disbursed").reduce((s, a) => s + a.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Application-Status Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Every live application from submission to disbursal, so nothing stalls and follow-ups land on time.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total applications", value: apps.length.toString(), color: "text-[var(--color-text)]" },
          { label: "In progress", value: active.toString(), color: "text-yellow-400" },
          { label: "Sanctioned value", value: formatCurrency(sanctionedValue), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {apps.length === 0 && (
          <div className="border border-dashed border-[var(--color-border)] rounded-xl p-8 text-center text-xs text-[var(--color-muted)]">No applications tracked yet.</div>
        )}
        {apps.map(a => {
          const declined = a.stage === "declined";
          const stepIdx = STAGE_ORDER.indexOf(a.stage);
          return (
            <div key={a.id} className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold">{a.lender}</p>
                  <p className="text-xs text-[var(--color-muted)]">{formatCurrency(a.amount)} · applied {format(new Date(a.appliedOn), "d MMM yyyy")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={a.stage} onChange={e => setStage(a.id, e.target.value as AppStage)} className={`${inp} w-auto py-1.5 text-xs`}>
                    {(Object.keys(STAGE_LABEL) as AppStage[]).map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                  </select>
                  <button onClick={() => setApps(prev => prev.filter(x => x.id !== a.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
              {declined ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-red-950/30 text-red-400 border-red-800/40">DECLINED</span>
              ) : (
                <div className="flex items-center gap-1">
                  {STAGE_ORDER.map((s, i) => (
                    <div key={s} className="flex-1 flex flex-col items-center gap-1">
                      <div className={`w-full h-1.5 rounded-full ${i <= stepIdx ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`} />
                      <span className={`text-[9px] ${i <= stepIdx ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}`}>{STAGE_LABEL[s]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Track new application</h3>
        <div className="grid grid-cols-2 gap-3">
          <input value={lender} onChange={e => setLender(e.target.value)} placeholder="Lender" className={inp} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ₹" className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add</button>
      </div>
    </div>
  );
}

// ── #123 DISBURSEMENT / DRAWDOWN PLANNER ─────────────────────────────────────────
// Split a sanction into staged tranches and see, per draw, the date, amount, the
// cumulative utilization and the undrawn balance against the sanctioned limit.
interface Tranche { id: string; date: string; amount: number; note: string; }

function DisbursementPlanner() {
  const [sanction, setSanction]   = useState("5000000");
  const [tranches, setTranches]   = useFeatureState<Tranche[]>("lnd-disbursement", [
    { id: "t1", date: "2026-06-20", amount: 2000000, note: "Initial draw" },
    { id: "t2", date: "2026-08-01", amount: 1500000, note: "Inventory build-up" },
  ]);
  const [date, setDate]     = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote]     = useState("");

  const sanctionAmt = parseFloat(sanction) || 0;
  const sorted = [...tranches].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const rows = sorted.map(t => {
    running += t.amount;
    return { ...t, cumulative: running, undrawn: sanctionAmt - running };
  });
  const totalDrawn = running;
  const overSanction = totalDrawn > sanctionAmt && sanctionAmt > 0;

  const add = () => {
    const a = parseFloat(amount);
    if (!date || isNaN(a) || a <= 0) { toast.error("Pick a date and a positive amount"); return; }
    setTranches(prev => [...prev, { id: crypto.randomUUID(), date, amount: a, note: note.trim() }]);
    setDate(""); setAmount(""); setNote("");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Disbursement / Drawdown Planner</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Stage a sanction into tranches and watch cumulative utilization against the limit, so you draw only what you need when you need it.</p>
        <div className="mt-3 max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Sanctioned limit (₹)</label>
          <input type="number" value={sanction} onChange={e => setSanction(e.target.value)} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Sanctioned", value: formatCurrency(sanctionAmt), color: "text-[var(--color-text)]" },
          { label: "Total drawn", value: formatCurrency(totalDrawn), color: overSanction ? "text-red-400" : "text-[var(--color-primary)]" },
          { label: "Undrawn", value: formatCurrency(Math.max(0, sanctionAmt - totalDrawn)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Date", "Tranche", "Cumulative", "Undrawn", "Note", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No tranches planned yet.</td></tr>
            )}
            {rows.map(t => (
              <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 tabular-nums">{format(new Date(t.date), "d MMM yyyy")}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(t.amount)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(t.cumulative)}</td>
                <td className={`px-4 py-2.5 tabular-nums ${t.undrawn < 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{t.undrawn < 0 ? `(${formatCurrency(Math.abs(t.undrawn))})` : formatCurrency(t.undrawn)}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{t.note || "—"}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => setTranches(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {overSanction && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0 mt-px" />
          <p className="text-xs text-red-300">Planned draws exceed the sanctioned limit by {formatCurrency(totalDrawn - sanctionAmt)}. Reduce a tranche or request a limit enhancement.</p>
        </div>
      )}

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add tranche</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ₹" className={inp} />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add tranche</button>
      </div>
    </div>
  );
}

// ── #124 RATE-NEGOTIATION PREP SHEET ─────────────────────────────────────────────
// Assemble the leverage points that justify a rate cut — strong ratios, clean
// repayment, low utilization — into talking points and a defensible target rate.
function RateNegotiationPrep() {
  const fin = useLenderFinancials();
  const { store } = useApp();
  const loans = store.activeLoans ?? [];
  const [currentRate, setCurrentRate] = useState(() => {
    const wavg = loans.length ? loans.reduce((s, l) => s + l.rate * l.outstanding, 0) / loans.reduce((s, l) => s + l.outstanding, 0) : 0;
    return wavg ? wavg.toFixed(2) : "15";
  });

  const cur = parseFloat(currentRate) || 0;

  // Each strong signal earns basis-point arguing room toward a lower rate.
  const points = [
    { ok: fin.dscr >= 1.5 && fin.dscr < 99, bps: 50, label: "DSCR comfortably above 1.5×", detail: fin.dscr >= 99 ? "no debt service to test" : `DSCR is ${fin.dscr.toFixed(2)}×` },
    { ok: fin.leverage < 2.5 && fin.leverage < 99, bps: 50, label: "Leverage (debt/EBITDA) under 2.5×", detail: fin.leverage >= 99 ? "no debt outstanding" : `${fin.leverage.toFixed(2)}×` },
    { ok: fin.currentRatio >= 1.5 && fin.currentRatio < 99, bps: 25, label: "Healthy current ratio", detail: fin.currentRatio >= 99 ? "n/a" : `${fin.currentRatio.toFixed(2)}×` },
    { ok: fin.interestCover >= 3 && fin.interestCover < 99, bps: 25, label: "Strong interest coverage", detail: fin.interestCover >= 99 ? "n/a" : `${fin.interestCover.toFixed(2)}×` },
    { ok: fin.arOverdue / Math.max(1, fin.ar) < 0.1, bps: 25, label: "Receivables largely current", detail: `${((fin.arOverdue / Math.max(1, fin.ar)) * 100).toFixed(0)}% overdue` },
    { ok: fin.cash > fin.debtService, bps: 25, label: "Cash buffer exceeds annual debt service", detail: `${formatCurrency(fin.cash)} cash` },
  ];

  const earnedBps = points.filter(p => p.ok).reduce((s, p) => s + p.bps, 0);
  const targetRate = Math.max(8, cur - earnedBps / 100);
  const annualSaving = loans.reduce((s, l) => s + l.outstanding, 0) * (earnedBps / 100) / 100;

  const copy = () => {
    const text = [
      `${fin.firmName} — Rate negotiation brief`,
      `Current weighted rate: ${cur.toFixed(2)}%  →  Target: ${targetRate.toFixed(2)}%`,
      "",
      "Leverage points:",
      ...points.filter(p => p.ok).map(p => `  • ${p.label} (${p.detail}) — worth ~${p.bps}bps`),
      "",
      `Indicative annual saving on current outstanding: ${formatCurrency(Math.round(annualSaving))}`,
    ].join("\n");
    navigator.clipboard?.writeText(text).then(() => toast.success("Negotiation brief copied")).catch(() => toast.error("Could not copy"));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Handshake size={14} className="text-[var(--color-primary)]" /> Rate-Negotiation Prep</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Turn your live financial strength into a defensible ask. Each strong signal earns arguing room (basis points) toward a lower rate.</p>
        <div className="mt-3 max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Current rate (% p.a.)</label>
          <input type="number" step="0.25" value={currentRate} onChange={e => setCurrentRate(e.target.value)} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Arguing room", value: `${earnedBps} bps`, color: "text-[var(--color-primary)]" },
          { label: "Target rate", value: `${targetRate.toFixed(2)}%`, color: "text-green-400" },
          { label: "Est. annual saving", value: formatCurrency(Math.round(annualSaving)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-2.5 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Leverage points</div>
        <table className="w-full text-sm">
          <tbody>
            {points.map(p => (
              <tr key={p.label} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    {p.ok ? <CheckCircle2 size={13} className="text-green-400" /> : <X size={13} className="text-[var(--color-muted)]" />}
                    <span className={p.ok ? "" : "text-[var(--color-muted)]"}>{p.label}</span>
                  </span>
                  <span className="block text-[10px] text-[var(--color-muted)] ml-5">{p.detail}</span>
                </td>
                <td className={`px-4 py-2.5 tabular-nums text-right ${p.ok ? "text-green-400 font-semibold" : "text-[var(--color-muted)]"}`}>{p.ok ? `+${p.bps} bps` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={copy} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
        <Handshake size={12} /> Copy negotiation brief
      </button>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Basis-point values are indicative anchors for your conversation, not a lender commitment. The achievable cut depends on the lender's cost of funds, your repayment track record and prevailing rates.
      </div>
    </div>
  );
}

// ── #125 REPAYMENT TRACK-RECORD SHEET ────────────────────────────────────────────
// A per-loan record of how far through each loan you are and how much you have
// repaid — the credibility sheet lenders ask for before pricing a new facility.
function RepaymentRecord() {
  const { store } = useApp();
  const loans = store.activeLoans ?? [];

  const rows = loans.map(l => {
    const repaidPrincipal = Math.max(0, l.principal - l.outstanding);
    const pctRepaid = l.principal > 0 ? repaidPrincipal / l.principal : 0;
    // Months elapsed inferred from how much principal has amortised vs EMI count.
    const monthsElapsed = l.monthlyEmi > 0 ? Math.min(l.termMonths, Math.round((l.principal - l.outstanding) / l.monthlyEmi)) : 0;
    const monthsLeft = Math.max(0, l.termMonths - monthsElapsed);
    return { ...l, repaidPrincipal, pctRepaid, monthsElapsed, monthsLeft };
  });

  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  const totalRepaid    = rows.reduce((s, r) => s + r.repaidPrincipal, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><History size={14} className="text-[var(--color-primary)]" /> Repayment Track-Record</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">How far through each active loan you are, built from your synced debt schedule — the credibility sheet a new lender asks for before pricing.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total borrowed", value: formatCurrency(totalPrincipal), color: "text-[var(--color-text)]" },
          { label: "Principal repaid", value: formatCurrency(totalRepaid), color: "text-green-400" },
          { label: "Still outstanding", value: formatCurrency(totalOutstanding), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <History size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No active loans in your synced debt schedule yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold">{r.lender}</p>
                  <p className="text-xs text-[var(--color-muted)]">{formatCurrency(r.principal)} @ {r.rate.toFixed(2)}% · {r.termMonths}m term · EMI {formatCurrency(r.monthlyEmi)}</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-green-400">{(r.pctRepaid * 100).toFixed(0)}% repaid</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--color-border)] overflow-hidden mb-2">
                <div className="h-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, r.pctRepaid * 100)}%` }} />
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-[var(--color-muted)]">
                <span>Repaid: <span className="text-[var(--color-text)] font-medium">{formatCurrency(r.repaidPrincipal)}</span></span>
                <span>Outstanding: <span className="text-[var(--color-text)] font-medium">{formatCurrency(r.outstanding)}</span></span>
                <span>~{r.monthsElapsed} of {r.termMonths} months in</span>
                <span>{r.monthsLeft} months to go</span>
                <span>Next EMI: {format(new Date(r.nextPaymentDate), "d MMM yyyy")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Months elapsed is inferred from principal amortised against the EMI and may differ from the actual schedule for irregular or interest-only loans. Pair with your bank statement for a lender-ready record.
      </div>
    </div>
  );
}

// ── #126 SYNDICATION / MULTI-LENDER SPLIT ────────────────────────────────────────
// Split one facility across several lenders, each with its own share and rate, then
// see the blended cost of the whole syndicate and whether the shares add to 100%.
interface SyndPart { id: string; lender: string; sharePct: number; rate: number; }

function SyndicationSplit() {
  const [facility, setFacility] = useState("10000000");
  const [parts, setParts]       = useFeatureState<SyndPart[]>("lnd-syndication", [
    { id: "s1", lender: "Lead Bank (HDFC)", sharePct: 50, rate: 12.5 },
    { id: "s2", lender: "NBFC participant",  sharePct: 30, rate: 15 },
    { id: "s3", lender: "Fintech participant", sharePct: 20, rate: 17 },
  ]);
  const [lender, setLender] = useState("");
  const [share, setShare]   = useState("");
  const [rate, setRate]     = useState("");

  const facilityAmt = parseFloat(facility) || 0;
  const totalShare   = parts.reduce((s, p) => s + p.sharePct, 0);
  const blendedRate  = totalShare > 0 ? parts.reduce((s, p) => s + p.sharePct * p.rate, 0) / totalShare : 0;
  const rows = parts.map(p => ({ ...p, amount: facilityAmt * p.sharePct / 100 }));
  const balanced = Math.abs(totalShare - 100) < 0.01;

  const add = () => {
    const sh = parseFloat(share), r = parseFloat(rate);
    if (!lender.trim() || isNaN(sh) || sh <= 0 || isNaN(r)) { toast.error("Enter lender, share % and rate"); return; }
    setParts(prev => [...prev, { id: crypto.randomUUID(), lender: lender.trim(), sharePct: sh, rate: r }]);
    setLender(""); setShare(""); setRate("");
    toast.success("Participant added");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Syndication / Multi-Lender Split</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Spread one facility across several lenders under RBI co-lending. Each participant's share and rate roll up into a blended cost for the whole syndicate.</p>
        <div className="mt-3 max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Total facility (₹)</label>
          <input type="number" value={facility} onChange={e => setFacility(e.target.value)} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Participants", value: parts.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Share allocated", value: `${totalShare.toFixed(1)}%`, color: balanced ? "text-green-400" : "text-yellow-400" },
          { label: "Blended rate", value: `${blendedRate.toFixed(2)}%`, color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Participant", "Share", "Amount", "Rate", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No participants yet — add one below.</td></tr>
            )}
            {rows.map(p => (
              <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{p.lender}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.sharePct.toFixed(1)}%</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(p.amount))}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{p.rate.toFixed(2)}%</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => setParts(prev => prev.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!balanced && parts.length > 0 && (
        <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-px" />
          <p className="text-xs text-yellow-300">Shares total {totalShare.toFixed(1)}%, not 100%. {totalShare < 100 ? `${(100 - totalShare).toFixed(1)}% of the facility is still unallocated.` : `Over-allocated by ${(totalShare - 100).toFixed(1)}% — trim a participant's share.`}</p>
        </div>
      )}

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add participant</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={lender} onChange={e => setLender(e.target.value)} placeholder="Lender" className={inp} />
          <input type="number" step="0.5" value={share} onChange={e => setShare(e.target.value)} placeholder="Share %" className={inp} />
          <input type="number" step="0.25" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate % p.a." className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add participant</button>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Blended rate is share-weighted across participants. Co-lending under RBI norms typically requires the originating lender to retain a minimum share — confirm the split against the inter-lender agreement.
      </div>
    </div>
  );
}

// ── #127 SECURITY / COLLATERAL REGISTER ──────────────────────────────────────────
// Every asset pledged as security, its value net of a lender haircut, summed into
// total realisable cover, then tested against the exposure it secures.
interface Collateral { id: string; asset: string; type: "Property" | "Plant & Machinery" | "Stock" | "Receivables" | "Fixed Deposit" | "Other"; value: number; haircutPct: number; }

function CollateralRegister() {
  const [exposure, setExposure] = useState("8000000");
  const [items, setItems]       = useFeatureState<Collateral[]>("lnd-collateral-register", [
    { id: "k1", asset: "Factory premises", type: "Property", value: 9000000, haircutPct: 25 },
    { id: "k2", asset: "CNC machinery",    type: "Plant & Machinery", value: 3000000, haircutPct: 40 },
    { id: "k3", asset: "Pledged FD",       type: "Fixed Deposit", value: 1000000, haircutPct: 10 },
  ]);
  const [asset, setAsset]   = useState("");
  const [type, setType]     = useState<Collateral["type"]>("Property");
  const [value, setValue]   = useState("");
  const [haircut, setHaircut] = useState("");

  const exposureAmt = parseFloat(exposure) || 0;
  const rows = items.map(c => ({ ...c, realisable: Math.round(c.value * (1 - Math.min(100, Math.max(0, c.haircutPct)) / 100)) }));
  const grossValue   = rows.reduce((s, r) => s + r.value, 0);
  const realisable   = rows.reduce((s, r) => s + r.realisable, 0);
  const coverage     = exposureAmt > 0 ? realisable / exposureAmt : realisable > 0 ? 99 : 0;
  const shortfall    = Math.max(0, exposureAmt - realisable);

  const add = () => {
    const v = parseFloat(value), h = parseFloat(haircut || "0");
    if (!asset.trim() || isNaN(v) || v <= 0) { toast.error("Enter asset and a positive value"); return; }
    setItems(prev => [...prev, { id: crypto.randomUUID(), asset: asset.trim(), type, value: v, haircutPct: isNaN(h) ? 0 : h }]);
    setAsset(""); setValue(""); setHaircut("");
    toast.success("Collateral added");
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Lock size={14} className="text-[var(--color-primary)]" /> Security / Collateral Register</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Every asset pledged as security, valued net of the lender's haircut, summed into realisable cover and tested against the exposure it secures.</p>
        <div className="mt-3 max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Secured exposure (₹)</label>
          <input type="number" value={exposure} onChange={e => setExposure(e.target.value)} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gross security value", value: formatCurrency(grossValue), color: "text-[var(--color-text)]" },
          { label: "Realisable cover", value: formatCurrency(realisable), color: "text-[var(--color-primary)]" },
          { label: "Cover ratio", value: coverage >= 99 ? "n/a" : `${(coverage * 100).toFixed(0)}%`, color: coverage >= 1 || coverage >= 99 ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Asset", "Type", "Value", "Haircut", "Realisable", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No collateral recorded yet — add one below.</td></tr>
            )}
            {rows.map(c => (
              <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">{c.asset}</td>
                <td className="px-4 py-2.5 text-[var(--color-muted)]">{c.type}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(c.value)}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{c.haircutPct.toFixed(0)}%</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(c.realisable)}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => setItems(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shortfall > 0 && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0 mt-px" />
          <p className="text-xs text-red-300">Realisable cover falls short of the exposure by {formatCurrency(shortfall)}. Expect a top-up security demand or a margin shortfall notice — pledge an additional asset or reduce the outstanding.</p>
        </div>
      )}

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add collateral</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={asset} onChange={e => setAsset(e.target.value)} placeholder="Asset" className={inp} />
          <select value={type} onChange={e => setType(e.target.value as Collateral["type"])} className={inp}>
            {(["Property", "Plant & Machinery", "Stock", "Receivables", "Fixed Deposit", "Other"] as const).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Value ₹" className={inp} />
          <input type="number" step="1" value={haircut} onChange={e => setHaircut(e.target.value)} placeholder="Haircut %" className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add collateral</button>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Haircuts are your estimate of the lender's discount to forced-sale value; banks apply their own valuation and may exclude certain asset classes. "n/a" cover appears when no exposure is entered. Confirm against the hypothecation deed.
      </div>
    </div>
  );
}

// ── #128 REFINANCE-OPPORTUNITY SCANNER ───────────────────────────────────────────
// Scans the live debt schedule for loans priced above a benchmark market rate and
// estimates the annual interest you would save by refinancing each to that rate.
function RefinanceScanner() {
  const { store } = useApp();
  const loans = store.activeLoans ?? [];
  const [marketRate, setMarketRate] = useState("13");

  const target = parseFloat(marketRate) || 0;
  const rows = loans.map(l => {
    const gap = l.rate - target;                       // % points above market
    const annualSaving = gap > 0 ? l.outstanding * gap / 100 : 0;
    return { ...l, gap, annualSaving, candidate: gap > 0.5 };
  }).sort((a, b) => b.annualSaving - a.annualSaving);

  const candidates  = rows.filter(r => r.candidate);
  const totalSaving = candidates.reduce((s, r) => s + r.annualSaving, 0);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Refinance-Opportunity Scanner</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Scans your synced debt schedule for loans priced above the current market rate and estimates the annual interest you would save by refinancing each.</p>
        <div className="mt-3 max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Benchmark market rate (% p.a.)</label>
          <input type="number" step="0.25" value={marketRate} onChange={e => setMarketRate(e.target.value)} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Loans scanned", value: loans.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Refinance candidates", value: candidates.length.toString(), color: candidates.length > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Est. annual saving", value: formatCurrency(Math.round(totalSaving)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Repeat size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No active loans in your synced debt schedule to scan.</p>
        </div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Loan", "Outstanding", "Current rate", "vs Market", "Est. annual saving", "Status"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`border-b border-[var(--color-border)] last:border-0 ${r.candidate ? "bg-yellow-950/10" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.outstanding)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.rate.toFixed(2)}%</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.gap > 0 ? "text-red-400" : "text-green-400"}`}>{r.gap > 0 ? "+" : ""}{r.gap.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{r.annualSaving > 0 ? formatCurrency(Math.round(r.annualSaving)) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${r.candidate ? "bg-yellow-950/30 text-yellow-400 border-yellow-800/40" : "bg-green-950/30 text-green-400 border-green-800/40"}`}>{r.candidate ? "REFINANCE" : "AT MARKET"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Saving is the first-year interest gap on the current outstanding; it ignores foreclosure charges, processing fees on the new loan and the residual tenure. A loan is flagged only when it sits more than 0.5% above your benchmark. Run the numbers net of switching costs before acting.
      </div>
    </div>
  );
}

// ── #129 LENDER-RELATIONSHIP CRM ─────────────────────────────────────────────────
// A light CRM for the lender relationships you are managing — owner, last contact,
// next action and date — surfacing follow-ups that are due or overdue today.
interface LenderContact { id: string; lender: string; contact: string; lastContacted: string; nextAction: string; nextDate: string; }

function LenderCrm() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [contacts, setContacts] = useFeatureState<LenderContact[]>("lnd-relationship-crm", [
    { id: "r1", lender: "HDFC Bank",   contact: "RM — Priya Nair",  lastContacted: "2026-06-05", nextAction: "Submit Q1 stock statement", nextDate: "2026-06-12" },
    { id: "r2", lender: "Bajaj Finserv", contact: "Credit — Amit Shah", lastContacted: "2026-06-10", nextAction: "Renewal review call",     nextDate: "2026-06-25" },
  ]);
  const [lender, setLender]   = useState("");
  const [contact, setContact] = useState("");
  const [action, setAction]   = useState("");
  const [nextDate, setNextDate] = useState("");

  const rows = contacts.map(c => {
    const overdue = !!c.nextDate && c.nextDate < today;
    const dueToday = c.nextDate === today;
    return { ...c, overdue, dueToday };
  }).sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));

  const overdueCount = rows.filter(r => r.overdue).length;
  const dueTodayCount = rows.filter(r => r.dueToday).length;

  const add = () => {
    if (!lender.trim() || !action.trim()) { toast.error("Enter lender and next action"); return; }
    setContacts(prev => [...prev, { id: crypto.randomUUID(), lender: lender.trim(), contact: contact.trim(), lastContacted: today, nextAction: action.trim(), nextDate: nextDate || today }]);
    setLender(""); setContact(""); setAction(""); setNextDate("");
    toast.success("Relationship added");
  };

  const logTouch = (id: string) =>
    setContacts(prev => prev.map(x => x.id === id ? { ...x, lastContacted: today } : x));

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Phone size={14} className="text-[var(--color-primary)]" /> Lender-Relationship CRM</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Keep every lender relationship warm — who you spoke to, when, and the next action due. Follow-ups that have slipped past their date are flagged in red.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Relationships", value: contacts.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Due today", value: dueTodayCount.toString(), color: dueTodayCount > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Overdue follow-ups", value: overdueCount.toString(), color: overdueCount > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Lender", "Contact", "Last touched", "Next action", "Due", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">No relationships yet — add one below.</td></tr>
            )}
            {rows.map(c => (
              <tr key={c.id} className={`border-b border-[var(--color-border)] last:border-0 ${c.overdue ? "bg-red-950/10" : ""}`}>
                <td className="px-4 py-2.5 font-medium">{c.lender}</td>
                <td className="px-4 py-2.5 text-[var(--color-muted)]">{c.contact || "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{c.lastContacted ? format(new Date(c.lastContacted), "d MMM") : "—"}</td>
                <td className="px-4 py-2.5">{c.nextAction}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  <span className={c.overdue ? "text-red-400 font-semibold" : c.dueToday ? "text-yellow-400 font-semibold" : "text-[var(--color-muted)]"}>
                    {c.nextDate ? format(new Date(c.nextDate), "d MMM") : "—"}{c.overdue ? " · overdue" : c.dueToday ? " · today" : ""}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => logTouch(c.id)} className="text-[10px] text-[var(--color-primary)] hover:underline">Log touch</button>
                    <button onClick={() => setContacts(prev => prev.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add relationship</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={lender} onChange={e => setLender(e.target.value)} placeholder="Lender" className={inp} />
          <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact / RM" className={inp} />
          <input value={action} onChange={e => setAction(e.target.value)} placeholder="Next action" className={inp} />
          <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Add relationship</button>
      </div>
    </div>
  );
}

// ── #130 DRAWDOWN-VS-SANCTION UTILIZATION TREND ──────────────────────────────────
// A month-by-month record of how much of a sanctioned limit was drawn, plotted as a
// utilization-% trend so you can show a lender disciplined, headroom-aware drawing.
interface UtilPoint { id: string; month: string; sanctioned: number; drawn: number; }

function UtilizationTrend() {
  const [points, setPoints] = useFeatureState<UtilPoint[]>("lnd-utilization-trend", [
    { id: "u1", month: "2026-02", sanctioned: 5000000, drawn: 3200000 },
    { id: "u2", month: "2026-03", sanctioned: 5000000, drawn: 4100000 },
    { id: "u3", month: "2026-04", sanctioned: 5000000, drawn: 3600000 },
    { id: "u4", month: "2026-05", sanctioned: 5000000, drawn: 2900000 },
  ]);
  const [month, setMonth]           = useState("");
  const [sanctioned, setSanctioned] = useState("");
  const [drawn, setDrawn]           = useState("");

  const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
  const rows = sorted.map(p => ({ ...p, util: p.sanctioned > 0 ? p.drawn / p.sanctioned : 0 }));
  const avgUtil = rows.length ? rows.reduce((s, r) => s + r.util, 0) / rows.length : 0;
  const peakUtil = rows.reduce((m, r) => Math.max(m, r.util), 0);
  const latest = rows.length ? rows[rows.length - 1].util : 0;

  const add = () => {
    const s = parseFloat(sanctioned), d = parseFloat(drawn);
    if (!month || isNaN(s) || s <= 0 || isNaN(d)) { toast.error("Pick a month and enter sanctioned + drawn"); return; }
    setPoints(prev => [...prev.filter(p => p.month !== month), { id: crypto.randomUUID(), month, sanctioned: s, drawn: d }]);
    setMonth(""); setSanctioned(""); setDrawn("");
    toast.success("Data point saved");
  };

  const barColor = (u: number) => u > 0.9 ? "bg-red-400" : u > 0.75 ? "bg-yellow-400" : "bg-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Drawdown-vs-Sanction Utilization Trend</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Track how much of your sanctioned limit you actually draw each month. A steady mid-range utilization signals disciplined, headroom-aware borrowing to a lender.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Latest utilization", value: `${(latest * 100).toFixed(0)}%`, color: latest > 0.9 ? "text-red-400" : "text-[var(--color-primary)]" },
          { label: "Average", value: `${(avgUtil * 100).toFixed(0)}%`, color: "text-[var(--color-text)]" },
          { label: "Peak", value: `${(peakUtil * 100).toFixed(0)}%`, color: peakUtil > 0.9 ? "text-red-400" : "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className={`${card} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${card} p-4`}>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted)]">No data points yet — add one below.</p>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {rows.map(r => (
              <div key={r.id} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] tabular-nums text-[var(--color-muted)]">{(r.util * 100).toFixed(0)}%</span>
                <div className="w-full bg-[var(--color-border)] rounded-t flex items-end" style={{ height: "100%" }}>
                  <div className={`w-full rounded-t ${barColor(r.util)}`} style={{ height: `${Math.min(100, r.util * 100)}%` }} />
                </div>
                <span className="text-[9px] text-[var(--color-muted)]">{format(new Date(r.month + "-01"), "MMM")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Month", "Sanctioned", "Drawn", "Utilization", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 tabular-nums">{format(new Date(r.month + "-01"), "MMM yyyy")}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.sanctioned)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.drawn)}</td>
                <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.util > 0.9 ? "text-red-400" : r.util > 0.75 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{(r.util * 100).toFixed(0)}%</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => setPoints(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold">Add / update month</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inp} />
          <input type="number" value={sanctioned} onChange={e => setSanctioned(e.target.value)} placeholder="Sanctioned ₹" className={inp} />
          <input type="number" value={drawn} onChange={e => setDrawn(e.target.value)} placeholder="Drawn ₹" className={inp} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={12} /> Save month</button>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Adding a month already present overwrites it. Bars turn amber above 75% and red above 90% utilization — sustained high utilization can prompt a lender to review or reprice the limit.
      </div>
    </div>
  );
}

// ── LENDER CONCENTRATION RISK ────────────────────────────────────────────────────
// Group live active loans by lender and flag over-reliance on any single counterparty.
// HHI-style concentration plus a per-lender share table from store.activeLoans.
function ConcentrationRisk() {
  const { store } = useApp();
  const loans = store.activeLoans ?? [];

  const { rows, total, hhi, top } = useMemo(() => {
    const byLender = new Map<string, number>();
    loans.forEach(l => byLender.set(l.lender, (byLender.get(l.lender) ?? 0) + (l.outstanding || 0)));
    const total = [...byLender.values()].reduce((s, v) => s + v, 0);
    const rows = [...byLender.entries()]
      .map(([lender, outstanding]) => ({ lender, outstanding, share: total > 0 ? outstanding / total : 0 }))
      .sort((a, b) => b.outstanding - a.outstanding);
    const hhi = rows.reduce((s, r) => s + r.share * r.share, 0);   // 0..1, higher = concentrated
    const top = rows.length > 0 ? rows[0] : null;
    return { rows, total, hhi, top };
  }, [loans]);

  const concLevel = hhi >= 0.5 ? "high" : hhi >= 0.25 ? "moderate" : "low";
  const CONC = {
    high:     { color: "text-red-400",    text: "HIGH concentration" },
    moderate: { color: "text-yellow-400", text: "MODERATE concentration" },
    low:      { color: "text-green-400",  text: "WELL diversified" },
  } as const;

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Lender Concentration Risk</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Outstanding debt grouped by lender from your live loan book. Over-reliance on one counterparty is a refinancing and pricing risk — diversify before you need to.</p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <PieChart size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No active loans in your book yet. Concentration appears once loans are synced.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Lenders", value: rows.length.toString(), color: "text-[var(--color-text)]" },
              { label: "Largest share", value: top ? `${(top.share * 100).toFixed(0)}%` : "—", color: top && top.share >= 0.5 ? "text-red-400" : "text-[var(--color-text)]" },
              { label: "Concentration", value: CONC[concLevel].text, color: CONC[concLevel].color },
            ].map(c => (
              <div key={c.label} className={`${card} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Lender", "Outstanding", "Share", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.lender} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.outstanding)}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.share >= 0.5 ? "text-red-400" : r.share >= 0.33 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{(r.share * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5 w-1/3">
                      <div className="h-2 rounded-full bg-[var(--color-accent)] overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, r.share * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-accent)] font-bold">
                  <td className="px-4 py-2.5">Total outstanding</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(total)}</td>
                  <td className="px-4 py-2.5" colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>

          {concLevel === "high" && top && (
            <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-px" />
              <p className="text-xs text-red-300">{top.lender} holds {(top.share * 100).toFixed(0)}% of your outstanding debt. If they tighten terms or exit, you have limited fallback — line up a second lender before your next renewal.</p>
            </div>
          )}
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Concentration uses a Herfindahl-style index on outstanding balances: high above 0.50, moderate 0.25–0.50, diversified below. Loans without a distinct lender name are grouped together.
      </div>
    </div>
  );
}

// ── INTEREST-PAID SUMMARY ────────────────────────────────────────────────────────
// Estimate annual interest cost across the live loan book and per loan, with a
// blended cost of debt. Useful for the finance line and lender ROI conversations.
function InterestPaidSummary() {
  const { store } = useApp();
  const loans = store.activeLoans ?? [];

  const rows = useMemo(() => loans.map(l => {
    const annualInterest = (l.outstanding || 0) * (l.rate || 0) / 100;
    return { ...l, annualInterest, monthlyInterest: annualInterest / 12 };
  }).sort((a, b) => b.annualInterest - a.annualInterest), [loans]);

  const totalOutstanding = rows.reduce((s, r) => s + (r.outstanding || 0), 0);
  const totalAnnual      = rows.reduce((s, r) => s + r.annualInterest, 0);
  const blendedRate      = totalOutstanding > 0 ? totalAnnual / totalOutstanding * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Interest-Paid Summary</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Approximate annual interest cost across your live loan book, with a blended cost of debt. Shows which facilities are most expensive to carry.</p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Percent size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No active loans to summarise yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Annual interest", value: formatCurrency(Math.round(totalAnnual)), color: "text-[var(--color-primary)]" },
              { label: "Monthly interest", value: formatCurrency(Math.round(totalAnnual / 12)), color: "text-[var(--color-text)]" },
              { label: "Blended cost of debt", value: `${blendedRate.toFixed(2)}%`, color: blendedRate >= 16 ? "text-red-400" : "text-[var(--color-text)]" },
            ].map(c => (
              <div key={c.label} className={`${card} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Lender", "Outstanding", "Rate", "Monthly interest", "Annual interest"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.outstanding || 0)}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${(r.rate || 0) >= 16 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{(r.rate || 0).toFixed(2)}%</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.monthlyInterest))}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(r.annualInterest))}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-accent)] font-bold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(totalOutstanding)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{blendedRate.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(totalAnnual / 12))}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(totalAnnual))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Interest is approximated as outstanding × rate, so it understates cost slightly versus a full reducing-balance schedule paid on the original principal. Use for relative comparison and budgeting, not as a tax-deductible figure.
      </div>
    </div>
  );
}

// ── SANCTION vs DRAWN REPORT ─────────────────────────────────────────────────────
// Compare each loan's sanctioned principal against the amount still outstanding to
// show drawn/repaid progress across the live book from store.activeLoans.
function SanctionVsDrawn() {
  const { store } = useApp();
  const loans = store.activeLoans ?? [];

  const rows = useMemo(() => loans.map(l => {
    const principal = l.principal || 0;
    const outstanding = Math.min(l.outstanding || 0, principal || (l.outstanding || 0));
    const repaid = Math.max(0, principal - (l.outstanding || 0));
    const repaidPct = principal > 0 ? repaid / principal : 0;
    return { ...l, principal, outstanding, repaid, repaidPct };
  }).sort((a, b) => b.principal - a.principal), [loans]);

  const totalSanctioned = rows.reduce((s, r) => s + r.principal, 0);
  const totalOutstanding = rows.reduce((s, r) => s + (r.outstanding || 0), 0);
  const totalRepaid = Math.max(0, totalSanctioned - totalOutstanding);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /> Sanction vs Drawn / Repaid</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Each facility's sanctioned principal against the balance still outstanding, with repayment progress — a clean snapshot for any lender review.</p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <ArrowLeftRight size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No active loans to report on yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total sanctioned", value: formatCurrency(totalSanctioned), color: "text-[var(--color-text)]" },
              { label: "Still outstanding", value: formatCurrency(totalOutstanding), color: "text-[var(--color-primary)]" },
              { label: "Repaid to date", value: formatCurrency(totalRepaid), color: "text-green-400" },
            ].map(c => (
              <div key={c.label} className={`${card} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Lender", "Sanctioned", "Outstanding", "Repaid", "Progress"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.lender}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.principal)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.outstanding || 0)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(r.repaid)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-[var(--color-accent)] overflow-hidden min-w-[60px]">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, r.repaidPct * 100)}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-[var(--color-muted)] w-9 text-right">{(r.repaidPct * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-accent)] font-bold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(totalSanctioned)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(totalOutstanding)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(totalRepaid)}</td>
                  <td className="px-4 py-2.5" />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Repaid is computed as sanctioned principal minus current outstanding, so it reflects principal reduction only — not interest paid. Drawn-down term loans show the full sanction as drawn; revolving lines may differ.
      </div>
    </div>
  );
}
