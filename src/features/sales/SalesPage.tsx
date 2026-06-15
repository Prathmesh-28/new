import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import EmptyState from "@/components/EmptyState";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Briefcase, KanbanSquare, FileText, ShoppingCart, Coins, UserCircle2,
  TrendingUp, BellRing, Trophy, Target, ClipboardList, Plus, Trash2,
  ArrowRight, CheckCircle2, XCircle, Phone, MessageCircle, Award,
  Percent, MapPin, PhoneCall, Clock, Layers, UserMinus, Smile, ListChecks,
  Repeat, Gift,
  PieChart, Gauge, Users, Calculator, FolderKanban, Tag, Timer,
  Filter, Wallet, FileCheck2, CalendarRange,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

// ── shared style tokens (matched to TaxPage / DebtPage tools) ───────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "pipeline" | "deals" | "quote" | "commission" | "customer360"
  | "forecast" | "leads" | "winloss" | "target" | "leaderboard"
  | "discount-approval" | "territory" | "activity-log" | "quote-expiry"
  | "cross-sell" | "churn-risk" | "nps" | "playbook" | "renewals" | "referrals"
  | "source-roi" | "rep-scorecard" | "rfm" | "incentive-sim" | "account-plan"
  | "rate-card" | "velocity"
  | "conversion-funnel" | "revenue-per-customer" | "quote-acceptance" | "seasonality";

export default function SalesPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Briefcase size={18} className="text-[var(--color-primary)]" /> Sales &amp; CRM
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Capture leads, run a pipeline, quote with GST, track commissions and targets — built for India's SMB sales teams.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", Briefcase],
            ["pipeline", "Pipeline", KanbanSquare],
            ["deals", "Deal Tracker", ClipboardList],
            ["quote", "Quote → Order", FileText],
            ["commission", "Commissions", Coins],
            ["customer360", "Customer 360", UserCircle2],
            ["forecast", "Sales Forecast", TrendingUp],
            ["leads", "Leads & Follow-ups", BellRing],
            ["winloss", "Win / Loss", Trophy],
            ["target", "Target vs Actual", Target],
            ["leaderboard", "Rep Leaderboard", Award],
            ["discount-approval", "Discount Approval", Percent],
            ["territory", "Territory Planner", MapPin],
            ["activity-log", "Activity Log", PhoneCall],
            ["quote-expiry", "Quote Expiry", Clock],
            ["cross-sell", "Cross-Sell", Layers],
            ["churn-risk", "Churn Risk", UserMinus],
            ["nps", "NPS & Feedback", Smile],
            ["playbook", "Sales Playbook", ListChecks],
            ["renewals", "Renewals", Repeat],
            ["referrals", "Referrals", Gift],
            ["source-roi", "Source ROI", PieChart],
            ["rep-scorecard", "Rep Scorecard", Gauge],
            ["rfm", "RFM Segments", Users],
            ["incentive-sim", "Incentive Sim", Calculator],
            ["account-plan", "Account Plan", FolderKanban],
            ["rate-card", "Rate Card", Tag],
            ["velocity", "Pipeline Velocity", Timer],
            ["conversion-funnel", "Conversion Funnel", Filter],
            ["revenue-per-customer", "Revenue / Customer", Wallet],
            ["quote-acceptance", "Quote Acceptance", FileCheck2],
            ["seasonality", "Seasonal Pattern", CalendarRange],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <SalesOverview onJump={setTab} />}
      {tab === "pipeline" && <PipelineBoard />}
      {tab === "deals" && <DealTracker />}
      {tab === "quote" && <QuoteToOrder />}
      {tab === "commission" && <CommissionCalculator />}
      {tab === "customer360" && <Customer360 />}
      {tab === "forecast" && <SalesForecast />}
      {tab === "leads" && <LeadFollowUps />}
      {tab === "winloss" && <WinLossTracker />}
      {tab === "target" && <TargetVsActual />}
      {tab === "leaderboard" && <RepLeaderboard />}
      {tab === "discount-approval" && <DiscountApproval />}
      {tab === "territory" && <TerritoryPlanner />}
      {tab === "activity-log" && <ActivityLog />}
      {tab === "quote-expiry" && <QuoteExpiryTracker />}
      {tab === "cross-sell" && <CrossSellSuggester />}
      {tab === "churn-risk" && <ChurnRiskList />}
      {tab === "nps" && <NpsTracker />}
      {tab === "playbook" && <SalesPlaybook />}
      {tab === "renewals" && <RenewalTracker />}
      {tab === "referrals" && <ReferralTracker />}
      {tab === "source-roi" && <LeadSourceROI />}
      {tab === "rep-scorecard" && <RepScorecard />}
      {tab === "rfm" && <RfmSegments />}
      {tab === "incentive-sim" && <IncentiveSimulator />}
      {tab === "account-plan" && <AccountPlanBuilder />}
      {tab === "rate-card" && <RateCardManager />}
      {tab === "velocity" && <PipelineVelocity />}
      {tab === "conversion-funnel" && <ConversionFunnel />}
      {tab === "revenue-per-customer" && <RevenuePerCustomer />}
      {tab === "quote-acceptance" && <QuoteAcceptanceRate />}
      {tab === "seasonality" && <SeasonalPattern />}
    </div>
  );
}

// ── shared deal model (pipeline + forecast + leaderboard read from it) ───────────
const STAGES = ["enquiry", "quoted", "negotiation", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, string> = {
  enquiry: "Enquiry", quoted: "Quoted", negotiation: "Negotiation", won: "Won", lost: "Lost",
};
// Default close-probability weighting per stage (used by the pipeline forecast).
const STAGE_PROB: Record<Stage, number> = {
  enquiry: 0.1, quoted: 0.35, negotiation: 0.6, won: 1, lost: 0,
};
type Deal = {
  id: string; title: string; customer: string; rep: string;
  value: number; stage: Stage; source: string; expectedClose: string;
};

function useDeals() {
  return useFeatureState<Deal[]>("sales-deals", []);
}

// ── #3 Pipeline Board (Kanban) ───────────────────────────────────────────────────
function PipelineBoard() {
  const [deals, setDeals] = useDeals();
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [rep, setRep] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("WhatsApp");
  const [expectedClose, setExpectedClose] = useState(() => new Date().toISOString().split("T")[0]);

  const addDeal = () => {
    const v = parseFloat(value);
    if (!title.trim() || !customer.trim() || isNaN(v) || v <= 0) {
      toast.error("Enter a deal title, customer and a positive value");
      return;
    }
    setDeals([...deals, {
      id: crypto.randomUUID(), title: title.trim(), customer: customer.trim(),
      rep: rep.trim() || "Unassigned", value: v, stage: "enquiry", source, expectedClose,
    }]);
    setTitle(""); setCustomer(""); setValue("");
    toast.success("Deal added to the pipeline");
  };

  const move = (id: string, dir: 1 | -1) => {
    setDeals(deals.map(d => {
      if (d.id !== id) return d;
      const i = STAGES.indexOf(d.stage);
      const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, i + dir))];
      return { ...d, stage: next };
    }));
  };

  const columnTotal = (s: Stage) => deals.filter(d => d.stage === s).reduce((sum, d) => sum + d.value, 0);
  const openValue = deals.filter(d => d.stage !== "won" && d.stage !== "lost").reduce((s, d) => s + d.value, 0);
  const weighted = deals.filter(d => d.stage !== "lost").reduce((s, d) => s + d.value * STAGE_PROB[d.stage], 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><KanbanSquare size={14} className="text-[var(--color-primary)]" /> Add a deal</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deal title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="50 cartons order" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rep</label>
            <input value={rep} onChange={e => setRep(e.target.value)} placeholder="Rahul" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value (₹)</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="120000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Source</label>
            <select value={source} onChange={e => setSource(e.target.value)} className={INP}>
              {["WhatsApp", "IndiaMART", "JustDial", "Referral", "Walk-in", "Website"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={addDeal} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Open pipeline", value: formatCurrency(openValue), color: "text-[var(--color-text)]" },
            { label: "Weighted forecast", value: formatCurrency(Math.round(weighted)), color: "text-[var(--color-primary)]" },
            { label: "Total deals", value: `${deals.length}`, color: "text-[var(--color-text)]" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {deals.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No deals yet. Add your first enquiry above to start the board.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STAGES.map(s => (
            <div key={s} className={`${CARD} p-3 space-y-2`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{STAGE_LABEL[s]}</p>
                <span className="text-[10px] text-[var(--color-muted)] tabular-nums">{formatCurrency(columnTotal(s))}</span>
              </div>
              {deals.filter(d => d.stage === s).map(d => (
                <div key={d.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">
                  <p className="text-xs font-medium truncate">{d.title}</p>
                  <p className="text-[10px] text-[var(--color-muted)] truncate">{d.customer} · {d.rep}</p>
                  <p className="text-xs font-bold tabular-nums mt-1">{formatCurrency(d.value)}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] text-[var(--color-muted)]">{d.source}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => move(d.id, -1)} disabled={STAGES.indexOf(d.stage) === 0}
                        className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30">‹</button>
                      <button onClick={() => move(d.id, 1)} disabled={STAGES.indexOf(d.stage) === STAGES.length - 1}
                        className="text-[10px] text-[var(--color-primary)] hover:underline disabled:opacity-30">›</button>
                      <button onClick={() => setDeals(deals.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={11} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Use ‹ › to move a deal between stages. Weighted forecast applies a close probability per stage (enquiry 10% → negotiation 60% → won 100%).</p>
    </div>
  );
}

// ── #10 Deal Tracker (flat list with inline stage + close-date aging) ─────────────
function DealTracker() {
  const [deals, setDeals] = useDeals();
  const today = new Date();

  if (deals.length === 0) {
    return <p className="text-xs text-[var(--color-muted)] px-1">No deals yet. Add deals in the Pipeline tab — they appear here as a sortable list with aging.</p>;
  }

  const sorted = [...deals].sort((a, b) => b.value - a.value);

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} className="text-[var(--color-primary)]" /> All Deals — {deals.length}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-[var(--color-border)]">
            <tr>{["Deal", "Customer", "Rep", "Value", "Stage", "Expected Close", ""].map(h =>
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {sorted.map(d => {
              const days = differenceInCalendarDays(parseISO(d.expectedClose), today);
              const overdue = days < 0 && d.stage !== "won" && d.stage !== "lost";
              return (
                <tr key={d.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{d.title}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{d.customer}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{d.rep}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(d.value)}</td>
                  <td className="px-4 py-2.5">
                    <select value={d.stage} onChange={e => setDeals(deals.map(x => x.id === d.id ? { ...x, stage: e.target.value as Stage } : x))} className={`${INP} py-1 max-w-[140px]`}>
                      {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className={`px-4 py-2.5 tabular-nums ${overdue ? "text-red-400" : "text-[var(--color-muted)]"}`}>
                    {format(parseISO(d.expectedClose), "d MMM yyyy")}{overdue ? ` · ${Math.abs(days)}d overdue` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setDeals(deals.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── #4 / #5 Quote Builder → Sales Order (GST-correct, UPI-ready) ─────────────────
type LineItem = { id: string; name: string; qty: number; rate: number; gstPct: number };
function QuoteToOrder() {
  const { store } = useApp();
  const [buyer, setBuyer] = useState("");
  const [gstin, setGstin] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [lines, setLines] = useState<LineItem[]>([{ id: crypto.randomUUID(), name: "", qty: 1, rate: 0, gstPct: 18 }]);
  const [converted, setConverted] = useState(false);

  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setLines(lines.map(l => l.id === id ? { ...l, ...patch } : l));
  const addLine = () => setLines([...lines, { id: crypto.randomUUID(), name: "", qty: 1, rate: 0, gstPct: 18 }]);
  const removeLine = (id: string) => setLines(lines.length > 1 ? lines.filter(l => l.id !== id) : lines);

  const disc = Math.min(100, Math.max(0, parseFloat(discountPct) || 0));
  const calc = useMemo(() => {
    const rows = lines.map(l => {
      const gross = l.qty * l.rate;
      const afterDisc = gross * (1 - disc / 100);
      const gst = afterDisc * (l.gstPct / 100);
      return { ...l, gross, afterDisc, gst, total: afterDisc + gst };
    });
    const subtotal = rows.reduce((s, r) => s + r.gross, 0);
    const taxable = rows.reduce((s, r) => s + r.afterDisc, 0);
    const totalGst = rows.reduce((s, r) => s + r.gst, 0);
    const grand = taxable + totalGst;
    return { rows, subtotal, taxable, totalGst, grand };
  }, [lines, disc]);

  const upiLink = `upi://pay?pa=merchant@upi&pn=${encodeURIComponent(store.firm?.name ?? "Merchant")}&am=${calc.grand.toFixed(2)}&cu=INR`;
  const gstinValid = gstin === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}$/.test(gstin.toUpperCase());

  const convert = () => {
    if (!buyer.trim() || calc.grand <= 0) { toast.error("Add a buyer and at least one priced line"); return; }
    if (!gstinValid) { toast.error("GSTIN format looks invalid (15 chars)"); return; }
    setConverted(true);
    toast.success(`Sales order created for ${buyer.trim()} — ${formatCurrency(Math.round(calc.grand))}`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Quotation Builder</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Buyer / customer</label>
            <input value={buyer} onChange={e => { setBuyer(e.target.value); setConverted(false); }} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Buyer GSTIN (optional)</label>
            <input value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} placeholder="27AAAAA0000A1Z5" className={`${INP} ${!gstinValid ? "border-red-700/50" : ""}`} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Order discount %</label>
            <input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Item", "Qty", "Rate ₹", "GST %", "Taxable", "GST", "Total", ""].map(h =>
                <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {calc.rows.map(r => (
                <tr key={r.id}>
                  <td className="px-2 py-2"><input value={r.name} onChange={e => updateLine(r.id, { name: e.target.value })} placeholder="Product / SKU" className={`${INP} py-1`} /></td>
                  <td className="px-2 py-2 w-20"><input type="number" value={r.qty} onChange={e => updateLine(r.id, { qty: parseFloat(e.target.value) || 0 })} className={`${INP} py-1`} /></td>
                  <td className="px-2 py-2 w-28"><input type="number" value={r.rate} onChange={e => updateLine(r.id, { rate: parseFloat(e.target.value) || 0 })} className={`${INP} py-1`} /></td>
                  <td className="px-2 py-2 w-24">
                    <select value={r.gstPct} onChange={e => updateLine(r.id, { gstPct: parseFloat(e.target.value) })} className={`${INP} py-1`}>
                      {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.afterDisc))}</td>
                  <td className="px-2 py-2 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.gst))}</td>
                  <td className="px-2 py-2 tabular-nums font-semibold">{formatCurrency(Math.round(r.total))}</td>
                  <td className="px-2 py-2 text-right"><button onClick={() => removeLine(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addLine} className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"><Plus size={11} /> Add line item</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-4 space-y-2 text-sm`}>
          <p className="text-sm font-semibold mb-1">Quote Summary</p>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Subtotal (gross)</span><span className="tabular-nums">{formatCurrency(Math.round(calc.subtotal))}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Less discount ({disc}%)</span><span className="tabular-nums text-green-400">({formatCurrency(Math.round(calc.subtotal - calc.taxable))})</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Taxable value</span><span className="tabular-nums">{formatCurrency(Math.round(calc.taxable))}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Total GST</span><span className="tabular-nums text-orange-400">{formatCurrency(Math.round(calc.totalGst))}</span></div>
          <div className="flex justify-between pt-2 border-t border-[var(--color-border)]"><span className="font-semibold">Grand total</span><span className="tabular-nums font-bold">{formatCurrency(Math.round(calc.grand))}</span></div>
        </div>

        <div className={`${CARD} p-4 space-y-3`}>
          <p className="text-sm font-semibold flex items-center gap-2"><ShoppingCart size={14} className="text-[var(--color-primary)]" /> Convert to Sales Order</p>
          <p className="text-xs text-[var(--color-muted)]">Accept the quote to lock it as an order. A UPI collect link is generated so the buyer can pay on acceptance.</p>
          <button onClick={convert} disabled={converted}
            className="w-full text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
            {converted ? <><CheckCircle2 size={13} /> Order created</> : <>Accept &amp; create order <ArrowRight size={13} /></>}
          </button>
          {converted && (
            <div className="bg-green-950/20 border border-green-800/40 rounded-lg p-3 text-xs space-y-1.5">
              <p className="text-green-400 font-semibold">Sales order for {buyer} — {formatCurrency(Math.round(calc.grand))}</p>
              <p className="text-[var(--color-muted)] break-all">UPI link: {upiLink}</p>
              <p className="text-[10px] text-[var(--color-muted)]">Share this payment link over WhatsApp; the buyer pays on any UPI app.</p>
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">GST is applied to each line at its slab after order-level discount. Validate the buyer GSTIN before invoicing — wrong place-of-supply/HSN triggers notices.</p>
    </div>
  );
}

// ── #11 Sales Commission Calculator ──────────────────────────────────────────────
type CommissionRow = { id: string; rep: string; dealValue: number; margin: number; tier: "flat" | "tiered" };
function CommissionCalculator() {
  const [flatPct, setFlatPct] = useState("5");
  const [rows, setRows] = useFeatureState<CommissionRow[]>("sales-commissions", []);
  const [rep, setRep] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [margin, setMargin] = useState("");
  const [tier, setTier] = useState<CommissionRow["tier"]>("flat");

  // Tiered scheme: bigger deals earn a higher rate.
  const tieredRate = (v: number) => v >= 1000000 ? 0.08 : v >= 250000 ? 0.06 : 0.04;
  const flat = Math.max(0, parseFloat(flatPct) || 0) / 100;

  const commissionFor = (r: CommissionRow) =>
    r.tier === "flat" ? r.dealValue * flat : r.dealValue * tieredRate(r.dealValue);

  const add = () => {
    const v = parseFloat(dealValue), m = parseFloat(margin);
    if (!rep.trim() || isNaN(v) || v <= 0) { toast.error("Enter a rep name and deal value"); return; }
    setRows([...rows, { id: crypto.randomUUID(), rep: rep.trim(), dealValue: v, margin: isNaN(m) ? 0 : m, tier }]);
    setRep(""); setDealValue(""); setMargin("");
    toast.success("Closed-won deal added");
  };

  const totalCommission = rows.reduce((s, r) => s + commissionFor(r), 0);
  const totalRevenue = rows.reduce((s, r) => s + r.dealValue, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Commission Calculator</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Flat rate %</label>
            <input type="number" value={flatPct} onChange={e => setFlatPct(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rep</label>
            <input value={rep} onChange={e => setRep(e.target.value)} placeholder="Rahul" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deal value (₹)</label>
            <input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Margin % (opt.)</label>
            <input type="number" value={margin} onChange={e => setMargin(e.target.value)} placeholder="20" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Scheme</label>
            <select value={tier} onChange={e => setTier(e.target.value as CommissionRow["tier"])} className={INP}>
              <option value="flat">Flat %</option>
              <option value="tiered">Tiered by size</option>
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Tiered scheme: 4% under ₹2.5L · 6% ₹2.5L–₹10L · 8% above ₹10L.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add closed-won deals to compute payouts.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Revenue closed", value: formatCurrency(totalRevenue), color: "text-[var(--color-text)]" },
              { label: "Total commission", value: formatCurrency(Math.round(totalCommission)), color: "text-[var(--color-primary)]" },
              { label: "Effective payout", value: totalRevenue > 0 ? `${(totalCommission / totalRevenue * 100).toFixed(1)}%` : "—", color: "text-[var(--color-muted)]" },
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
                  <tr>{["Rep", "Deal value", "Margin", "Scheme", "Commission", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.rep}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.dealValue)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.margin ? `${r.margin}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.tier === "flat" ? `Flat ${flatPct}%` : "Tiered"}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(Math.round(commissionFor(r)))}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
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

// ── #8 Customer 360 (live: invoices + transactions per customer) ──────────────────
function Customer360() {
  const { store } = useApp();
  const [selected, setSelected] = useState<string>("");

  const customers = useMemo(() => {
    const set = new Set<string>();
    store.invoices.forEach(i => i.customer && set.add(i.customer));
    store.transactions.forEach(t => t.amount > 0 && t.counterparty && set.add(t.counterparty));
    return [...set].sort();
  }, [store.invoices, store.transactions]);

  const active = selected || customers[0] || "";

  const profile = useMemo(() => {
    const invoices = store.invoices.filter(i => i.customer === active);
    const txns = store.transactions.filter(t => t.counterparty === active && t.amount > 0);
    const billed = invoices.reduce((s, i) => s + i.amount, 0);
    const collected = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    const outstanding = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
    const lifetime = collected + txns.reduce((s, t) => s + t.amount, 0);
    return { invoices, txns, billed, collected, outstanding, overdue, lifetime };
  }, [store.invoices, store.transactions, active]);

  if (customers.length === 0) {
    return <p className="text-xs text-[var(--color-muted)] px-1">No customers found yet. Customers appear here once you have invoices or incoming transactions.</p>;
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <label className="text-xs text-[var(--color-muted)] block mb-1 flex items-center gap-2"><UserCircle2 size={13} className="text-[var(--color-primary)]" /> Select customer</label>
        <select value={active} onChange={e => setSelected(e.target.value)} className={`${INP} max-w-sm`}>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Lifetime value", value: formatCurrency(profile.lifetime), color: "text-[var(--color-primary)]" },
          { label: "Total billed", value: formatCurrency(profile.billed), color: "text-[var(--color-text)]" },
          { label: "Outstanding", value: formatCurrency(profile.outstanding), color: profile.outstanding > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Overdue", value: formatCurrency(profile.overdue), color: profile.overdue > 0 ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <p className="text-sm font-semibold">Invoices — {active}</p>
          <span className="text-[10px] text-[var(--color-muted)]">{profile.invoices.length} invoice(s)</span>
        </div>
        {profile.invoices.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] px-5 py-4">No invoices for this customer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Invoice", "Amount", "Due", "Status"].map(h =>
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {profile.invoices.map(i => (
                  <tr key={i.id} className="hover:bg-white/2">
                    <td className="px-5 py-2.5 font-medium">{i.invoiceNumber ?? i.description}</td>
                    <td className="px-5 py-2.5 tabular-nums">{formatCurrency(i.amount)}</td>
                    <td className="px-5 py-2.5 text-[var(--color-muted)]">{i.dueDate}</td>
                    <td className="px-5 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                        i.status === "paid" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                        i.status === "overdue" ? "bg-red-900/30 text-red-400 border-red-800/40" :
                        "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{i.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Customer 360 is derived live from your invoices and incoming transactions — no manual entry needed.</p>
    </div>
  );
}

// ── #34 Sales Forecast (weighted pipeline projection) ─────────────────────────────
function SalesForecast() {
  const [deals] = useDeals();
  const [overrides, setOverrides] = useState<Record<Stage, string>>({
    enquiry: "10", quoted: "35", negotiation: "60", won: "100", lost: "0",
  });

  const prob = (s: Stage) => Math.min(100, Math.max(0, parseFloat(overrides[s]) || 0)) / 100;

  const byStage = useMemo(() => STAGES.map(s => {
    const stageDeals = deals.filter(d => d.stage === s);
    const value = stageDeals.reduce((sum, d) => sum + d.value, 0);
    return { stage: s, count: stageDeals.length, value, weighted: value * prob(s) };
  }), [deals, overrides]);

  const totalWeighted = byStage.reduce((s, r) => s + r.weighted, 0);
  const totalOpen = byStage.filter(r => r.stage !== "won" && r.stage !== "lost").reduce((s, r) => s + r.value, 0);
  const won = byStage.find(r => r.stage === "won")?.value ?? 0;
  const maxValue = Math.max(1, ...byStage.map(r => r.value));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Closed-won", value: formatCurrency(won), color: "text-green-400" },
          { label: "Open pipeline", value: formatCurrency(totalOpen), color: "text-[var(--color-text)]" },
          { label: "Weighted forecast", value: formatCurrency(Math.round(totalWeighted)), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Weighted Pipeline by Stage</h3>
        {deals.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Add deals in the Pipeline tab to generate a forecast.</p>
        ) : byStage.map(r => (
          <div key={r.stage}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium flex items-center gap-2">
                {STAGE_LABEL[r.stage]} <span className="text-[10px] text-[var(--color-muted)]">{r.count} deal(s)</span>
              </span>
              <span className="flex items-center gap-2">
                <input type="number" value={overrides[r.stage]} onChange={e => setOverrides({ ...overrides, [r.stage]: e.target.value })}
                  className="w-14 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[10px] text-right outline-none focus:border-[var(--color-primary)]" />
                <span className="text-[10px] text-[var(--color-muted)]">% prob</span>
                <span className="tabular-nums font-semibold w-24 text-right">{formatCurrency(Math.round(r.weighted))}</span>
              </span>
            </div>
            <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${(r.value / maxValue) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Forecast = Σ (deal value × stage probability). Tune the probability per stage to match your historical win rates.</p>
    </div>
  );
}

// ── #7 / #38 Lead Capture & Follow-up Reminders ──────────────────────────────────
type Lead = { id: string; name: string; phone: string; source: string; status: "new" | "contacted" | "qualified" | "dropped"; nextFollowUp: string; note: string };
function LeadFollowUps() {
  const [leads, setLeads] = useFeatureState<Lead[]>("sales-leads", []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("WhatsApp");
  const [nextFollowUp, setNextFollowUp] = useState(() => new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const today = new Date();

  const add = () => {
    if (!name.trim()) { toast.error("Enter a lead name"); return; }
    setLeads([...leads, { id: crypto.randomUUID(), name: name.trim(), phone: phone.trim(), source, status: "new", nextFollowUp, note: note.trim() }]);
    setName(""); setPhone(""); setNote("");
    toast.success("Lead captured");
  };

  const setStatus = (id: string, status: Lead["status"]) => setLeads(leads.map(l => l.id === id ? { ...l, status } : l));
  const overdueCount = leads.filter(l => l.status !== "dropped" && l.status !== "qualified" && differenceInCalendarDays(parseISO(l.nextFollowUp), today) < 0).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BellRing size={14} className="text-[var(--color-primary)]" /> Capture a lead</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Anita" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="98xxxxxxxx" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Source</label>
            <select value={source} onChange={e => setSource(e.target.value)} className={INP}>
              {["WhatsApp", "IndiaMART", "JustDial", "Referral", "Walk-in", "Website"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Next follow-up</label>
            <input type="date" value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Wants bulk pricing" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        {overdueCount > 0 && (
          <p className="text-xs text-red-400 flex items-center gap-1.5"><BellRing size={12} /> {overdueCount} follow-up(s) overdue — 80% of SMB deals die from no follow-up.</p>
        )}
      </div>

      {leads.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No leads captured yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Lead", "Source", "Next follow-up", "Note", "Status", "Action", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {leads.map(l => {
                  const days = differenceInCalendarDays(parseISO(l.nextFollowUp), today);
                  const due = l.status !== "dropped" && l.status !== "qualified" && days < 0;
                  return (
                    <tr key={l.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5"><p className="font-medium">{l.name}</p><p className="text-[10px] text-[var(--color-muted)]">{l.phone}</p></td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{l.source}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${due ? "text-red-400 font-semibold" : "text-[var(--color-muted)]"}`}>{format(parseISO(l.nextFollowUp), "d MMM")}{due ? ` · ${Math.abs(days)}d late` : ""}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[160px] truncate">{l.note || "—"}</td>
                      <td className="px-4 py-2.5">
                        <select value={l.status} onChange={e => setStatus(l.id, e.target.value as Lead["status"])} className={`${INP} py-1 max-w-[130px]`}>
                          {(["new", "contacted", "qualified", "dropped"] as const).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {l.phone && <a href={`tel:${l.phone}`} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Call"><Phone size={13} /></a>}
                          {l.phone && <a href={`https://wa.me/91${l.phone.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer" className="text-[var(--color-muted)] hover:text-green-400" title="WhatsApp"><MessageCircle size={13} /></a>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setLeads(leads.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── #10 Win / Loss Tracker ────────────────────────────────────────────────────────
type WinLoss = { id: string; deal: string; value: number; outcome: "won" | "lost"; reason: string };
const LOSS_REASONS = ["Price too high", "Lost to competitor", "No budget", "Timing", "No follow-up", "Other"];
const WIN_REASONS = ["Best price", "Relationship", "Product fit", "Fast response", "Referral", "Other"];
function WinLossTracker() {
  const [rows, setRows] = useFeatureState<WinLoss[]>("sales-winloss", []);
  const [deal, setDeal] = useState("");
  const [value, setValue] = useState("");
  const [outcome, setOutcome] = useState<WinLoss["outcome"]>("won");
  const [reason, setReason] = useState(WIN_REASONS[0]);

  const add = () => {
    const v = parseFloat(value);
    if (!deal.trim() || isNaN(v)) { toast.error("Enter a deal name and value"); return; }
    setRows([...rows, { id: crypto.randomUUID(), deal: deal.trim(), value: v, outcome, reason }]);
    setDeal(""); setValue("");
    toast.success("Outcome logged");
  };

  const won = rows.filter(r => r.outcome === "won");
  const lost = rows.filter(r => r.outcome === "lost");
  const winRate = rows.length > 0 ? (won.length / rows.length) * 100 : 0;
  const lossReasonTally = useMemo(() => {
    const m = new Map<string, number>();
    lost.forEach(r => m.set(r.reason, (m.get(r.reason) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [lost]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Trophy size={14} className="text-[var(--color-primary)]" /> Log a win or loss</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deal</label>
            <input value={deal} onChange={e => setDeal(e.target.value)} placeholder="Sharma Traders order" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value (₹)</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Outcome</label>
            <select value={outcome} onChange={e => { const o = e.target.value as WinLoss["outcome"]; setOutcome(o); setReason((o === "won" ? WIN_REASONS : LOSS_REASONS)[0]); }} className={INP}>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className={INP}>
              {(outcome === "won" ? WIN_REASONS : LOSS_REASONS).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Log
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Win rate", value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? "text-green-400" : "text-yellow-400" },
          { label: "Won deals", value: `${won.length}`, color: "text-green-400" },
          { label: "Lost deals", value: `${lost.length}`, color: "text-red-400" },
          { label: "Value won", value: formatCurrency(won.reduce((s, r) => s + r.value, 0)), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {lossReasonTally.length > 0 && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm font-semibold mb-3">Top loss reasons</p>
          <div className="space-y-2">
            {lossReasonTally.map(([r, n]) => (
              <div key={r} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-muted)] flex items-center gap-1.5"><XCircle size={12} className="text-red-400" /> {r}</span>
                <span className="tabular-nums font-semibold">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Deal", "Value", "Outcome", "Reason", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.deal}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.value)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${r.outcome === "won" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"}`}>{r.outcome}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.reason}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── #19 Target vs Achievement ─────────────────────────────────────────────────────
type TargetRow = { id: string; rep: string; target: number; achieved: number };
function TargetVsActual() {
  const [rows, setRows] = useFeatureState<TargetRow[]>("sales-targets", []);
  const [rep, setRep] = useState("");
  const [target, setTarget] = useState("");
  const [achieved, setAchieved] = useState("");

  const add = () => {
    const t = parseFloat(target), a = parseFloat(achieved);
    if (!rep.trim() || isNaN(t) || t <= 0) { toast.error("Enter a rep and a positive target"); return; }
    setRows([...rows, { id: crypto.randomUUID(), rep: rep.trim(), target: t, achieved: isNaN(a) ? 0 : a }]);
    setRep(""); setTarget(""); setAchieved("");
    toast.success("Target added");
  };

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalAchieved = rows.reduce((s, r) => s + r.achieved, 0);
  const teamPct = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Set rep targets</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rep</label>
            <input value={rep} onChange={e => setRep(e.target.value)} placeholder="Rahul" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly target (₹)</label>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Achieved (₹)</label>
            <input type="number" value={achieved} onChange={e => setAchieved(e.target.value)} placeholder="650000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Team target", value: formatCurrency(totalTarget), color: "text-[var(--color-text)]" },
          { label: "Team achieved", value: formatCurrency(totalAchieved), color: "text-[var(--color-primary)]" },
          { label: "Attainment", value: `${teamPct.toFixed(0)}%`, color: teamPct >= 100 ? "text-green-400" : teamPct >= 70 ? "text-yellow-400" : "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add rep targets to track attainment.</p>
      ) : (
        <div className={`${CARD} p-4 space-y-4`}>
          {rows.map(r => {
            const pct = r.target > 0 ? (r.achieved / r.target) * 100 : 0;
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{r.rep}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-[var(--color-muted)]">{formatCurrency(r.achieved)} / {formatCurrency(r.target)}</span>
                    <span className={`tabular-nums font-semibold ${pct >= 100 ? "text-green-400" : pct >= 70 ? "text-yellow-400" : "text-red-400"}`}>{pct.toFixed(0)}%</span>
                    <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={11} /></button>
                  </span>
                </div>
                <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? "#22c55e" : pct >= 70 ? "#eab308" : "#ef4444" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── #28 Rep Leaderboard (derived from deals + win/loss) ───────────────────────────
function RepLeaderboard() {
  const [deals] = useDeals();

  const board = useMemo(() => {
    const m = new Map<string, { rep: string; wonValue: number; wonCount: number; openValue: number; openCount: number }>();
    deals.forEach(d => {
      const e = m.get(d.rep) ?? { rep: d.rep, wonValue: 0, wonCount: 0, openValue: 0, openCount: 0 };
      if (d.stage === "won") { e.wonValue += d.value; e.wonCount += 1; }
      else if (d.stage !== "lost") { e.openValue += d.value; e.openCount += 1; }
      m.set(d.rep, e);
    });
    return [...m.values()].sort((a, b) => b.wonValue - a.wonValue);
  }, [deals]);

  if (board.length === 0) {
    return <p className="text-xs text-[var(--color-muted)] px-1">No deals assigned to reps yet. Add deals with a rep in the Pipeline tab to populate the leaderboard.</p>;
  }

  const MEDAL = ["text-yellow-400", "text-gray-300", "text-orange-400"];

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-semibold flex items-center gap-2"><Award size={14} className="text-[var(--color-primary)]" /> Rep Leaderboard</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)]">
            <tr>{["#", "Rep", "Won value", "Won deals", "Open pipeline", "Open deals"].map(h =>
              <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {board.map((r, i) => (
              <tr key={r.rep} className="hover:bg-white/2">
                <td className={`px-5 py-3 font-bold tabular-nums ${i < 3 ? MEDAL[i] : "text-[var(--color-muted)]"}`}>{i + 1}</td>
                <td className="px-5 py-3 font-medium">{r.rep}</td>
                <td className="px-5 py-3 tabular-nums font-semibold text-green-400">{formatCurrency(r.wonValue)}</td>
                <td className="px-5 py-3 tabular-nums">{r.wonCount}</td>
                <td className="px-5 py-3 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.openValue)}</td>
                <td className="px-5 py-3 tabular-nums text-[var(--color-muted)]">{r.openCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────────────────────────
function SalesOverview({ onJump }: { onJump: (t: TabId) => void }) {
  const { store } = useApp();
  const [deals] = useDeals();
  const [leads] = useFeatureState<Lead[]>("sales-leads", []);
  const today = new Date();

  const openValue = deals.filter(d => d.stage !== "won" && d.stage !== "lost").reduce((s, d) => s + d.value, 0);
  const wonValue = deals.filter(d => d.stage === "won").reduce((s, d) => s + d.value, 0);
  const weighted = deals.filter(d => d.stage !== "lost").reduce((s, d) => s + d.value * STAGE_PROB[d.stage], 0);
  const overdueLeads = leads.filter(l => l.status !== "dropped" && l.status !== "qualified" && differenceInCalendarDays(parseISO(l.nextFollowUp), today) < 0).length;
  const outstandingAR = store.invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Open pipeline", value: formatCurrency(openValue), color: "text-[var(--color-text)]", sub: `${deals.filter(d => d.stage !== "won" && d.stage !== "lost").length} open deal(s)` },
          { label: "Weighted forecast", value: formatCurrency(Math.round(weighted)), color: "text-[var(--color-primary)]", sub: "Probability-adjusted" },
          { label: "Closed-won", value: formatCurrency(wonValue), color: "text-green-400", sub: `${deals.filter(d => d.stage === "won").length} won` },
          { label: "Overdue follow-ups", value: `${overdueLeads}`, color: overdueLeads > 0 ? "text-red-400" : "text-green-400", sub: `${leads.length} lead(s) total` },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1">Your revenue engine, one screen</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          From a WhatsApp enquiry to collected cash: capture the lead, push it through the pipeline, quote with correct GST,
          convert to an order with a UPI link, and pay the rep their commission. Customer 360 pulls live from your invoices.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {([
            ["pipeline", "Open pipeline", KanbanSquare],
            ["quote", "Build a quote", FileText],
            ["leads", "Capture a lead", BellRing],
            ["forecast", "See forecast", TrendingUp],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => onJump(id)}
              className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-xs font-medium hover:border-[var(--color-primary)]/40">
              <Icon size={14} className="text-[var(--color-primary)]" /> {label} <ArrowRight size={11} className="ml-auto text-[var(--color-muted)]" />
            </button>
          ))}
        </div>
      </div>

      {outstandingAR > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{formatCurrency(outstandingAR)} unpaid from customers</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Open Customer 360 to see who owes what and chase overdue invoices.</p>
          </div>
          <button onClick={() => onJump("customer360")}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/25 whitespace-nowrap">
            Customer 360 <ArrowRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── #21 / #35 Discount & Margin Approval Calculator ───────────────────────────────
function DiscountApproval() {
  const [listPrice, setListPrice] = useState("");
  const [cost, setCost] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [commissionPct, setCommissionPct] = useState("5");
  const [floorMarginPct, setFloorMarginPct] = useState("15");
  const [approvalThreshold, setApprovalThreshold] = useState("10");

  const calc = useMemo(() => {
    const lp = parseFloat(listPrice) || 0;
    const c = parseFloat(cost) || 0;
    const disc = Math.min(100, Math.max(0, parseFloat(discountPct) || 0));
    const comm = Math.max(0, parseFloat(commissionPct) || 0) / 100;
    const net = lp * (1 - disc / 100);
    const commission = net * comm;
    const grossMargin = net - c;
    const netMargin = grossMargin - commission;
    const marginPct = net > 0 ? (netMargin / net) * 100 : 0;
    return { lp, c, disc, net, commission, grossMargin, netMargin, marginPct };
  }, [listPrice, cost, discountPct, commissionPct]);

  const floor = parseFloat(floorMarginPct) || 0;
  const threshold = parseFloat(approvalThreshold) || 0;
  const hasInput = (parseFloat(listPrice) || 0) > 0;
  const belowFloor = hasInput && calc.marginPct < floor;
  const needsApproval = hasInput && calc.disc > threshold;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Discount &amp; Margin Approval</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">List price (₹)</label>
            <input type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your cost (₹)</label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="70000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Discount asked %</label>
            <input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="12" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Commission %</label>
            <input type="number" value={commissionPct} onChange={e => setCommissionPct(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Floor margin %</label>
            <input type="number" value={floorMarginPct} onChange={e => setFloorMarginPct(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Approval over discount %</label>
            <input type="number" value={approvalThreshold} onChange={e => setApprovalThreshold(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      {hasInput && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Net price", value: formatCurrency(Math.round(calc.net)), color: "text-[var(--color-text)]" },
              { label: "Commission", value: formatCurrency(Math.round(calc.commission)), color: "text-orange-400" },
              { label: "Net margin ₹", value: formatCurrency(Math.round(calc.netMargin)), color: calc.netMargin >= 0 ? "text-green-400" : "text-red-400" },
              { label: "Net margin %", value: `${calc.marginPct.toFixed(1)}%`, color: belowFloor ? "text-red-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-4 space-y-2 text-sm`}>
            {belowFloor ? (
              <p className="text-red-400 flex items-center gap-1.5"><XCircle size={14} /> Below floor margin of {floor}% — do not commit this price.</p>
            ) : (
              <p className="text-green-400 flex items-center gap-1.5"><CheckCircle2 size={14} /> Margin {calc.marginPct.toFixed(1)}% is above the {floor}% floor.</p>
            )}
            {needsApproval ? (
              <p className="text-yellow-400 flex items-center gap-1.5"><BellRing size={14} /> Discount {calc.disc}% exceeds {threshold}% — route to owner for approval.</p>
            ) : (
              <p className="text-[var(--color-muted)] flex items-center gap-1.5"><CheckCircle2 size={14} /> Within rep authority ({threshold}% cap) — no approval needed.</p>
            )}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Net margin = (net price − cost − commission). Reps discount blind to profit; set a floor and an approval threshold to protect margin.</p>
    </div>
  );
}

// ── #17 Sales Territory Planner ───────────────────────────────────────────────────
type Territory = { id: string; name: string; rep: string; pincodes: string; accounts: number; potential: number };
function TerritoryPlanner() {
  const [rows, setRows] = useFeatureState<Territory[]>("sales-territories", []);
  const [name, setName] = useState("");
  const [rep, setRep] = useState("");
  const [pincodes, setPincodes] = useState("");
  const [accounts, setAccounts] = useState("");
  const [potential, setPotential] = useState("");

  const add = () => {
    const a = parseInt(accounts, 10), p = parseFloat(potential);
    if (!name.trim() || !rep.trim()) { toast.error("Enter a territory name and rep"); return; }
    setRows([...rows, { id: crypto.randomUUID(), name: name.trim(), rep: rep.trim(), pincodes: pincodes.trim(), accounts: isNaN(a) ? 0 : a, potential: isNaN(p) ? 0 : p }]);
    setName(""); setRep(""); setPincodes(""); setAccounts(""); setPotential("");
    toast.success("Territory mapped");
  };

  const totalAccounts = rows.reduce((s, r) => s + r.accounts, 0);
  const totalPotential = rows.reduce((s, r) => s + r.potential, 0);
  const repCount = new Set(rows.map(r => r.rep)).size;
  const avgPerRep = repCount > 0 ? totalAccounts / repCount : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin size={14} className="text-[var(--color-primary)]" /> Map a territory</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Territory</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="South Pune" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rep</label>
            <input value={rep} onChange={e => setRep(e.target.value)} placeholder="Rahul" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pincodes</label>
            <input value={pincodes} onChange={e => setPincodes(e.target.value)} placeholder="411037, 411040" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Accounts</label>
            <input type="number" value={accounts} onChange={e => setAccounts(e.target.value)} placeholder="40" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Potential (₹)</label>
            <input type="number" value={potential} onChange={e => setPotential(e.target.value)} placeholder="2500000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No territories mapped yet. Assign reps to pincodes to balance field coverage.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Territories", value: `${rows.length}`, color: "text-[var(--color-text)]" },
              { label: "Total accounts", value: `${totalAccounts}`, color: "text-[var(--color-text)]" },
              { label: "Total potential", value: formatCurrency(totalPotential), color: "text-[var(--color-primary)]" },
              { label: "Avg accounts / rep", value: avgPerRep.toFixed(0), color: "text-[var(--color-muted)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Territory", "Rep", "Pincodes", "Accounts", "Potential", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.rep}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[180px] truncate">{r.pincodes || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.accounts}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(r.potential)}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
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

// ── #18 / #50 Activity & Call Log ─────────────────────────────────────────────────
type Activity = { id: string; contact: string; type: "call" | "whatsapp" | "visit" | "email" | "meeting"; outcome: "connected" | "no-answer" | "follow-up" | "closed"; duration: number; note: string; at: string };
const ACT_TYPE: Activity["type"][] = ["call", "whatsapp", "visit", "email", "meeting"];
const ACT_OUTCOME: Activity["outcome"][] = ["connected", "no-answer", "follow-up", "closed"];
function ActivityLog() {
  const [rows, setRows] = useFeatureState<Activity[]>("sales-activities", []);
  const [contact, setContact] = useState("");
  const [type, setType] = useState<Activity["type"]>("call");
  const [outcome, setOutcome] = useState<Activity["outcome"]>("connected");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");

  const add = () => {
    if (!contact.trim()) { toast.error("Enter a contact name"); return; }
    const d = parseFloat(duration);
    setRows([{ id: crypto.randomUUID(), contact: contact.trim(), type, outcome, duration: isNaN(d) ? 0 : d, note: note.trim(), at: new Date().toISOString() }, ...rows]);
    setContact(""); setDuration(""); setNote("");
    toast.success("Activity logged");
  };

  const totalCalls = rows.filter(r => r.type === "call").length;
  const totalMins = rows.reduce((s, r) => s + r.duration, 0);
  const connected = rows.filter(r => r.outcome === "connected" || r.outcome === "closed").length;
  const connectRate = rows.length > 0 ? (connected / rows.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PhoneCall size={14} className="text-[var(--color-primary)]" /> Log an activity</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Contact</label>
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as Activity["type"])} className={INP}>
              {ACT_TYPE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Outcome</label>
            <select value={outcome} onChange={e => setOutcome(e.target.value as Activity["outcome"])} className={INP}>
              {ACT_OUTCOME.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Duration (min)</label>
            <input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="8" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Wants revised quote" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Log
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No activity logged yet. Record every call, visit and message to keep an audit trail.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Activities", value: `${rows.length}`, color: "text-[var(--color-text)]" },
              { label: "Calls made", value: `${totalCalls}`, color: "text-[var(--color-text)]" },
              { label: "Total minutes", value: `${totalMins}`, color: "text-[var(--color-primary)]" },
              { label: "Connect rate", value: `${connectRate.toFixed(0)}%`, color: connectRate >= 50 ? "text-green-400" : "text-yellow-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["When", "Contact", "Type", "Outcome", "Mins", "Note", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{format(parseISO(r.at), "d MMM, HH:mm")}</td>
                      <td className="px-4 py-2.5 font-medium">{r.contact}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.type}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                          r.outcome === "closed" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                          r.outcome === "connected" ? "bg-blue-900/30 text-blue-400 border-blue-800/40" :
                          r.outcome === "no-answer" ? "bg-red-900/30 text-red-400 border-red-800/40" :
                          "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.outcome}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{r.duration || "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[200px] truncate">{r.note || "—"}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
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

// ── #51 Quote Expiry Tracker ──────────────────────────────────────────────────────
type QuoteExp = { id: string; quote: string; customer: string; value: number; validUntil: string };
function QuoteExpiryTracker() {
  const [rows, setRows] = useFeatureState<QuoteExp[]>("sales-quote-expiry", []);
  const [quote, setQuote] = useState("");
  const [customer, setCustomer] = useState("");
  const [value, setValue] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split("T")[0];
  });
  const today = new Date();

  const add = () => {
    const v = parseFloat(value);
    if (!quote.trim() || !customer.trim() || isNaN(v) || v <= 0) { toast.error("Enter quote, customer and a positive value"); return; }
    setRows([...rows, { id: crypto.randomUUID(), quote: quote.trim(), customer: customer.trim(), value: v, validUntil }]);
    setQuote(""); setCustomer(""); setValue("");
    toast.success("Quote tracked");
  };

  const sorted = [...rows].sort((a, b) => parseISO(a.validUntil).getTime() - parseISO(b.validUntil).getTime());
  const expired = rows.filter(r => differenceInCalendarDays(parseISO(r.validUntil), today) < 0);
  const expiringSoon = rows.filter(r => { const d = differenceInCalendarDays(parseISO(r.validUntil), today); return d >= 0 && d <= 3; });
  const liveValue = rows.filter(r => differenceInCalendarDays(parseISO(r.validUntil), today) >= 0).reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Clock size={14} className="text-[var(--color-primary)]" /> Track a quote&apos;s validity</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Quote ref</label>
            <input value={quote} onChange={e => setQuote(e.target.value)} placeholder="Q-1042" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value (₹)</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="150000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Valid until</label>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        {expiringSoon.length > 0 && (
          <p className="text-xs text-yellow-400 flex items-center gap-1.5"><BellRing size={12} /> {expiringSoon.length} quote(s) expiring within 3 days — remind the buyer before the price lapses.</p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No quotes tracked yet. Open-ended quotes erode price discipline — set a validity date.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Live quote value", value: formatCurrency(liveValue), color: "text-[var(--color-primary)]" },
              { label: "Expiring ≤ 3 days", value: `${expiringSoon.length}`, color: expiringSoon.length > 0 ? "text-yellow-400" : "text-green-400" },
              { label: "Already expired", value: `${expired.length}`, color: expired.length > 0 ? "text-red-400" : "text-green-400" },
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
                  <tr>{["Quote", "Customer", "Value", "Valid until", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {sorted.map(r => {
                    const days = differenceInCalendarDays(parseISO(r.validUntil), today);
                    const status = days < 0 ? "expired" : days <= 3 ? "expiring" : "live";
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.quote}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.customer}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(r.value)}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)] tabular-nums">{format(parseISO(r.validUntil), "d MMM yyyy")}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            status === "live" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                            status === "expiring" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" :
                            "bg-red-900/30 text-red-400 border-red-800/40"}`}>
                            {status === "expired" ? `${Math.abs(days)}d expired` : status === "expiring" ? `${days}d left` : "live"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #46 Cross-Sell / Upsell Suggester (live from invoice basket history) ──────────
function CrossSellSuggester() {
  const { store } = useApp();
  const [selected, setSelected] = useState("");

  // Build a co-occurrence map of products bought together, keyed by invoice customer.
  const data = useMemo(() => {
    type Item = { customer: string; product: string };
    const items: Item[] = [];
    store.invoices.forEach(i => {
      const product = (i.description || i.invoiceNumber || "").trim();
      if (i.customer && product) items.push({ customer: i.customer, product });
    });
    const productsByCustomer = new Map<string, Set<string>>();
    items.forEach(({ customer, product }) => {
      if (!productsByCustomer.has(customer)) productsByCustomer.set(customer, new Set());
      productsByCustomer.get(customer)!.add(product);
    });
    const allProducts = [...new Set(items.map(i => i.product))].sort();
    return { productsByCustomer, allProducts };
  }, [store.invoices]);

  const active = selected || data.allProducts[0] || "";

  const suggestions = useMemo(() => {
    if (!active) return [];
    const tally = new Map<string, number>();
    data.productsByCustomer.forEach(set => {
      if (set.has(active)) set.forEach(p => { if (p !== active) tally.set(p, (tally.get(p) ?? 0) + 1); });
    });
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [active, data]);

  if (data.allProducts.length === 0) {
    return <p className="text-xs text-[var(--color-muted)] px-1">No basket history yet. Cross-sell suggestions appear once you have invoices with product descriptions.</p>;
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <label className="text-xs text-[var(--color-muted)] block mb-1 flex items-center gap-2"><Layers size={13} className="text-[var(--color-primary)]" /> When a customer buys…</label>
        <select value={active} onChange={e => setSelected(e.target.value)} className={`${INP} max-w-sm`}>
          {data.allProducts.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-3">…they often also buy</p>
        {suggestions.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No co-purchase pattern found yet for this product. Suggestions improve as more orders are billed.</p>
        ) : (
          <div className="space-y-2">
            {suggestions.map(([p, n]) => (
              <div key={p} className="flex items-center justify-between bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5">
                <span className="text-sm font-medium flex items-center gap-2"><ArrowRight size={12} className="text-[var(--color-primary)]" /> {p}</span>
                <span className="text-[10px] text-[var(--color-muted)]">bought together {n}×</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Suggestions are mined live from your invoices: products that recurringly appear in the same customer's basket. Attach these at quote time to lift basket value.</p>
    </div>
  );
}

// ── #52 / #36 Customer Churn-Risk List (live from invoice recency + dues) ─────────
function ChurnRiskList() {
  const { store } = useApp();
  const today = new Date();

  const risks = useMemo(() => {
    const byCustomer = new Map<string, { customer: string; lastBilled: Date | null; billed: number; overdue: number; count: number }>();
    store.invoices.forEach(i => {
      if (!i.customer) return;
      const e = byCustomer.get(i.customer) ?? { customer: i.customer, lastBilled: null, billed: 0, overdue: 0, count: 0 };
      e.billed += i.amount;
      e.count += 1;
      if (i.status === "overdue") e.overdue += i.amount;
      const due = i.dueDate ? parseISO(i.dueDate) : null;
      if (due && (!e.lastBilled || due > e.lastBilled)) e.lastBilled = due;
      byCustomer.set(i.customer, e);
    });
    return [...byCustomer.values()].map(e => {
      const daysSince = e.lastBilled ? differenceInCalendarDays(today, e.lastBilled) : 999;
      let score = 0;
      if (daysSince > 90) score += 50; else if (daysSince > 60) score += 30; else if (daysSince > 30) score += 15;
      if (e.overdue > 0) score += 30;
      if (e.count <= 1) score += 20;
      score = Math.min(100, score);
      const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
      return { ...e, daysSince, score, level };
    }).sort((a, b) => b.score - a.score);
  }, [store.invoices, today]);

  if (risks.length === 0) {
    return <p className="text-xs text-[var(--color-muted)] px-1">No customers found yet. Churn risk is computed live once you have invoices.</p>;
  }

  const atRisk = risks.filter(r => r.level !== "low");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Customers tracked", value: `${risks.length}`, color: "text-[var(--color-text)]" },
          { label: "At risk (med/high)", value: `${atRisk.length}`, color: atRisk.length > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Revenue at risk", value: formatCurrency(atRisk.reduce((s, r) => s + r.billed, 0)), color: "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold flex items-center gap-2"><UserMinus size={14} className="text-[var(--color-primary)]" /> Churn-risk ranking</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Customer", "Last activity", "Overdue", "Lifetime billed", "Risk"].map(h =>
                <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {risks.map(r => (
                <tr key={r.customer} className="hover:bg-white/2">
                  <td className="px-5 py-2.5 font-medium">{r.customer}</td>
                  <td className="px-5 py-2.5 text-[var(--color-muted)] tabular-nums">{r.daysSince >= 999 ? "—" : `${r.daysSince}d ago`}</td>
                  <td className={`px-5 py-2.5 tabular-nums ${r.overdue > 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{r.overdue > 0 ? formatCurrency(r.overdue) : "—"}</td>
                  <td className="px-5 py-2.5 tabular-nums">{formatCurrency(r.billed)}</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      r.level === "high" ? "bg-red-900/30 text-red-400 border-red-800/40" :
                      r.level === "medium" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" :
                      "bg-green-900/30 text-green-400 border-green-800/40"}`}>{r.level} · {r.score}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Risk score blends inactivity (days since last due date), overdue dues, and one-time-buyer status. Win back high-risk accounts before they go silent.</p>
    </div>
  );
}

// ── #61 NPS & Feedback Tracker ────────────────────────────────────────────────────
type Feedback = { id: string; customer: string; score: number; comment: string; at: string };
function NpsTracker() {
  const [rows, setRows] = useFeatureState<Feedback[]>("sales-nps", []);
  const [customer, setCustomer] = useState("");
  const [score, setScore] = useState("9");
  const [comment, setComment] = useState("");

  const add = () => {
    const s = parseInt(score, 10);
    if (!customer.trim() || isNaN(s) || s < 0 || s > 10) { toast.error("Enter a customer and a score 0–10"); return; }
    setRows([{ id: crypto.randomUUID(), customer: customer.trim(), score: s, comment: comment.trim(), at: new Date().toISOString() }, ...rows]);
    setCustomer(""); setComment("");
    toast.success("Feedback recorded");
  };

  const promoters = rows.filter(r => r.score >= 9).length;
  const passives = rows.filter(r => r.score >= 7 && r.score <= 8).length;
  const detractors = rows.filter(r => r.score <= 6).length;
  const nps = rows.length > 0 ? Math.round(((promoters - detractors) / rows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Smile size={14} className="text-[var(--color-primary)]" /> Record feedback</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Score (0–10)</label>
            <select value={score} onChange={e => setScore(e.target.value)} className={INP}>
              {Array.from({ length: 11 }, (_, i) => 10 - i).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Comment</label>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Fast delivery" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No feedback yet. Send a 0–10 survey after each sale to track satisfaction.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "NPS", value: `${nps}`, color: nps >= 50 ? "text-green-400" : nps >= 0 ? "text-yellow-400" : "text-red-400" },
              { label: "Promoters", value: `${promoters}`, color: "text-green-400" },
              { label: "Passives", value: `${passives}`, color: "text-yellow-400" },
              { label: "Detractors", value: `${detractors}`, color: "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["When", "Customer", "Score", "Bucket", "Comment", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const bucket = r.score >= 9 ? "promoter" : r.score >= 7 ? "passive" : "detractor";
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{format(parseISO(r.at), "d MMM")}</td>
                        <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold">{r.score}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            bucket === "promoter" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                            bucket === "passive" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" :
                            "bg-red-900/30 text-red-400 border-red-800/40"}`}>{bucket}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[220px] truncate">{r.comment || "—"}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">NPS = % promoters (9–10) − % detractors (0–6). Above 50 is strong for SMB.</p>
    </div>
  );
}

// ── #57 Sales Playbook / Onboarding Checklist ─────────────────────────────────────
type PlayStep = { id: string; label: string; done: boolean };
const PLAYBOOK_TEMPLATE: string[] = [
  "Respond to enquiry within 1 hour",
  "Qualify need, budget and timeline",
  "Validate buyer GSTIN & place of supply",
  "Send branded, GST-correct quote",
  "Set quote validity & follow-up reminder",
  "Get discount approved if above policy",
  "Confirm credit limit before order",
  "Convert to sales order with UPI link",
  "Dispatch & share tracking",
  "Send NPS survey post-delivery",
];
function SalesPlaybook() {
  const defaultSteps = useMemo<PlayStep[]>(() => PLAYBOOK_TEMPLATE.map(label => ({ id: crypto.randomUUID(), label, done: false })), []);
  const [steps, setSteps] = useFeatureState<PlayStep[]>("sales-playbook", defaultSteps);
  const [newStep, setNewStep] = useState("");

  const toggle = (id: string) => setSteps(steps.map(s => s.id === id ? { ...s, done: !s.done } : s));
  const add = () => {
    if (!newStep.trim()) { toast.error("Enter a step"); return; }
    setSteps([...steps, { id: crypto.randomUUID(), label: newStep.trim(), done: false }]);
    setNewStep("");
  };
  const reset = () => { setSteps(steps.map(s => ({ ...s, done: false }))); toast.success("Playbook reset for a new deal"); };

  const done = steps.filter(s => s.done).length;
  const pct = steps.length > 0 ? (done / steps.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Deal playbook — {done}/{steps.length} done</h3>
          <button onClick={reset} className="text-xs text-[var(--color-primary)] hover:underline">Reset for new deal</button>
        </div>
        <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="space-y-1.5">
          {steps.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <button onClick={() => toggle(s.id)} className="flex items-center gap-2 text-sm text-left flex-1">
                {s.done
                  ? <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                  : <span className="w-[15px] h-[15px] rounded-full border border-[var(--color-border)] shrink-0" />}
                <span className={s.done ? "line-through text-[var(--color-muted)]" : ""}>{s.label}</span>
              </button>
              <button onClick={() => setSteps(steps.filter(x => x.id !== s.id))} className="text-[var(--color-muted)] hover:text-red-400 ml-2"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newStep} onChange={e => setNewStep(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Add a custom step…" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A repeatable checklist makes every rep follow the same winning motion. Tick steps as you progress, then reset for the next deal.</p>
    </div>
  );
}

// ── #65 / #27 Renewal Tracker ─────────────────────────────────────────────────────
type Renewal = { id: string; customer: string; product: string; value: number; renewalDate: string; status: "active" | "renewed" | "lapsed" };
function RenewalTracker() {
  const [rows, setRows] = useFeatureState<Renewal[]>("sales-renewals", []);
  const [customer, setCustomer] = useState("");
  const [product, setProduct] = useState("");
  const [value, setValue] = useState("");
  const [renewalDate, setRenewalDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0];
  });
  const today = new Date();

  const add = () => {
    const v = parseFloat(value);
    if (!customer.trim() || !product.trim() || isNaN(v) || v <= 0) { toast.error("Enter customer, product and a positive value"); return; }
    setRows([...rows, { id: crypto.randomUUID(), customer: customer.trim(), product: product.trim(), value: v, renewalDate, status: "active" }]);
    setCustomer(""); setProduct(""); setValue("");
    toast.success("Renewal tracked");
  };

  const setStatus = (id: string, status: Renewal["status"]) => setRows(rows.map(r => r.id === id ? { ...r, status } : r));
  const sorted = [...rows].sort((a, b) => parseISO(a.renewalDate).getTime() - parseISO(b.renewalDate).getTime());
  const dueSoon = rows.filter(r => r.status === "active" && differenceInCalendarDays(parseISO(r.renewalDate), today) <= 14);
  const activeValue = rows.filter(r => r.status === "active").reduce((s, r) => s + r.value, 0);
  const renewedValue = rows.filter(r => r.status === "renewed").reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Track a renewal</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Product / contract</label>
            <input value={product} onChange={e => setProduct(e.target.value)} placeholder="AMC plan" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value (₹)</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="60000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Renewal date</label>
            <input type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        {dueSoon.length > 0 && (
          <p className="text-xs text-yellow-400 flex items-center gap-1.5"><BellRing size={12} /> {dueSoon.length} renewal(s) due within 14 days — pitch an upsell while you reach out.</p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No renewals tracked yet. Recurring orders and contracts default to flat — track them to upsell on renewal.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Active value", value: formatCurrency(activeValue), color: "text-[var(--color-primary)]" },
              { label: "Due ≤ 14 days", value: `${dueSoon.length}`, color: dueSoon.length > 0 ? "text-yellow-400" : "text-green-400" },
              { label: "Renewed value", value: formatCurrency(renewedValue), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Customer", "Product", "Value", "Renewal date", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {sorted.map(r => {
                    const days = differenceInCalendarDays(parseISO(r.renewalDate), today);
                    const due = r.status === "active" && days <= 14;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.product}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(r.value)}</td>
                        <td className={`px-4 py-2.5 tabular-nums ${due ? "text-yellow-400 font-semibold" : "text-[var(--color-muted)]"}`}>
                          {format(parseISO(r.renewalDate), "d MMM yyyy")}{r.status === "active" ? (days < 0 ? ` · ${Math.abs(days)}d overdue` : ` · ${days}d`) : ""}
                        </td>
                        <td className="px-4 py-2.5">
                          <select value={r.status} onChange={e => setStatus(r.id, e.target.value as Renewal["status"])} className={`${INP} py-1 max-w-[120px]`}>
                            {(["active", "renewed", "lapsed"] as const).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── #26 Referral Tracker ──────────────────────────────────────────────────────────
type Referral = { id: string; referrer: string; referred: string; dealValue: number; rewardPct: number; status: "pending" | "closed" | "paid" };
function ReferralTracker() {
  const [rows, setRows] = useFeatureState<Referral[]>("sales-referrals", []);
  const [referrer, setReferrer] = useState("");
  const [referred, setReferred] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [rewardPct, setRewardPct] = useState("2");

  const add = () => {
    const v = parseFloat(dealValue), p = parseFloat(rewardPct);
    if (!referrer.trim() || !referred.trim()) { toast.error("Enter both the referrer and the referred customer"); return; }
    setRows([...rows, { id: crypto.randomUUID(), referrer: referrer.trim(), referred: referred.trim(), dealValue: isNaN(v) ? 0 : v, rewardPct: isNaN(p) ? 0 : p, status: "pending" }]);
    setReferrer(""); setReferred(""); setDealValue("");
    toast.success("Referral logged");
  };

  const setStatus = (id: string, status: Referral["status"]) => setRows(rows.map(r => r.id === id ? { ...r, status } : r));
  const reward = (r: Referral) => r.dealValue * (r.rewardPct / 100);
  const closed = rows.filter(r => r.status === "closed" || r.status === "paid");
  const closedValue = closed.reduce((s, r) => s + r.dealValue, 0);
  const rewardsDue = rows.filter(r => r.status === "closed").reduce((s, r) => s + reward(r), 0);
  const rewardsPaid = rows.filter(r => r.status === "paid").reduce((s, r) => s + reward(r), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gift size={14} className="text-[var(--color-primary)]" /> Log a referral</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Referred by</label>
            <input value={referrer} onChange={e => setReferrer(e.target.value)} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">New customer</label>
            <input value={referred} onChange={e => setReferred(e.target.value)} placeholder="Verma Stores" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Deal value (₹)</label>
            <input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reward %</label>
            <input type="number" value={rewardPct} onChange={e => setRewardPct(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No referrals tracked yet. Reward word-of-mouth so it keeps coming.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Referrals", value: `${rows.length}`, color: "text-[var(--color-text)]" },
              { label: "Closed value", value: formatCurrency(closedValue), color: "text-[var(--color-primary)]" },
              { label: "Rewards due", value: formatCurrency(Math.round(rewardsDue)), color: rewardsDue > 0 ? "text-yellow-400" : "text-green-400" },
              { label: "Rewards paid", value: formatCurrency(Math.round(rewardsPaid)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Referrer", "New customer", "Deal value", "Reward", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.referrer}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.referred}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.dealValue)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(Math.round(reward(r)))} <span className="text-[10px] text-[var(--color-muted)]">({r.rewardPct}%)</span></td>
                      <td className="px-4 py-2.5">
                        <select value={r.status} onChange={e => setStatus(r.id, e.target.value as Referral["status"])} className={`${INP} py-1 max-w-[120px]`}>
                          {(["pending", "closed", "paid"] as const).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Reward = deal value × reward %. Mark a referral closed when the new customer buys, then paid once you credit the referrer.</p>
    </div>
  );
}

// ── #6 Lead Source ROI (cost per channel vs deal value won, from the pipeline) ────
type SourceSpend = { source: string; spend: number };
const SOURCES = ["WhatsApp", "IndiaMART", "JustDial", "Referral", "Walk-in", "Website"] as const;
function LeadSourceROI() {
  const [deals] = useDeals();
  const [spends, setSpends] = useFeatureState<SourceSpend[]>(
    "sales-source-spend",
    SOURCES.map(s => ({ source: s, spend: 0 })),
  );

  const setSpend = (source: string, v: string) =>
    setSpends(spends.map(s => s.source === source ? { ...s, spend: Math.max(0, parseFloat(v) || 0) } : s));

  const rows = useMemo(() => {
    const all = new Set<string>([...SOURCES, ...deals.map(d => d.source)]);
    return [...all].map(source => {
      const srcDeals = deals.filter(d => d.source === source);
      const won = srcDeals.filter(d => d.stage === "won");
      const wonValue = won.reduce((s, d) => s + d.value, 0);
      const spend = spends.find(s => s.source === source)?.spend ?? 0;
      const roi = spend > 0 ? wonValue / spend : 0;
      const cpl = srcDeals.length > 0 ? spend / srcDeals.length : 0;
      const convRate = srcDeals.length > 0 ? (won.length / srcDeals.length) * 100 : 0;
      return { source, leads: srcDeals.length, won: won.length, wonValue, spend, roi, cpl, convRate };
    }).sort((a, b) => b.wonValue - a.wonValue);
  }, [deals, spends]);

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalWon = rows.reduce((s, r) => s + r.wonValue, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Marketing spend", value: formatCurrency(totalSpend), color: "text-[var(--color-text)]" },
          { label: "Won from sources", value: formatCurrency(totalWon), color: "text-[var(--color-primary)]" },
          { label: "Blended ROI", value: totalSpend > 0 ? `${(totalWon / totalSpend).toFixed(1)}x` : "—", color: "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><PieChart size={14} className="text-[var(--color-primary)]" /> Channel ROI — enter monthly spend per source</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Source", "Spend ₹", "Leads", "Won", "Conv %", "Won value", "Cost/lead", "ROI"].map(h =>
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.source} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 font-medium">{r.source}</td>
                  <td className="px-3 py-2.5 w-28">
                    <input type="number" value={spends.find(s => s.source === r.source)?.spend ?? 0}
                      onChange={e => setSpend(r.source, e.target.value)} className={`${INP} py-1`} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{r.leads}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{r.won}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.convRate.toFixed(0)}%</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold">{formatCurrency(r.wonValue)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{r.cpl > 0 ? formatCurrency(Math.round(r.cpl)) : "—"}</td>
                  <td className={`px-3 py-2.5 tabular-nums font-semibold ${r.roi >= 1 ? "text-green-400" : r.spend > 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{r.spend > 0 ? `${r.roi.toFixed(1)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Leads and won value come live from your Pipeline deals tagged by source. Enter spend to see which channel actually pays back.</p>
    </div>
  );
}

// ── #45 Rep Scorecard (conversion, cycle time, avg deal — from pipeline + winloss) ─
function RepScorecard() {
  const [deals] = useDeals();

  const rows = useMemo(() => {
    const m = new Map<string, { rep: string; total: number; won: number; lost: number; wonValue: number; openValue: number }>();
    deals.forEach(d => {
      const r = m.get(d.rep) ?? { rep: d.rep, total: 0, won: 0, lost: 0, wonValue: 0, openValue: 0 };
      r.total += 1;
      if (d.stage === "won") { r.won += 1; r.wonValue += d.value; }
      else if (d.stage === "lost") { r.lost += 1; }
      else { r.openValue += d.value; }
      m.set(d.rep, r);
    });
    return [...m.values()].map(r => {
      const closed = r.won + r.lost;
      const winRate = closed > 0 ? (r.won / closed) * 100 : 0;
      const avgDeal = r.won > 0 ? r.wonValue / r.won : 0;
      return { ...r, winRate, avgDeal };
    }).sort((a, b) => b.wonValue - a.wonValue);
  }, [deals]);

  if (deals.length === 0) {
    return <p className="text-xs text-[var(--color-muted)] px-1">No deals yet. Add deals with an assigned rep in the Pipeline tab to build scorecards.</p>;
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Rep Scorecards</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-[var(--color-border)]">
            <tr>{["Rep", "Deals", "Won", "Lost", "Win rate", "Won value", "Open value", "Avg won deal"].map(h =>
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <tr key={r.rep} className="hover:bg-white/2">
                <td className="px-4 py-2.5 font-medium">{r.rep}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.total}</td>
                <td className="px-4 py-2.5 tabular-nums text-green-400">{r.won}</td>
                <td className="px-4 py-2.5 tabular-nums text-red-400">{r.lost}</td>
                <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.winRate >= 50 ? "text-green-400" : "text-yellow-400"}`}>{r.winRate.toFixed(0)}%</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(r.wonValue)}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.openValue)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.avgDeal > 0 ? formatCurrency(Math.round(r.avgDeal)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)] px-5 py-3">Win rate = won ÷ (won + lost) closed deals. Coach the rep with the lowest win rate or the most stuck open value.</p>
    </div>
  );
}

// ── #32 RFM Customer Segments (live from invoices: recency, frequency, monetary) ──
function RfmSegments() {
  const { store } = useApp();
  const today = new Date();

  const segments = useMemo(() => {
    const m = new Map<string, { customer: string; count: number; total: number; last: Date }>();
    store.invoices.forEach(i => {
      if (!i.customer) return;
      const d = parseISO(i.invoiceDate);
      const e = m.get(i.customer) ?? { customer: i.customer, count: 0, total: 0, last: d };
      e.count += 1; e.total += i.amount;
      if (d > e.last) e.last = d;
      m.set(i.customer, e);
    });
    const list = [...m.values()].map(e => {
      const recencyDays = differenceInCalendarDays(today, e.last);
      const r = recencyDays <= 30 ? 3 : recencyDays <= 90 ? 2 : 1;
      const f = e.count >= 5 ? 3 : e.count >= 2 ? 2 : 1;
      return { ...e, recencyDays, r, f };
    });
    const maxTotal = Math.max(1, ...list.map(e => e.total));
    return list.map(e => {
      const monScore = e.total >= maxTotal * 0.5 ? 3 : e.total >= maxTotal * 0.2 ? 2 : 1;
      const score = e.r + e.f + monScore;
      const label = score >= 8 ? "Champion" : score >= 6 ? "Loyal" : score >= 4 ? "At risk" : "Hibernating";
      return { ...e, monScore, score, label };
    }).sort((a, b) => b.score - a.score);
  }, [store.invoices]);

  if (segments.length === 0) {
    return <p className="text-xs text-[var(--color-muted)] px-1">No customers yet. RFM segments build automatically once you have invoices.</p>;
  }

  const tally = ["Champion", "Loyal", "At risk", "Hibernating"].map(l => ({ l, n: segments.filter(s => s.label === l).length }));
  const badge = (l: string) =>
    l === "Champion" ? "bg-green-900/30 text-green-400 border-green-800/40"
    : l === "Loyal" ? "bg-blue-900/30 text-blue-400 border-blue-800/40"
    : l === "At risk" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"
    : "bg-red-900/30 text-red-400 border-red-800/40";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tally.map(t => (
          <div key={t.l} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{t.l}</p>
            <p className="text-xl font-bold tabular-nums">{t.n}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> RFM Segments — {segments.length} customers</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Customer", "Last order", "Orders", "Total billed", "R", "F", "M", "Segment"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {segments.map(s => (
                <tr key={s.customer} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{s.customer}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)] tabular-nums">{s.recencyDays}d ago</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.count}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(s.total)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.r}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.f}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.monScore}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badge(s.label)}`}>{s.label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">R/F/M each scored 1–3 from recency, order count, and total billed. Win back "At risk", reward "Champions".</p>
    </div>
  );
}

// ── #70 Sales Incentive Simulator (model flat vs tiered vs accelerator cost) ───────
function IncentiveSimulator() {
  const [revenue, setRevenue] = useState("5000000");
  const [quota, setQuota] = useState("4000000");
  const [flatPct, setFlatPct] = useState("4");
  const [baseRate, setBaseRate] = useState("3");
  const [accelRate, setAccelRate] = useState("7");

  const rev = Math.max(0, parseFloat(revenue) || 0);
  const q = Math.max(0, parseFloat(quota) || 0);
  const flat = Math.max(0, parseFloat(flatPct) || 0) / 100;
  const base = Math.max(0, parseFloat(baseRate) || 0) / 100;
  const accel = Math.max(0, parseFloat(accelRate) || 0) / 100;

  const flatCost = rev * flat;
  const belowQuota = Math.min(rev, q);
  const aboveQuota = Math.max(0, rev - q);
  const acceleratorCost = belowQuota * base + aboveQuota * accel;
  const attainment = q > 0 ? (rev / q) * 100 : 0;

  const schemes = [
    { name: "Flat commission", cost: flatCost, note: `${parseFloat(flatPct) || 0}% of all revenue` },
    { name: "Quota accelerator", cost: acceleratorCost, note: `${parseFloat(baseRate) || 0}% to quota, ${parseFloat(accelRate) || 0}% above` },
  ];
  const cheaper = flatCost <= acceleratorCost ? "Flat commission" : "Quota accelerator";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Model an incentive scheme</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            ["Expected revenue ₹", revenue, setRevenue],
            ["Quota ₹", quota, setQuota],
            ["Flat rate %", flatPct, setFlatPct],
            ["Base rate % (to quota)", baseRate, setBaseRate],
            ["Accelerator % (above)", accelRate, setAccelRate],
          ].map(([label, val, setter]) => (
            <div key={label as string}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{label as string}</label>
              <input type="number" value={val as string} onChange={e => (setter as (s: string) => void)(e.target.value)} className={INP} />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Attainment: <span className="tabular-nums font-semibold text-[var(--color-text)]">{attainment.toFixed(0)}%</span> of quota.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {schemes.map(s => (
          <div key={s.name} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.name}</p>
            <p className={`text-2xl font-bold tabular-nums ${s.name === cheaper ? "text-green-400" : "text-[var(--color-text)]"}`}>{formatCurrency(Math.round(s.cost))}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{s.note}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{rev > 0 ? `${(s.cost / rev * 100).toFixed(2)}% of revenue` : "—"}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Cheaper plan for this scenario: <span className="font-semibold text-[var(--color-text)]">{cheaper}</span>. Accelerators cost more above quota but push reps harder — tune to your margin.</p>
    </div>
  );
}

// ── #126 Account Plan Builder (key-account objectives, contacts, next steps) ──────
type AccountPlan = { id: string; account: string; goalValue: number; objective: string; nextStep: string; owner: string; status: "active" | "won" | "stalled" };
function AccountPlanBuilder() {
  const [plans, setPlans] = useFeatureState<AccountPlan[]>("sales-account-plans", []);
  const [account, setAccount] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [objective, setObjective] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [owner, setOwner] = useState("");

  const add = () => {
    const g = parseFloat(goalValue);
    if (!account.trim() || isNaN(g) || g <= 0) { toast.error("Enter an account and a positive goal value"); return; }
    setPlans([...plans, { id: crypto.randomUUID(), account: account.trim(), goalValue: g, objective: objective.trim(), nextStep: nextStep.trim(), owner: owner.trim() || "Unassigned", status: "active" }]);
    setAccount(""); setGoalValue(""); setObjective(""); setNextStep(""); setOwner("");
    toast.success("Account plan created");
  };
  const setStatus = (id: string, status: AccountPlan["status"]) => setPlans(plans.map(p => p.id === id ? { ...p, status } : p));

  const totalGoal = plans.reduce((s, p) => s + p.goalValue, 0);
  const wonGoal = plans.filter(p => p.status === "won").reduce((s, p) => s + p.goalValue, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FolderKanban size={14} className="text-[var(--color-primary)]" /> Build a key-account plan</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account</label>
            <input value={account} onChange={e => setAccount(e.target.value)} placeholder="Sharma Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual goal (₹)</label>
            <input type="number" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder="2000000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Owner</label>
            <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Rahul" className={INP} />
          </div>
          <div className="md:col-span-1 col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Objective</label>
            <input value={objective} onChange={e => setObjective(e.target.value)} placeholder="Become sole supplier" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Next step</label>
            <input value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="Meet purchase head next week" className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit"><Plus size={13} /> Add plan</button>
      </div>

      {plans.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No account plans yet. Plan your top accounts so big relationships don't run on memory.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Planned accounts", value: `${plans.length}`, color: "text-[var(--color-text)]" },
              { label: "Total goal value", value: formatCurrency(totalGoal), color: "text-[var(--color-primary)]" },
              { label: "Won goal value", value: formatCurrency(wonGoal), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plans.map(p => (
              <div key={p.id} className={`${CARD} p-4 space-y-2`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{p.account}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{p.owner} · goal {formatCurrency(p.goalValue)}</p>
                  </div>
                  <button onClick={() => setPlans(plans.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                </div>
                {p.objective && <p className="text-xs"><span className="text-[var(--color-muted)]">Objective: </span>{p.objective}</p>}
                {p.nextStep && <p className="text-xs"><span className="text-[var(--color-muted)]">Next step: </span>{p.nextStep}</p>}
                <select value={p.status} onChange={e => setStatus(p.id, e.target.value as AccountPlan["status"])} className={`${INP} py-1 max-w-[140px]`}>
                  {(["active", "won", "stalled"] as const).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── #63 Rate Card / Price-List Manager (tiered prices, GST-aware landed price) ────
type RateRow = { id: string; sku: string; listPrice: number; tier1Pct: number; tier2Pct: number; gstPct: number };
function RateCardManager() {
  const [rows, setRows] = useFeatureState<RateRow[]>("sales-rate-card", []);
  const [sku, setSku] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [gstPct, setGstPct] = useState("18");

  const add = () => {
    const p = parseFloat(listPrice);
    if (!sku.trim() || isNaN(p) || p <= 0) { toast.error("Enter an SKU and a positive list price"); return; }
    setRows([...rows, { id: crypto.randomUUID(), sku: sku.trim(), listPrice: p, tier1Pct: 5, tier2Pct: 10, gstPct: parseFloat(gstPct) }]);
    setSku(""); setListPrice("");
    toast.success("Item added to rate card");
  };
  const update = (id: string, patch: Partial<RateRow>) => setRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const net = (price: number, gst: number) => price * (1 + gst / 100);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Tag size={14} className="text-[var(--color-primary)]" /> Add a rate-card item</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">SKU / product</label>
            <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Cement bag 50kg" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">List price (₹)</label>
            <input type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="400" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GST %</label>
            <select value={gstPct} onChange={e => setGstPct(e.target.value)} className={INP}>
              {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Set per-item Tier-1 (mid volume) and Tier-2 (bulk) discount %; net price includes GST.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No items yet. A versioned rate card stops reps from quoting stale prices.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["SKU", "List ₹", "GST", "Tier-1 %", "Tier-1 net", "Tier-2 %", "Tier-2 net", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const t1 = r.listPrice * (1 - r.tier1Pct / 100);
                  const t2 = r.listPrice * (1 - r.tier2Pct / 100);
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{r.sku}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatCurrency(r.listPrice)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{r.gstPct}%</td>
                      <td className="px-3 py-2.5 w-20"><input type="number" value={r.tier1Pct} onChange={e => update(r.id, { tier1Pct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })} className={`${INP} py-1`} /></td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(net(t1, r.gstPct)))}</td>
                      <td className="px-3 py-2.5 w-20"><input type="number" value={r.tier2Pct} onChange={e => update(r.id, { tier2Pct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })} className={`${INP} py-1`} /></td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(net(t2, r.gstPct)))}</td>
                      <td className="px-3 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── #44 Pipeline Velocity (qualified deals × win rate × avg deal ÷ cycle days) ─────
function PipelineVelocity() {
  const [deals] = useDeals();
  const [cycleDays, setCycleDays] = useState("30");

  const m = useMemo(() => {
    const open = deals.filter(d => d.stage !== "won" && d.stage !== "lost");
    const won = deals.filter(d => d.stage === "won");
    const lost = deals.filter(d => d.stage === "lost");
    const closed = won.length + lost.length;
    const winRate = closed > 0 ? won.length / closed : 0;
    const avgDeal = won.length > 0 ? won.reduce((s, d) => s + d.value, 0) / won.length
      : open.length > 0 ? open.reduce((s, d) => s + d.value, 0) / open.length : 0;
    const days = Math.max(1, parseFloat(cycleDays) || 1);
    const velocityPerDay = (open.length * winRate * avgDeal) / days;
    return { openCount: open.length, winRate, avgDeal, velocityPerDay, monthly: velocityPerDay * 30 };
  }, [deals, cycleDays]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> Pipeline velocity</h3>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Avg sales-cycle length (days)</label>
          <input type="number" value={cycleDays} onChange={e => setCycleDays(e.target.value)} className={INP} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open deals", value: `${m.openCount}`, color: "text-[var(--color-text)]" },
          { label: "Win rate", value: `${(m.winRate * 100).toFixed(0)}%`, color: m.winRate >= 0.5 ? "text-green-400" : "text-yellow-400" },
          { label: "Avg deal size", value: formatCurrency(Math.round(m.avgDeal)), color: "text-[var(--color-text)]" },
          { label: "Velocity / day", value: formatCurrency(Math.round(m.velocityPerDay)), color: "text-[var(--color-primary)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-1">Projected revenue at this velocity</p>
        <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(m.monthly))}<span className="text-xs font-normal text-[var(--color-muted)]"> / 30 days</span></p>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Velocity = (open deals × win rate × avg deal size) ÷ cycle days. Shorten the cycle or lift win rate to speed cash — both beat just adding more leads.</p>
      </div>
    </div>
  );
}

// ── Deal-Stage Conversion Funnel ──────────────────────────────────────────────────
function ConversionFunnel() {
  const [deals] = useDeals();
  const data = useMemo(() => {
    // A deal that reached a later stage also "passed through" the earlier ones.
    const reachIdx = (d: Deal) => d.stage === "lost" ? -1 : STAGES.indexOf(d.stage);
    const flowStages: Stage[] = ["enquiry", "quoted", "negotiation", "won"];
    const counts = flowStages.map(s => {
      const idx = STAGES.indexOf(s);
      const n = deals.filter(d => reachIdx(d) >= idx).length;
      return { stage: s, n };
    });
    const top = counts[0]?.n ?? 0;
    return counts.map((c, i) => {
      const prev = i === 0 ? c.n : counts[i - 1].n;
      return {
        ...c,
        ofTop: top ? c.n / top : 0,
        stepDrop: prev ? 1 - c.n / prev : 0,
      };
    });
  }, [deals]);

  const lost = deals.filter(d => d.stage === "lost").length;

  if (deals.length === 0) {
    return <EmptyState icon={Filter} title="No deals to analyse"
      description="Add deals in the Pipeline tab. This funnel shows how many enquiries survive each stage through to Won, and where the biggest drop-off is." />;
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Filter size={14} className="text-[var(--color-primary)]" /> Deal-stage conversion funnel</h3>
        <div className="space-y-2">
          {data.map(d => (
            <div key={d.stage}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{STAGE_LABEL[d.stage]}</span>
                <span className="tabular-nums text-[var(--color-muted)]">{d.n} deal{d.n === 1 ? "" : "s"} · {(d.ofTop * 100).toFixed(0)}% of enquiries</span>
              </div>
              <div className="h-5 bg-[var(--color-bg)] rounded overflow-hidden border border-[var(--color-border)]">
                <div className="h-full bg-[var(--color-primary)] rounded-r" style={{ width: `${Math.max(d.ofTop * 100, d.n > 0 ? 2 : 0)}%` }} />
              </div>
              {d.stepDrop > 0 && (
                <p className="text-[10px] text-yellow-400 mt-0.5">↓ {(d.stepDrop * 100).toFixed(0)}% drop from previous stage</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-1">Marked lost: {lost}</p>
        <p className="text-[10px] text-[var(--color-muted)]">The biggest single drop is where to focus coaching or process fixes — e.g. a heavy quoted→negotiation drop usually means pricing or follow-up gaps, not lead quality.</p>
      </div>
    </div>
  );
}

// ── Revenue per Customer ──────────────────────────────────────────────────────────
function RevenuePerCustomer() {
  const { store } = useApp();
  const rows = useMemo(() => {
    const map = new Map<string, { billed: number; collected: number; count: number }>();
    store.invoices.forEach(i => {
      if (!i.customer) return;
      const r = map.get(i.customer) ?? { billed: 0, collected: 0, count: 0 };
      r.billed += i.amount;
      if (i.status === "paid") r.collected += i.amount;
      r.count += 1;
      map.set(i.customer, r);
    });
    return [...map.entries()]
      .map(([customer, r]) => ({ customer, ...r, avg: r.count ? r.billed / r.count : 0 }))
      .sort((a, b) => b.billed - a.billed);
  }, [store.invoices]);

  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);

  if (rows.length === 0) {
    return <EmptyState icon={Wallet} title="No invoiced customers yet"
      description="Once you raise invoices, this ranks customers by lifetime revenue, average invoice size and share of total — so you know which accounts actually carry the business." />;
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <p className="text-xs text-[var(--color-muted)] mb-1">Total billed across {rows.length} customer{rows.length === 1 ? "" : "s"}</p>
        <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(totalBilled))}</p>
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full text-xs">
          <thead className="bg-[var(--color-bg)] text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Customer</th>
              <th className="px-4 py-2 text-right font-medium">Invoices</th>
              <th className="px-4 py-2 text-right font-medium">Avg invoice</th>
              <th className="px-4 py-2 text-right font-medium">Collected</th>
              <th className="px-4 py-2 text-right font-medium">Total billed</th>
              <th className="px-4 py-2 text-right font-medium">% of revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.customer} className="border-t border-[var(--color-border)]">
                <td className="px-4 py-2 font-medium truncate max-w-[160px]">{r.customer}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Math.round(r.avg))}</td>
                <td className="px-4 py-2 text-right tabular-nums text-green-400">{formatCurrency(Math.round(r.collected))}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatCurrency(Math.round(r.billed))}</td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{totalBilled ? (r.billed / totalBilled * 100).toFixed(1) : "0.0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)] px-1">If a handful of customers make up most of the revenue, that's concentration risk — protect those relationships and work on broadening the base.</p>
    </div>
  );
}

// ── Quote Acceptance Rate ───────────────────────────────────────────────────────────
function QuoteAcceptanceRate() {
  const [deals] = useDeals();
  const m = useMemo(() => {
    // "Quoted" = any deal that reached at least the quoted stage (incl. negotiation/won/lost).
    const quotedIdx = STAGES.indexOf("quoted");
    const quoted = deals.filter(d => d.stage === "lost" || STAGES.indexOf(d.stage) >= quotedIdx);
    const won = quoted.filter(d => d.stage === "won");
    const open = quoted.filter(d => d.stage === "quoted" || d.stage === "negotiation");
    const decided = quoted.filter(d => d.stage === "won" || d.stage === "lost");
    const acceptance = decided.length ? won.length / decided.length : 0;
    const wonValue = won.reduce((s, d) => s + d.value, 0);
    const quotedValue = quoted.reduce((s, d) => s + d.value, 0);
    return {
      quotedCount: quoted.length, wonCount: won.length, openCount: open.length,
      decidedCount: decided.length, acceptance, wonValue, quotedValue,
      valueAcceptance: quotedValue ? wonValue / quotedValue : 0,
    };
  }, [deals]);

  if (m.quotedCount === 0) {
    return <EmptyState icon={FileCheck2} title="No quotes sent yet"
      description="Move deals to the Quoted stage in the Pipeline. This shows what share of quoted deals you actually close — by count and by value — so you can spot leaky pricing or follow-up." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Quotes sent", value: `${m.quotedCount}`, color: "text-[var(--color-text)]" },
          { label: "Accepted (won)", value: `${m.wonCount}`, color: "text-green-400" },
          { label: "Still open", value: `${m.openCount}`, color: "text-yellow-400" },
          { label: "Acceptance rate", value: `${(m.acceptance * 100).toFixed(0)}%`, color: m.acceptance >= 0.4 ? "text-green-400" : "text-yellow-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-4 space-y-2`}>
        <p className="text-sm font-semibold">Value-weighted acceptance</p>
        <div className="h-5 bg-[var(--color-bg)] rounded overflow-hidden border border-[var(--color-border)]">
          <div className="h-full bg-[var(--color-primary)]" style={{ width: `${m.valueAcceptance * 100}%` }} />
        </div>
        <p className="text-xs text-[var(--color-muted)] tabular-nums">{formatCurrency(Math.round(m.wonValue))} won of {formatCurrency(Math.round(m.quotedValue))} quoted ({(m.valueAcceptance * 100).toFixed(0)}%)</p>
        <p className="text-[10px] text-[var(--color-muted)]">Acceptance rate uses only decided quotes ({m.decidedCount}). A low rate with big quote values often means you're pricing above the buyer's budget — try staged or smaller first orders.</p>
      </div>
    </div>
  );
}

// ── Seasonal Sales Pattern ──────────────────────────────────────────────────────────
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
function SeasonalPattern() {
  const { store } = useApp();
  const m = useMemo(() => {
    const totals = new Array(12).fill(0) as number[];
    const counts = new Array(12).fill(0) as number[];
    store.invoices.forEach(i => {
      if (!i.invoiceDate) return;
      const d = parseISO(i.invoiceDate);
      const mo = d.getMonth();
      if (mo < 0 || mo > 11 || isNaN(mo)) return;
      totals[mo] += i.amount;
      counts[mo] += 1;
    });
    const peak = Math.max(...totals, 0);
    const active = totals.filter(t => t > 0).length;
    const avg = active ? totals.reduce((s, t) => s + t, 0) / active : 0;
    const peakMonth = totals.indexOf(peak);
    return { totals, counts, peak, avg, peakMonth, hasData: active > 0 };
  }, [store.invoices]);

  if (!m.hasData) {
    return <EmptyState icon={CalendarRange} title="No dated invoices yet"
      description="Once invoices have dates, this maps revenue by calendar month so you can see your busy and lean seasons — and plan stock, staffing and cash around them." />;
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><CalendarRange size={14} className="text-[var(--color-primary)]" /> Revenue by month</h3>
        <div className="space-y-1.5">
          {MONTH_LABEL.map((label, i) => {
            const t = m.totals[i];
            const aboveAvg = t > m.avg && m.avg > 0;
            return (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] w-8 text-[var(--color-muted)]">{label}</span>
                <div className="flex-1 h-4 bg-[var(--color-bg)] rounded overflow-hidden border border-[var(--color-border)]">
                  <div className={`h-full ${i === m.peakMonth ? "bg-[var(--color-primary)]" : aboveAvg ? "bg-green-500/70" : "bg-[var(--color-muted)]/40"}`} style={{ width: `${m.peak ? (t / m.peak) * 100 : 0}%` }} />
                </div>
                <span className="text-[10px] w-24 text-right tabular-nums text-[var(--color-muted)]">{t > 0 ? formatCurrency(Math.round(t)) : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-1">Peak month: {MONTH_LABEL[m.peakMonth]} ({formatCurrency(Math.round(m.peak))})</p>
        <p className="text-[10px] text-[var(--color-muted)]">Green bars are above your average active month. Build inventory and working-capital ahead of peaks, and run promotions to lift the lean months — seasonality is easier to fund than to fight.</p>
      </div>
    </div>
  );
}
