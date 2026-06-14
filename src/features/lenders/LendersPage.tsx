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

type LenderTab = "marketplace" | "covenants" | "borrowing-base" | "mis-pack";

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
          {([["marketplace", "Marketplace", Landmark], ["covenants", "Covenant Dashboard", Gauge], ["borrowing-base", "Borrowing Base", FileSpreadsheet], ["mis-pack", "MIS Pack", ClipboardList]] as const).map(([id, label, Icon]) => (
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
