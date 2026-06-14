import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Briefcase, KanbanSquare, FileText, ShoppingCart, Coins, UserCircle2,
  TrendingUp, BellRing, Trophy, Target, ClipboardList, Plus, Trash2,
  ArrowRight, CheckCircle2, XCircle, Phone, MessageCircle, Award,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

// ── shared style tokens (matched to TaxPage / DebtPage tools) ───────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "pipeline" | "deals" | "quote" | "commission" | "customer360"
  | "forecast" | "leads" | "winloss" | "target" | "leaderboard";

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
