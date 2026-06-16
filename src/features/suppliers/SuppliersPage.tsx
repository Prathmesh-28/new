import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { Package, Zap, TrendingDown, Check, Award, RefreshCw, FileText, BadgeCheck, Plus, Trash2, Search, Percent, LineChart, Timer, GitCompare, PieChart, ClipboardCheck, Handshake, ListOrdered, FileCheck, Microscope, CalendarClock, Truck, CalendarDays, Scale, ShieldCheck, Boxes, Wallet, CalendarRange, Copy, Warehouse, Receipt } from "lucide-react";
import { toast } from "sonner";
import PreviewBadge from "@/components/PreviewBadge";

const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

interface SupplierOffer {
  id: string;
  supplier_name: string;
  invoice_amount: number;
  early_pay_discount: number;
  days_early: number;
  saving: number;
  due_date: string;
}

type SupTab = "early-pay" | "scorecard" | "reorder" | "rate-contract" | "msme-verify"
  | "terms-optimizer" | "price-trend" | "leadtime-variance" | "alt-supplier" | "concentration" | "grn-match" | "negotiation-prep"
  | "pay-priority" | "gst-2b" | "quality-ppm" | "credit-util" | "landed-cost"
  | "contract-calendar" | "terms-benchmark" | "risk-diversification" | "eoq-check"
  | "vendor-advances" | "recurring-bills" | "dup-invoice" | "carrying-cost" | "tds-bills";
const SUP_TABS: { id: SupTab; label: string; Icon: typeof Package }[] = [
  { id: "early-pay",         label: "Early-Pay",      Icon: Zap },
  { id: "scorecard",         label: "Scorecard",      Icon: Award },
  { id: "reorder",           label: "Reorder Point",  Icon: RefreshCw },
  { id: "rate-contract",     label: "Rate Contracts", Icon: FileText },
  { id: "msme-verify",       label: "MSME Verify",    Icon: BadgeCheck },
  { id: "terms-optimizer",   label: "Terms Optimizer", Icon: Percent },
  { id: "price-trend",       label: "Price Trend",    Icon: LineChart },
  { id: "leadtime-variance", label: "Lead-Time Var",  Icon: Timer },
  { id: "alt-supplier",      label: "Alt Suppliers",  Icon: GitCompare },
  { id: "concentration",     label: "Concentration",  Icon: PieChart },
  { id: "grn-match",         label: "GRN 3-Way",      Icon: ClipboardCheck },
  { id: "negotiation-prep",  label: "Negotiation",    Icon: Handshake },
  { id: "pay-priority",      label: "Pay Priority",   Icon: ListOrdered },
  { id: "gst-2b",            label: "GST-2B Match",   Icon: FileCheck },
  { id: "quality-ppm",       label: "Quality PPM",    Icon: Microscope },
  { id: "credit-util",       label: "Credit Util",    Icon: CalendarClock },
  { id: "landed-cost",       label: "Landed Cost",    Icon: Truck },
  { id: "contract-calendar",     label: "Contract Calendar",  Icon: CalendarDays },
  { id: "terms-benchmark",       label: "Terms Benchmark",    Icon: Scale },
  { id: "risk-diversification",  label: "Risk Spread",        Icon: ShieldCheck },
  { id: "eoq-check",             label: "EOQ Check",          Icon: Boxes },
  { id: "vendor-advances",       label: "Vendor Advances",    Icon: Wallet },
  { id: "recurring-bills",       label: "Recurring Bills",    Icon: CalendarRange },
  { id: "dup-invoice",           label: "Dup. Invoice",       Icon: Copy },
  { id: "carrying-cost",         label: "Carrying Cost",      Icon: Warehouse },
  { id: "tds-bills",             label: "TDS on Bills",       Icon: Receipt },
];

export default function SuppliersPage() {
  const [tab, setTab] = useState<SupTab>("early-pay");
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
        {SUP_TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {tab === "early-pay"         && <EarlyPaySection />}
      {tab === "scorecard"         && <SupplierScorecard />}
      {tab === "reorder"           && <ReorderPointTracker />}
      {tab === "rate-contract"     && <RateContractManager />}
      {tab === "msme-verify"       && <MsmeVerificationBatch />}
      {tab === "terms-optimizer"   && <PaymentTermsOptimizer />}
      {tab === "price-trend"       && <PriceTrendTracker />}
      {tab === "leadtime-variance" && <LeadTimeVarianceAnalyzer />}
      {tab === "alt-supplier"      && <AltSupplierShortlist />}
      {tab === "concentration"     && <ConcentrationRisk />}
      {tab === "grn-match"         && <GrnThreeWayMatch />}
      {tab === "negotiation-prep"  && <NegotiationPrepSheet />}
      {tab === "pay-priority"      && <PaymentPriorityPlanner />}
      {tab === "gst-2b"            && <Gst2bMatchStatus />}
      {tab === "quality-ppm"       && <QualityPpmTracker />}
      {tab === "credit-util"       && <CreditPeriodUtilization />}
      {tab === "landed-cost"       && <LandedCostCompare />}
      {tab === "contract-calendar"    && <ContractExpiryCalendar />}
      {tab === "terms-benchmark"      && <PaymentTermsBenchmark />}
      {tab === "risk-diversification" && <RiskDiversification />}
      {tab === "eoq-check"            && <EoqCheck />}
      {tab === "vendor-advances"      && <VendorAdvanceTracker />}
      {tab === "recurring-bills"      && <RecurringBillCalendar />}
      {tab === "dup-invoice"          && <DuplicateInvoiceGuard />}
      {tab === "carrying-cost"        && <CarryingCostCalculator />}
      {tab === "tds-bills"            && <TdsOnBillsCalculator />}
    </div>
  );
}

function EarlyPaySection() {
  const [offers, setOffers]   = useState<SupplierOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState<Record<string, boolean>>({});
  const [paid, setPaid]       = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<SupplierOffer[]>("/api/suppliers/marketplace")
      .then(setOffers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const payEarly = async (offer: SupplierOffer) => {
    setPaying(p => ({ ...p, [offer.id]: true }));
    try {
      await api.post("/api/suppliers/pay-early", { offer_id: offer.id });
      setPaid(s => new Set([...s, offer.id]));
      toast.success(`Early payment initiated to ${offer.supplier_name}. You saved ${formatCurrency(offer.saving)}.`);
    } catch {
      toast.error("Payment failed");
    } finally {
      setPaying(p => ({ ...p, [offer.id]: false }));
    }
  };

  const totalSavings = offers.filter(o => !paid.has(o.id)).reduce((s, o) => s + o.saving, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">Supplier Early-Pay <PreviewBadge capability="supplierMarketplace" /></h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Pay early, save on invoice cost · Suppliers get paid today</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open Offers",       value: offers.filter(o => !paid.has(o.id)).length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Total Payable",     value: formatCurrency(offers.reduce((s,o)=>s+o.invoice_amount,0)), color: "text-[var(--color-muted)]" },
          { label: "Savings Available", value: formatCurrency(totalSavings), color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
      ) : offers.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Package size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No early-pay offers available right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map(offer => (
            <div key={offer.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 transition-all ${paid.has(offer.id) ? "border-green-700/40 opacity-60" : "border-[var(--color-border)]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{offer.supplier_name}</p>
                    <span className="text-[10px] font-semibold bg-green-900/30 text-green-400 border border-green-800/30 px-2 py-0.5 rounded-full">
                      {offer.early_pay_discount}% discount
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
                    <span>Invoice: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(offer.invoice_amount)}</span></span>
                    <span>Due in <span className="font-semibold text-yellow-400">{offer.days_early}d</span></span>
                    <span className="flex items-center gap-1">
                      <TrendingDown size={10} className="text-green-400" />
                      Save <span className="font-semibold text-green-400">{formatCurrency(offer.saving)}</span>
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(offer.invoice_amount - offer.saving)}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">Pay today</p>
                  {paid.has(offer.id) ? (
                    <span className="flex items-center gap-1 text-xs text-green-400 mt-1"><Check size={11} /> Paid</span>
                  ) : (
                    <button onClick={() => payEarly(offer)} disabled={paying[offer.id]}
                      className="mt-2 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                      <Zap size={11} /> {paying[offer.id] ? "Paying…" : "Pay Early"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">How it works</p>
        <div className="space-y-2 text-xs text-[var(--color-muted)]">
          <p>1. Supplier offers a discount for immediate payment instead of waiting until due date.</p>
          <p>2. You pay today at the discounted amount — saving 1–2% on each invoice.</p>
          <p>3. Supplier gets paid same-day via NEFT. You earn ~18% annualized on idle cash deployed here.</p>
          <p>4. Every early payment strengthens your supplier relationships automatically.</p>
        </div>
      </div>
    </div>
  );
}

// ── #65 Supplier Scorecard (quality / OTIF / price) ──────────────────────────────
type ScoreRow = {
  id: string;
  name: string;
  qualityPct: number;   // % accepted lots (quality)
  otifPct: number;      // % on-time-in-full deliveries
  priceIndex: number;   // 100 = at market; <100 cheaper; >100 dearer
  responsiveness: number; // 1-5
};
function SupplierScorecard() {
  const [rows, setRows] = useFeatureState<ScoreRow[]>("supplier-scorecards", []);
  const [name, setName] = useState("");
  const [qualityPct, setQualityPct] = useState("");
  const [otifPct, setOtifPct] = useState("");
  const [priceIndex, setPriceIndex] = useState("");
  const [responsiveness, setResponsiveness] = useState("3");

  // Weighted composite: quality 35%, OTIF 35%, price 20%, responsiveness 10%
  const compositeOf = (r: ScoreRow) => {
    const priceScore = Math.max(0, Math.min(100, 200 - r.priceIndex)); // 100→100, 150→50, 200→0
    const respScore = (r.responsiveness / 5) * 100;
    return Math.round(r.qualityPct * 0.35 + r.otifPct * 0.35 + priceScore * 0.20 + respScore * 0.10);
  };
  const grade = (s: number) => s >= 85 ? { g: "A — Preferred", c: "text-green-400" } : s >= 70 ? { g: "B — Approved", c: "text-blue-400" } : s >= 55 ? { g: "C — Conditional", c: "text-yellow-400" } : { g: "D — Review", c: "text-red-400" };

  const ranked = useMemo(() => [...rows].map(r => ({ ...r, composite: compositeOf(r) })).sort((a, b) => b.composite - a.composite), [rows]);

  const add = () => {
    if (!name.trim()) { toast.error("Enter supplier name"); return; }
    const clamp = (v: string) => Math.max(0, Math.min(100, parseFloat(v) || 0));
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      name: name.trim(),
      qualityPct: clamp(qualityPct),
      otifPct: clamp(otifPct),
      priceIndex: Math.max(1, parseFloat(priceIndex) || 100),
      responsiveness: Math.max(1, Math.min(5, parseFloat(responsiveness) || 3)),
    }]);
    setName(""); setQualityPct(""); setOtifPct(""); setPriceIndex("");
    toast.success("Supplier rated");
  };

  const avg = ranked.length ? Math.round(ranked.reduce((s, r) => s + r.composite, 0) / ranked.length) : 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Award size={14} className="text-[var(--color-primary)]" /> Supplier Scorecard (Quality / OTIF / Price)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Rate and rank suppliers on delivery KPIs. Composite = Quality 35% + OTIF 35% + Price 20% + Responsiveness 10%. Use it to consolidate spend on A-grade vendors.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Supplier name *" className={INP} />
          <input type="number" value={qualityPct} onChange={e => setQualityPct(e.target.value)} placeholder="Quality % (0-100)" className={INP} />
          <input type="number" value={otifPct} onChange={e => setOtifPct(e.target.value)} placeholder="OTIF % (0-100)" className={INP} />
          <input type="number" value={priceIndex} onChange={e => setPriceIndex(e.target.value)} placeholder="Price index (100=mkt)" className={INP} />
          <select value={responsiveness} onChange={e => setResponsiveness(e.target.value)} className={INP}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Responsiveness {n}/5</option>)}
          </select>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Rate supplier</button>
        </div>
      </div>

      {ranked.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Suppliers rated", value: String(ranked.length), color: "text-[var(--color-primary)]" },
            { label: "Avg. composite", value: String(avg), color: avg >= 70 ? "text-green-400" : "text-yellow-400" },
            { label: "Top supplier", value: ranked[0].name, color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums truncate ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["#", "Supplier", "Quality", "OTIF", "Price idx", "Resp.", "Composite", "Grade", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ranked.map((r, i) => {
                const gr = grade(r.composite);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5 text-xs font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.qualityPct}%</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.otifPct}%</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.priceIndex}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.responsiveness}/5</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-bold">{r.composite}</td>
                    <td className={`px-3 py-2.5 text-xs font-semibold ${gr.c}`}>{gr.g}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Price index normalises cost to market (100 = at-market, 150 = 50% dearer). Re-score quarterly off GRN rejection rates and PO-vs-delivery data to keep the ranking objective.</p>
    </div>
  );
}

// ── #66 Reorder Point & Lead-Time Tracker ────────────────────────────────────────
type ReorderRow = {
  id: string;
  item: string;
  avgDailyUse: number;
  leadTimeDays: number;
  safetyStock: number;
  onHand: number;
};
function ReorderPointTracker() {
  const [rows, setRows] = useFeatureState<ReorderRow[]>("supplier-reorder-points", []);
  const [item, setItem] = useState("");
  const [avgDailyUse, setAvgDailyUse] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [safetyStock, setSafetyStock] = useState("");
  const [onHand, setOnHand] = useState("");

  // ROP = (avg daily usage × lead time) + safety stock
  const ropOf = (r: ReorderRow) => Math.round(r.avgDailyUse * r.leadTimeDays + r.safetyStock);
  const daysCoverOf = (r: ReorderRow) => r.avgDailyUse > 0 ? Math.round(r.onHand / r.avgDailyUse) : Infinity;
  const suggestedQtyOf = (r: ReorderRow) => Math.max(0, Math.round(ropOf(r) + r.avgDailyUse * r.leadTimeDays - r.onHand)); // bring back above ROP

  const add = () => {
    if (!item.trim()) { toast.error("Enter item name"); return; }
    const num = (v: string) => Math.max(0, parseFloat(v) || 0);
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      item: item.trim(),
      avgDailyUse: num(avgDailyUse),
      leadTimeDays: num(leadTimeDays),
      safetyStock: num(safetyStock),
      onHand: num(onHand),
    }]);
    setItem(""); setAvgDailyUse(""); setLeadTimeDays(""); setSafetyStock(""); setOnHand("");
    toast.success("Item tracked");
  };

  const toReorder = rows.filter(r => r.onHand <= ropOf(r));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><RefreshCw size={14} className="text-[var(--color-primary)]" /> Reorder Point & Lead-Time Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Auto-suggests reorders from consumption. ROP = (avg daily use × lead time) + safety stock. When on-hand falls to the ROP, raise a PO for the suggested quantity.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / SKU *" className={INP} />
          <input type="number" value={avgDailyUse} onChange={e => setAvgDailyUse(e.target.value)} placeholder="Avg daily usage" className={INP} />
          <input type="number" value={leadTimeDays} onChange={e => setLeadTimeDays(e.target.value)} placeholder="Lead time (days)" className={INP} />
          <input type="number" value={safetyStock} onChange={e => setSafetyStock(e.target.value)} placeholder="Safety stock (units)" className={INP} />
          <input type="number" value={onHand} onChange={e => setOnHand(e.target.value)} placeholder="On-hand (units)" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Track item</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Items tracked", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Below reorder point", value: String(toReorder.length), color: toReorder.length > 0 ? "text-red-400" : "text-green-400" },
            { label: "Healthy", value: String(rows.length - toReorder.length), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Item", "Daily use", "Lead time", "On-hand", "ROP", "Days cover", "Status", "Order qty", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const rop = ropOf(r);
                const due = r.onHand <= rop;
                const cover = daysCoverOf(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.item}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.avgDailyUse}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.leadTimeDays}d</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.onHand}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{rop}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{cover === Infinity ? "—" : `${cover}d`}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${due ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{due ? "Reorder" : "OK"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold">{due ? suggestedQtyOf(r) : "—"}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Safety stock buffers demand/lead-time variability. Suggested order quantity restores stock to one ROP above the trigger; tune to your EOQ or supplier MOQ before raising the PO.</p>
    </div>
  );
}

// ── #67 Rate Contract / Price List Manager (with expiry) ─────────────────────────
type RateRow = {
  id: string;
  supplier: string;
  item: string;
  rate: number;
  uom: string;
  validFrom: string;
  validTo: string;
};
function RateContractManager() {
  const [rows, setRows] = useFeatureState<RateRow[]>("supplier-rate-contracts", []);
  const [supplier, setSupplier] = useState("");
  const [item, setItem] = useState("");
  const [rate, setRate] = useState("");
  const [uom, setUom] = useState("unit");
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().split("T")[0]);
  const [validTo, setValidTo] = useState("");
  const fc = formatCurrency;
  const today = new Date().toISOString().split("T")[0];

  const statusOf = (r: RateRow): { label: string; c: string } => {
    if (r.validTo && r.validTo < today) return { label: "Expired", c: "bg-red-900/30 text-red-400 border-red-800/40" };
    if (r.validFrom > today) return { label: "Upcoming", c: "bg-blue-900/30 text-blue-400 border-blue-800/40" };
    if (r.validTo) {
      const daysLeft = Math.ceil((new Date(r.validTo).getTime() - new Date(today).getTime()) / 86400000);
      if (daysLeft <= 30) return { label: `Expiring ${daysLeft}d`, c: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" };
    }
    return { label: "Active", c: "bg-green-900/30 text-green-400 border-green-800/40" };
  };

  const add = () => {
    if (!supplier.trim() || !item.trim()) { toast.error("Enter supplier and item"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      item: item.trim(),
      rate: Math.max(0, parseFloat(rate) || 0),
      uom,
      validFrom,
      validTo,
    }]);
    setSupplier(""); setItem(""); setRate(""); setValidTo("");
    toast.success("Rate contract saved");
  };

  const expiringSoon = rows.filter(r => statusOf(r).label.startsWith("Expiring")).length;
  const expired = rows.filter(r => statusOf(r).label === "Expired").length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Rate Contract / Price List Manager</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Store negotiated rates per supplier-item with validity windows. Get expiry alerts (within 30 days) so you renegotiate before falling back to spot prices.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / SKU *" className={INP} />
          <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate (₹)" className={INP} />
          <select value={uom} onChange={e => setUom(e.target.value)} className={INP}>
            {["unit", "kg", "litre", "metre", "box", "dozen", "tonne"].map(u => <option key={u} value={u}>per {u}</option>)}
          </select>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Valid from</label>
            <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Valid to</label>
            <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add rate contract</button>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Contracts", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Expiring ≤30d", value: String(expiringSoon), color: expiringSoon > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Expired", value: String(expired), color: expired > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Item", "Rate", "Valid from", "Valid to", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const st = statusOf(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-xs">{r.item}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.rate)}<span className="text-[var(--color-muted)]">/{r.uom}</span></td>
                    <td className="px-3 py-2.5 text-xs">{r.validFrom || "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{r.validTo || "—"}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${st.c}`}>{st.label}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Lock annual rate contracts to insulate purchases from spot-price swings. Renew before the validity window closes — expired contracts default to last-quoted or market rate.</p>
    </div>
  );
}

// ── #68 MSME / Udyam Verification Batch (Sec 43B(h)) ─────────────────────────────
type MsmeRow = {
  id: string;
  supplier: string;
  udyam: string;
  category: "micro" | "small" | "medium" | "not-msme" | "pending";
  outstanding: number;
  invoiceDate: string;
};
const UDYAM_RE = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;
function MsmeVerificationBatch() {
  const [rows, setRows] = useFeatureState<MsmeRow[]>("supplier-msme-batch", []);
  const [supplier, setSupplier] = useState("");
  const [udyam, setUdyam] = useState("");
  const [category, setCategory] = useState<MsmeRow["category"]>("pending");
  const [outstanding, setOutstanding] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const fc = formatCurrency;
  const today = new Date();

  // 43B(h): payment to micro/small enterprises must clear within 45 days (with written
  // agreement) else 15 days; disallowance if unpaid at year-end.
  const daysOutstandingOf = (r: MsmeRow) => Math.floor((today.getTime() - new Date(r.invoiceDate).getTime()) / 86400000);
  const isMsmeProtected = (r: MsmeRow) => r.category === "micro" || r.category === "small";
  const atRiskOf = (r: MsmeRow) => isMsmeProtected(r) && r.outstanding > 0 && daysOutstandingOf(r) > 45;

  const validUdyam = (u: string) => UDYAM_RE.test(u.trim().toUpperCase());

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    const u = udyam.trim().toUpperCase();
    if (u && !validUdyam(u)) { toast.error("Udyam format: UDYAM-XX-00-0000000"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      udyam: u,
      category: u && category === "pending" ? "micro" : category,
      outstanding: Math.max(0, parseFloat(outstanding) || 0),
      invoiceDate,
    }]);
    setSupplier(""); setUdyam(""); setOutstanding(""); setCategory("pending");
    toast.success("Supplier added to batch");
  };

  const verifyAll = () => {
    setRows(prev => prev.map(r => r.category === "pending"
      ? { ...r, category: validUdyam(r.udyam) ? "micro" : "not-msme" }
      : r));
    toast.success("Batch verified (Udyam format check)");
  };

  const CATS: Record<MsmeRow["category"], { label: string; c: string }> = {
    micro:      { label: "Micro",    c: "bg-green-900/30 text-green-400 border-green-800/40" },
    small:      { label: "Small",    c: "bg-green-900/30 text-green-400 border-green-800/40" },
    medium:     { label: "Medium",   c: "bg-blue-900/30 text-blue-400 border-blue-800/40" },
    "not-msme": { label: "Not MSME", c: "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]" },
    pending:    { label: "Pending",  c: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" },
  };

  const atRiskAmt = rows.filter(atRiskOf).reduce((s, r) => s + r.outstanding, 0);
  const protectedCount = rows.filter(isMsmeProtected).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><BadgeCheck size={14} className="text-[var(--color-primary)]" /> MSME / Udyam Verification Batch</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Bulk-check supplier MSME status for Sec 43B(h): dues to micro & small enterprises must be paid within 45 days, else the expense is disallowed in the year it stays unpaid.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={udyam} onChange={e => setUdyam(e.target.value)} placeholder="Udyam no. (UDYAM-XX-00-0000000)" className={INP} />
          <select value={category} onChange={e => setCategory(e.target.value as MsmeRow["category"])} className={INP}>
            {(Object.keys(CATS) as MsmeRow["category"][]).map(k => <option key={k} value={k}>{CATS[k].label}</option>)}
          </select>
          <input type="number" value={outstanding} onChange={e => setOutstanding(e.target.value)} placeholder="Outstanding (₹)" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add to batch</button>
        </div>
        <button onClick={verifyAll} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] font-semibold px-4 py-2 rounded-lg hover:bg-[var(--color-bg)]"><Search size={13} /> Verify pending (Udyam format)</button>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Suppliers in batch", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Micro/Small (protected)", value: String(protectedCount), color: "text-blue-400" },
            { label: "43B(h) at-risk (>45d)", value: fc(atRiskAmt), color: atRiskAmt > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Udyam no.", "Category", "Outstanding", "Days o/s", "43B(h)", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const dos = daysOutstandingOf(r);
                const risk = atRiskOf(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-[var(--color-muted)]">{r.udyam || "—"}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${CATS[r.category].c}`}>{CATS[r.category].label}</span></td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.outstanding > 0 ? fc(r.outstanding) : "—"}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${risk ? "text-red-400 font-semibold" : ""}`}>{dos}d</td>
                    <td className="px-3 py-2.5 text-xs">{risk ? <span className="text-red-400 font-semibold">Disallowed ⚠</span> : isMsmeProtected(r) ? <span className="text-green-400">Within limit</span> : <span className="text-[var(--color-muted)]">N/A</span>}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Format check only — confirm live status on the Udyam portal. The 45-day limit applies where there is a written agreement (15 days otherwise). Sums unpaid to micro/small suppliers at FY-end are disallowed u/s 43B(h) and added back to income. Verify with your CA.</p>
    </div>
  );
}

// ── #69 Payment-Terms Optimizer (discount yield vs cost of capital) ──────────────
type TermRow = {
  id: string;
  supplier: string;
  invoiceAmount: number;
  discountPct: number;   // early-pay discount %
  discountDays: number;  // pay within this many days to get discount
  netDays: number;       // otherwise due in this many days
};
function PaymentTermsOptimizer() {
  const [rows, setRows] = useFeatureState<TermRow[]>("sup-terms-optimizer", []);
  const [coc, setCoc] = useFeatureState<number>("sup-terms-coc", 14); // annual cost of capital %
  const [supplier, setSupplier] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [discountDays, setDiscountDays] = useState("10");
  const [netDays, setNetDays] = useState("45");

  // Annualised yield of taking discount = discount/(100-discount) × 365/(net-discount days)
  const annualYieldOf = (r: TermRow) => {
    const span = Math.max(1, r.netDays - r.discountDays);
    return (r.discountPct / Math.max(0.01, 100 - r.discountPct)) * (365 / span) * 100;
  };
  const savingOf = (r: TermRow) => r.invoiceAmount * (r.discountPct / 100);

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      invoiceAmount: Math.max(0, parseFloat(invoiceAmount) || 0),
      discountPct: Math.max(0, parseFloat(discountPct) || 0),
      discountDays: Math.max(0, parseFloat(discountDays) || 0),
      netDays: Math.max(1, parseFloat(netDays) || 30),
    }]);
    setSupplier(""); setInvoiceAmount(""); setDiscountPct("");
    toast.success("Term added");
  };

  const worthTaking = rows.filter(r => annualYieldOf(r) >= coc);
  const totalSaving = worthTaking.reduce((s, r) => s + savingOf(r), 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Payment-Terms Optimizer</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Decide whether an early-pay discount beats your cost of capital. Annualised discount yield = d/(100−d) × 365/(net−disc days). Take it when the yield exceeds your borrowing rate.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input type="number" value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} placeholder="Invoice amount (₹)" className={INP} />
          <input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="Discount %" className={INP} />
          <input type="number" value={discountDays} onChange={e => setDiscountDays(e.target.value)} placeholder="Pay within (days)" className={INP} />
          <input type="number" value={netDays} onChange={e => setNetDays(e.target.value)} placeholder="Net due (days)" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add term</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)]">Your cost of capital (annual %)</label>
          <input type="number" value={coc} onChange={e => setCoc(Math.max(0, parseFloat(e.target.value) || 0))} className={`${INP} w-24`} />
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Terms tracked", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Worth paying early", value: String(worthTaking.length), color: "text-green-400" },
            { label: "Discount captured", value: formatCurrency(totalSaving), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Invoice", "Terms", "Saving", "Ann. yield", "Verdict", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const y = annualYieldOf(r);
                const take = y >= coc;
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(r.invoiceAmount)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.discountPct}/{r.discountDays} net {r.netDays}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-green-400">{formatCurrency(savingOf(r))}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-bold ${take ? "text-green-400" : "text-[var(--color-muted)]"}`}>{y.toFixed(1)}%</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${take ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{take ? "Pay early" : "Pay on net"}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">A 2/10-net-45 term yields ~21% annualised — far above most borrowing costs, so take it. Only skip the discount when your cash is genuinely tighter than the implied yield.</p>
    </div>
  );
}

// ── #70 Supplier Price-Trend Tracker ─────────────────────────────────────────────
type PriceQuote = { id: string; supplier: string; item: string; price: number; date: string };
function PriceTrendTracker() {
  const [rows, setRows] = useFeatureState<PriceQuote[]>("sup-price-trend", []);
  const [supplier, setSupplier] = useState("");
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    if (!supplier.trim() || !item.trim()) { toast.error("Enter supplier and item"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      item: item.trim(),
      price: Math.max(0, parseFloat(price) || 0),
      date,
    }]);
    setSupplier(""); setPrice("");
    toast.success("Quote logged");
  };

  // Group by supplier+item, sort by date, compute trend vs first quote
  const series = useMemo(() => {
    const map = new Map<string, PriceQuote[]>();
    for (const r of rows) {
      const k = `${r.supplier}␟${r.item}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].map(([k, qs]) => {
      const sorted = [...qs].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0].price;
      const last = sorted[sorted.length - 1].price;
      const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
      const [supplier, item] = k.split("␟");
      return { k, supplier, item, first, last, changePct, count: sorted.length, latest: sorted[sorted.length - 1].date };
    }).sort((a, b) => b.changePct - a.changePct);
  }, [rows]);

  const rising = series.filter(s => s.changePct > 0).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><LineChart size={14} className="text-[var(--color-primary)]" /> Supplier Price-Trend Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log each quote per supplier-item over time. See which prices are creeping up so you can renegotiate, switch, or pre-buy before the next hike.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / SKU *" className={INP} />
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Quoted price (₹)" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Quote date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Log quote</button>
        </div>
      </div>

      {series.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Tracked lines", value: String(series.length), color: "text-[var(--color-primary)]" },
            { label: "Prices rising", value: String(rising), color: rising > 0 ? "text-red-400" : "text-green-400" },
            { label: "Quotes logged", value: String(rows.length), color: "text-[var(--color-muted)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Item", "First", "Latest", "Change", "Quotes", "Last date"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {series.map(s => (
                <tr key={s.k} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{s.supplier}</td>
                  <td className="px-3 py-2.5 text-xs">{s.item}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{formatCurrency(s.first)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(s.last)}</td>
                  <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${s.changePct > 0 ? "text-red-400" : s.changePct < 0 ? "text-green-400" : "text-[var(--color-muted)]"}`}>{s.changePct > 0 ? "+" : ""}{s.changePct.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{s.count}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{s.latest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Trend compares the latest quote to the first logged for each supplier-item. Log at least 3 quotes for a meaningful signal; a sustained rise is your cue to RFQ alternates.</p>
    </div>
  );
}

// ── #71 Lead-Time Variance Analyzer ──────────────────────────────────────────────
type LeadRow = { id: string; supplier: string; promisedDays: number; actualDays: number; po: string };
function LeadTimeVarianceAnalyzer() {
  const [rows, setRows] = useFeatureState<LeadRow[]>("sup-leadtime-variance", []);
  const [supplier, setSupplier] = useState("");
  const [po, setPo] = useState("");
  const [promisedDays, setPromisedDays] = useState("");
  const [actualDays, setActualDays] = useState("");

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      po: po.trim(),
      promisedDays: Math.max(0, parseFloat(promisedDays) || 0),
      actualDays: Math.max(0, parseFloat(actualDays) || 0),
    }]);
    setSupplier(""); setPo(""); setPromisedDays(""); setActualDays("");
    toast.success("Delivery logged");
  };

  // Per-supplier: mean slip, std dev (variability), reliability = on-time %
  const stats = useMemo(() => {
    const map = new Map<string, LeadRow[]>();
    for (const r of rows) {
      if (!map.has(r.supplier)) map.set(r.supplier, []);
      map.get(r.supplier)!.push(r);
    }
    return [...map.entries()].map(([supplier, rs]) => {
      const slips = rs.map(r => r.actualDays - r.promisedDays);
      const mean = slips.reduce((s, v) => s + v, 0) / slips.length;
      const variance = slips.reduce((s, v) => s + (v - mean) ** 2, 0) / slips.length;
      const std = Math.sqrt(variance);
      const onTime = rs.filter(r => r.actualDays <= r.promisedDays).length;
      const onTimePct = Math.round((onTime / rs.length) * 100);
      return { supplier, n: rs.length, meanSlip: mean, std, onTimePct };
    }).sort((a, b) => b.std - a.std);
  }, [rows]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> Lead-Time Variance Analyzer</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log promised vs actual delivery days per PO. The analyzer shows each supplier's average slip and variability (σ) — high variance means unreliable lead times and bigger safety stock.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={po} onChange={e => setPo(e.target.value)} placeholder="PO ref (optional)" className={INP} />
          <input type="number" value={promisedDays} onChange={e => setPromisedDays(e.target.value)} placeholder="Promised days" className={INP} />
          <input type="number" value={actualDays} onChange={e => setActualDays(e.target.value)} placeholder="Actual days" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Log delivery</button>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Deliveries", "Avg slip", "Variability σ", "On-time %", "Rating"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {stats.map(s => {
                const reliable = s.std <= 2 && s.onTimePct >= 80;
                const shaky = s.std > 5 || s.onTimePct < 50;
                const rating = reliable ? { t: "Reliable", c: "text-green-400" } : shaky ? { t: "Erratic", c: "text-red-400" } : { t: "Watch", c: "text-yellow-400" };
                return (
                  <tr key={s.supplier} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{s.supplier}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{s.n}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${s.meanSlip > 0 ? "text-red-400" : "text-green-400"}`}>{s.meanSlip > 0 ? "+" : ""}{s.meanSlip.toFixed(1)}d</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">±{s.std.toFixed(1)}d</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{s.onTimePct}%</td>
                    <td className={`px-3 py-2.5 text-xs font-semibold ${rating.c}`}>{rating.t}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Variability (σ) drives safety stock more than average lead time. A supplier averaging 10d ±1 is far easier to plan than one averaging 8d ±6. Push erratic vendors to commit firm windows.</p>
    </div>
  );
}

// ── #72 Alternate-Supplier Shortlist ─────────────────────────────────────────────
type AltRow = { id: string; item: string; supplier: string; price: number; leadDays: number; minOrderQty: number; approved: boolean };
function AltSupplierShortlist() {
  const [rows, setRows] = useFeatureState<AltRow[]>("sup-alt-shortlist", []);
  const [item, setItem] = useState("");
  const [supplier, setSupplier] = useState("");
  const [price, setPrice] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [minOrderQty, setMinOrderQty] = useState("");

  const add = () => {
    if (!item.trim() || !supplier.trim()) { toast.error("Enter item and supplier"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      item: item.trim(),
      supplier: supplier.trim(),
      price: Math.max(0, parseFloat(price) || 0),
      leadDays: Math.max(0, parseFloat(leadDays) || 0),
      minOrderQty: Math.max(0, parseFloat(minOrderQty) || 0),
      approved: false,
    }]);
    setSupplier(""); setPrice(""); setLeadDays(""); setMinOrderQty("");
    toast.success("Alternate added");
  };

  // Group by item; cheapest per item flagged "best price", fastest "fastest"
  const groups = useMemo(() => {
    const map = new Map<string, AltRow[]>();
    for (const r of rows) {
      if (!map.has(r.item)) map.set(r.item, []);
      map.get(r.item)!.push(r);
    }
    return [...map.entries()].map(([item, rs]) => {
      const withPrice = rs.filter(r => r.price > 0);
      const minPrice = withPrice.length ? Math.min(...withPrice.map(r => r.price)) : 0;
      const minLead = Math.min(...rs.map(r => r.leadDays));
      return { item, rows: [...rs].sort((a, b) => (a.price || Infinity) - (b.price || Infinity)), minPrice, minLead };
    });
  }, [rows]);

  const singleSourced = groups.filter(g => g.rows.length < 2).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><GitCompare size={14} className="text-[var(--color-primary)]" /> Alternate-Supplier Shortlist</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Maintain a backup bench per item so a single supplier never holds you hostage. Cheapest and fastest options are flagged automatically — qualify a second source for every critical SKU.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / SKU *" className={INP} />
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Price (₹)" className={INP} />
          <input type="number" value={leadDays} onChange={e => setLeadDays(e.target.value)} placeholder="Lead time (days)" className={INP} />
          <input type="number" value={minOrderQty} onChange={e => setMinOrderQty(e.target.value)} placeholder="Min order qty" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add option</button>
        </div>
      </div>

      {groups.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Items with options", value: String(groups.length), color: "text-[var(--color-primary)]" },
            { label: "Single-sourced (risk)", value: String(singleSourced), color: singleSourced > 0 ? "text-red-400" : "text-green-400" },
            { label: "Total options", value: String(rows.length), color: "text-[var(--color-muted)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        {groups.map(g => (
          <div key={g.item} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-semibold">{g.item}</p>
              {g.rows.length < 2 && <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-red-900/30 text-red-400 border-red-800/40">Single source</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Price", "Lead", "MOQ", "Flag", ""].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {g.rows.map(r => {
                    const best = r.price > 0 && r.price === g.minPrice;
                    const fast = r.leadDays === g.minLead;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-3 py-2 text-xs font-medium">{r.supplier}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{r.price > 0 ? formatCurrency(r.price) : "—"}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{r.leadDays}d</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-[var(--color-muted)]">{r.minOrderQty || "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className="flex gap-1">
                            {best && <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-green-900/30 text-green-400 border-green-800/40">Best ₹</span>}
                            {fast && <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-blue-900/30 text-blue-400 border-blue-800/40">Fastest</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Single-sourced items are a supply risk — one disruption stops your line. Qualify and periodically trial-order from a backup so you can switch fast when price, quality, or availability slips.</p>
    </div>
  );
}

// ── #73 Supplier Concentration Risk (Pareto) ─────────────────────────────────────
type SpendRow = { id: string; supplier: string; annualSpend: number };
function ConcentrationRisk() {
  const [rows, setRows] = useFeatureState<SpendRow[]>("sup-concentration", []);
  const [supplier, setSupplier] = useState("");
  const [annualSpend, setAnnualSpend] = useState("");

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), supplier: supplier.trim(), annualSpend: Math.max(0, parseFloat(annualSpend) || 0) }]);
    setSupplier(""); setAnnualSpend("");
    toast.success("Supplier spend added");
  };

  const total = rows.reduce((s, r) => s + r.annualSpend, 0);
  const ranked = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.annualSpend - a.annualSpend);
    let cum = 0;
    return sorted.map(r => {
      const share = total > 0 ? (r.annualSpend / total) * 100 : 0;
      cum += share;
      return { ...r, share, cum };
    });
  }, [rows, total]);

  const top = ranked[0];
  const topShare = top ? top.share : 0;
  // HHI = sum of squared market shares (0-10000); >2500 = highly concentrated
  const hhi = Math.round(ranked.reduce((s, r) => s + r.share ** 2, 0));
  const concentrated = topShare > 30 || hhi > 2500;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Supplier Concentration Risk</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Enter annual spend per supplier to see a Pareto view and HHI. If one vendor takes too big a share, a price hike or disruption hits hard — diversify before it bites.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input type="number" value={annualSpend} onChange={e => setAnnualSpend(e.target.value)} placeholder="Annual spend (₹)" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add supplier</button>
        </div>
      </div>

      {ranked.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total spend", value: formatCurrency(total), color: "text-[var(--color-primary)]" },
            { label: "Top-vendor share", value: `${topShare.toFixed(0)}%`, color: topShare > 30 ? "text-red-400" : "text-green-400" },
            { label: "HHI", value: String(hhi), color: hhi > 2500 ? "text-red-400" : hhi > 1500 ? "text-yellow-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        {concentrated && (
          <div className="bg-red-900/15 border border-red-800/40 rounded-lg p-3 text-xs text-red-400">
            High concentration — your top supplier carries {topShare.toFixed(0)}% of spend. Qualify alternates (see Alt Suppliers) and split orders to cut dependency.
          </div>
        )}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["#", "Supplier", "Annual spend", "Share", "Cumulative", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ranked.map((r, i) => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(r.annualSpend)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, r.share)}%` }} /></div>
                      <span>{r.share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.cum.toFixed(0)}%</td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">HHI sums squared shares: under 1500 is diversified, 1500–2500 moderate, above 2500 highly concentrated. The Pareto cumulative column shows how few vendors make up the bulk of spend.</p>
    </div>
  );
}

// ── #74 GRN / Three-Way Match Register ───────────────────────────────────────────
type MatchRow = {
  id: string;
  po: string;
  supplier: string;
  poQty: number; grnQty: number; invQty: number;
  poRate: number; invRate: number;
  rejectedQty: number;
};
function GrnThreeWayMatch() {
  const [rows, setRows] = useFeatureState<MatchRow[]>("sup-grn-match", []);
  const [tolPct, setTolPct] = useFeatureState<number>("sup-grn-tolerance", 2);
  const [po, setPo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [poQty, setPoQty] = useState(""); const [grnQty, setGrnQty] = useState(""); const [invQty, setInvQty] = useState("");
  const [poRate, setPoRate] = useState(""); const [invRate, setInvRate] = useState(""); const [rejectedQty, setRejectedQty] = useState("");

  const add = () => {
    if (!po.trim() || !supplier.trim()) { toast.error("Enter PO and supplier"); return; }
    const n = (v: string) => Math.max(0, parseFloat(v) || 0);
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), po: po.trim(), supplier: supplier.trim(),
      poQty: n(poQty), grnQty: n(grnQty), invQty: n(invQty),
      poRate: n(poRate), invRate: n(invRate), rejectedQty: n(rejectedQty),
    }]);
    setPo(""); setSupplier(""); setPoQty(""); setGrnQty(""); setInvQty(""); setPoRate(""); setInvRate(""); setRejectedQty("");
    toast.success("Receipt logged");
  };

  // Match passes if invoice qty ≤ GRN qty and rate within tolerance of PO rate
  const within = (a: number, b: number) => b === 0 ? a === 0 : Math.abs(a - b) / b * 100 <= tolPct;
  const evalRow = (r: MatchRow) => {
    const qtyOk = r.invQty <= r.grnQty + 0.0001;
    const rateOk = within(r.invRate, r.poRate);
    const accepted = Math.max(0, r.grnQty - r.rejectedQty);
    const rejectRate = r.grnQty > 0 ? (r.rejectedQty / r.grnQty) * 100 : 0;
    return { qtyOk, rateOk, accepted, rejectRate, clean: qtyOk && rateOk };
  };

  const clean = rows.filter(r => evalRow(r).clean).length;
  const overbilled = rows.reduce((s, r) => { const e = evalRow(r); return s + (e.rateOk ? 0 : Math.max(0, (r.invRate - r.poRate)) * r.invQty); }, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> GRN / Three-Way Match Register</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Match PO, goods-receipt, and invoice on quantity and rate before paying. Flags over-billing and quality rejects so you never pay for goods you didn't receive or accept.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <input value={po} onChange={e => setPo(e.target.value)} placeholder="PO ref *" className={INP} />
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input type="number" value={poQty} onChange={e => setPoQty(e.target.value)} placeholder="PO qty" className={INP} />
          <input type="number" value={grnQty} onChange={e => setGrnQty(e.target.value)} placeholder="GRN qty" className={INP} />
          <input type="number" value={invQty} onChange={e => setInvQty(e.target.value)} placeholder="Invoice qty" className={INP} />
          <input type="number" value={poRate} onChange={e => setPoRate(e.target.value)} placeholder="PO rate (₹)" className={INP} />
          <input type="number" value={invRate} onChange={e => setInvRate(e.target.value)} placeholder="Invoice rate (₹)" className={INP} />
          <input type="number" value={rejectedQty} onChange={e => setRejectedQty(e.target.value)} placeholder="Rejected qty" className={INP} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Log receipt</button>
          <span className="text-xs text-[var(--color-muted)] flex items-center gap-2">Rate tolerance %
            <input type="number" value={tolPct} onChange={e => setTolPct(Math.max(0, parseFloat(e.target.value) || 0))} className={`${INP} w-20`} />
          </span>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Receipts", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Clean matches", value: `${clean}/${rows.length}`, color: clean === rows.length ? "text-green-400" : "text-yellow-400" },
            { label: "Over-billed", value: formatCurrency(overbilled), color: overbilled > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["PO", "Supplier", "PO/GRN/Inv qty", "Reject %", "Qty", "Rate", "Match", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const e = evalRow(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-mono text-[var(--color-muted)]">{r.po}</td>
                    <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.poQty}/{r.grnQty}/{r.invQty}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${e.rejectRate > 5 ? "text-red-400" : ""}`}>{e.rejectRate.toFixed(0)}%</td>
                    <td className="px-3 py-2.5">{e.qtyOk ? <Check size={13} className="text-green-400" /> : <span className="text-red-400 text-xs font-semibold">Over</span>}</td>
                    <td className="px-3 py-2.5">{e.rateOk ? <Check size={13} className="text-green-400" /> : <span className="text-red-400 text-xs font-semibold">Off</span>}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${e.clean ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"}`}>{e.clean ? "Pass" : "Hold"}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Only release "Pass" invoices for payment. "Hold" rows have invoice qty above what was received or a rate outside tolerance — raise a debit note or query the supplier before paying.</p>
    </div>
  );
}

// ── #75 Negotiation Prep Sheet ───────────────────────────────────────────────────
type NegoRow = { id: string; label: string; done: boolean };
function NegotiationPrepSheet() {
  const [supplier, setSupplier] = useFeatureState<string>("sup-nego-supplier", "");
  const [annualSpend, setAnnualSpend] = useFeatureState<string>("sup-nego-spend", "");
  const [currentRate, setCurrentRate] = useFeatureState<string>("sup-nego-current", "");
  const [targetRate, setTargetRate] = useFeatureState<string>("sup-nego-target", "");
  const [walkawayRate, setWalkawayRate] = useFeatureState<string>("sup-nego-walk", "");
  const [items, setItems] = useFeatureState<NegoRow[]>("sup-nego-checklist", [
    { id: "c1", label: "Benchmarked price vs 2+ alternate quotes", done: false },
    { id: "c2", label: "Pulled 12-month spend & volume history", done: false },
    { id: "c3", label: "Listed quality/delivery issues as leverage", done: false },
    { id: "c4", label: "Defined target, walk-away & BATNA", done: false },
    { id: "c5", label: "Prepared volume-commitment or early-pay trade-offs", done: false },
  ]);
  const [newItem, setNewItem] = useState("");

  const spend = parseFloat(annualSpend) || 0;
  const cur = parseFloat(currentRate) || 0;
  const tgt = parseFloat(targetRate) || 0;
  const annualSaving = cur > 0 && tgt > 0 && tgt < cur ? spend * ((cur - tgt) / cur) : 0;

  const toggle = (id: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const addItem = () => {
    if (!newItem.trim()) return;
    setItems(prev => [...prev, { id: crypto.randomUUID(), label: newItem.trim(), done: false }]);
    setNewItem("");
  };
  const doneCount = items.filter(i => i.done).length;
  const ready = doneCount === items.length && items.length > 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Handshake size={14} className="text-[var(--color-primary)]" /> Negotiation Prep Sheet</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Walk into every supplier negotiation prepared. Set your target and walk-away rate, see the annual saving at stake, and tick off the homework before you sit down.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier" className={INP} />
          <input type="number" value={annualSpend} onChange={e => setAnnualSpend(e.target.value)} placeholder="Annual spend (₹)" className={INP} />
          <input type="number" value={currentRate} onChange={e => setCurrentRate(e.target.value)} placeholder="Current rate (₹)" className={INP} />
          <input type="number" value={targetRate} onChange={e => setTargetRate(e.target.value)} placeholder="Target rate (₹)" className={INP} />
          <input type="number" value={walkawayRate} onChange={e => setWalkawayRate(e.target.value)} placeholder="Walk-away rate (₹)" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Target discount", value: cur > 0 && tgt > 0 ? `${(((cur - tgt) / cur) * 100).toFixed(1)}%` : "—", color: "text-[var(--color-primary)]" },
          { label: "Annual saving at target", value: formatCurrency(annualSaving), color: "text-green-400" },
          { label: "Prep complete", value: `${doneCount}/${items.length}`, color: ready ? "text-green-400" : "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">Prep checklist {supplier && `· ${supplier}`}</p>
        <div className="space-y-2">
          {items.map(i => (
            <div key={i.id} className="flex items-center gap-2">
              <button onClick={() => toggle(i.id)} className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${i.done ? "bg-[var(--color-primary)] border-transparent" : "border-[var(--color-border)]"}`}>
                {i.done && <Check size={11} className="text-[var(--color-bg)]" />}
              </button>
              <span className={`text-xs flex-1 ${i.done ? "line-through text-[var(--color-muted)]" : ""}`}>{i.label}</span>
              <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} placeholder="Add a prep point…" className={INP} />
          <button onClick={addItem} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] font-semibold px-3 py-2 rounded-lg hover:bg-[var(--color-bg)] shrink-0"><Plus size={13} /> Add</button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Anchor on benchmarked alternate quotes, lead with your volume and payment reliability, and never reveal your walk-away. The annual-saving figure is your real prize — keep it front of mind.</p>
    </div>
  );
}

// ── #76 Supplier Payment-Priority Planner ────────────────────────────────────────
type PayRow = {
  id: string;
  supplier: string;
  amount: number;
  dueDate: string;
  isMsme: boolean;
  discountPct: number;   // early-pay discount % still on offer
};
function PaymentPriorityPlanner() {
  const [rows, setRows] = useFeatureState<PayRow[]>("sup-pay-priority", []);
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [isMsme, setIsMsme] = useState(false);
  const [discountPct, setDiscountPct] = useState("");
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const daysToDue = (r: PayRow) => Math.round((new Date(r.dueDate).getTime() - today.getTime()) / 86400000);
  // Priority score: overdue & MSME breach weigh heaviest, then discount value, then near-due.
  const scoreOf = (r: PayRow) => {
    const dtd = daysToDue(r);
    let s = 0;
    if (dtd < 0) s += 60 + Math.min(40, -dtd);           // overdue ramps up
    else if (dtd <= 7) s += 35 - dtd * 2;                // due this week
    else s += Math.max(0, 20 - dtd / 5);
    if (r.isMsme && dtd <= 5) s += 50;                   // 43B(h) clock
    if (r.discountPct > 0 && dtd > 0) s += r.discountPct * 6; // capturable discount
    return Math.round(s);
  };

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      amount: Math.max(0, parseFloat(amount) || 0),
      dueDate,
      isMsme,
      discountPct: Math.max(0, parseFloat(discountPct) || 0),
    }]);
    setSupplier(""); setAmount(""); setDiscountPct(""); setIsMsme(false);
    toast.success("Payable added to plan");
  };

  const ranked = useMemo(() => [...rows].map(r => ({ ...r, score: scoreOf(r), dtd: daysToDue(r) })).sort((a, b) => b.score - a.score),
    [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const overdue = ranked.filter(r => r.dtd < 0).reduce((s, r) => s + r.amount, 0);
  const msmeUrgent = ranked.filter(r => r.isMsme && r.dtd <= 5).length;
  const totalDue = ranked.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ListOrdered size={14} className="text-[var(--color-primary)]" /> Payment-Priority Planner</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Rank open payables by urgency so a tight cash week pays the right vendors first. Score weights overdue dues, the MSME 43B(h) clock, and capturable early-pay discounts.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount due (₹)" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INP} />
          </div>
          <input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="Early-pay discount %" className={INP} />
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <input type="checkbox" checked={isMsme} onChange={e => setIsMsme(e.target.checked)} className="accent-[var(--color-primary)]" /> MSME (micro/small) vendor
          </label>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add payable</button>
        </div>
      </div>

      {ranked.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total due", value: formatCurrency(totalDue), color: "text-[var(--color-primary)]" },
            { label: "Overdue amount", value: formatCurrency(overdue), color: overdue > 0 ? "text-red-400" : "text-green-400" },
            { label: "MSME urgent (≤5d)", value: String(msmeUrgent), color: msmeUrgent > 0 ? "text-yellow-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["#", "Supplier", "Amount", "Due in", "Flags", "Priority", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ranked.map((r, i) => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className={`px-3 py-2.5 text-xs tabular-nums ${r.dtd < 0 ? "text-red-400 font-semibold" : r.dtd <= 5 ? "text-yellow-400" : ""}`}>{r.dtd < 0 ? `${-r.dtd}d overdue` : `${r.dtd}d`}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className="flex gap-1 flex-wrap">
                      {r.isMsme && <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-blue-900/30 text-blue-400 border-blue-800/40">MSME</span>}
                      {r.discountPct > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-green-900/30 text-green-400 border-green-800/40">{r.discountPct}% disc</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold">{r.score}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Pay top-down when cash is short. Overdue and near-deadline MSME dues rank first to avoid 43B(h) disallowance; capturable discounts then float useful early-pays up the list.</p>
    </div>
  );
}

// ── #77 Supplier-wise GST-2B Match Status ────────────────────────────────────────
type Gst2bRow = {
  id: string;
  supplier: string;
  gstin: string;
  bookItc: number;       // ITC as per your purchase books
  gstr2bItc: number;     // ITC reflected in GSTR-2B
};
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;
function Gst2bMatchStatus() {
  const [rows, setRows] = useFeatureState<Gst2bRow[]>("sup-gst2b-match", []);
  const [tol, setTol] = useFeatureState<number>("sup-gst2b-tolerance", 1); // ₹ rounding tolerance
  const [supplier, setSupplier] = useState("");
  const [gstin, setGstin] = useState("");
  const [bookItc, setBookItc] = useState("");
  const [gstr2bItc, setGstr2bItc] = useState("");

  const statusOf = (r: Gst2bRow): { label: string; c: string } => {
    const diff = r.bookItc - r.gstr2bItc;
    if (Math.abs(diff) <= tol) return { label: "Matched", c: "bg-green-900/30 text-green-400 border-green-800/40" };
    if (diff > tol) return { label: "Not in 2B", c: "bg-red-900/30 text-red-400 border-red-800/40" };   // book > 2B → vendor didn't file
    return { label: "Excess in 2B", c: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" };       // 2B > book → unbooked invoice
  };

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    const g = gstin.trim().toUpperCase();
    if (g && !GSTIN_RE.test(g)) { toast.error("Invalid GSTIN format"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      gstin: g,
      bookItc: Math.max(0, parseFloat(bookItc) || 0),
      gstr2bItc: Math.max(0, parseFloat(gstr2bItc) || 0),
    }]);
    setSupplier(""); setGstin(""); setBookItc(""); setGstr2bItc("");
    toast.success("Supplier ITC logged");
  };

  const atRisk = rows.filter(r => statusOf(r).label === "Not in 2B").reduce((s, r) => s + (r.bookItc - r.gstr2bItc), 0);
  const matched = rows.filter(r => statusOf(r).label === "Matched").length;
  const bookTotal = rows.reduce((s, r) => s + r.bookItc, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileCheck size={14} className="text-[var(--color-primary)]" /> Supplier-wise GST-2B Match Status</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Reconcile ITC per your books against each supplier's GSTR-2B. Where books exceed 2B, the vendor hasn't filed — that ITC is blocked, so withhold payment until they upload.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="GSTIN (optional)" className={INP} />
          <input type="number" value={bookItc} onChange={e => setBookItc(e.target.value)} placeholder="ITC in books (₹)" className={INP} />
          <input type="number" value={gstr2bItc} onChange={e => setGstr2bItc(e.target.value)} placeholder="ITC in GSTR-2B (₹)" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add supplier</button>
        </div>
        <span className="text-xs text-[var(--color-muted)] flex items-center gap-2">Match tolerance (₹)
          <input type="number" value={tol} onChange={e => setTol(Math.max(0, parseFloat(e.target.value) || 0))} className={`${INP} w-24`} />
        </span>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total book ITC", value: formatCurrency(bookTotal), color: "text-[var(--color-primary)]" },
            { label: "Matched suppliers", value: `${matched}/${rows.length}`, color: matched === rows.length ? "text-green-400" : "text-yellow-400" },
            { label: "ITC at risk (not in 2B)", value: formatCurrency(atRisk), color: atRisk > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "GSTIN", "Books ITC", "2B ITC", "Diff", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const st = statusOf(r);
                const diff = r.bookItc - r.gstr2bItc;
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-[var(--color-muted)]">{r.gstin || "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(r.bookItc)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(r.gstr2bItc)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${Math.abs(diff) > tol ? "text-red-400 font-semibold" : "text-[var(--color-muted)]"}`}>{diff > 0 ? "+" : ""}{formatCurrency(diff)}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${st.c}`}>{st.label}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Since the 2021 ITC rules, you can only claim credit that appears in GSTR-2B. "Not in 2B" means the supplier hasn't filed GSTR-1 — chase them or hold the tax portion. Confirm live figures on the GST portal.</p>
    </div>
  );
}

// ── #78 Quality-Rejection (PPM) Tracker ──────────────────────────────────────────
type PpmRow = { id: string; supplier: string; received: number; rejected: number; period: string };
function QualityPpmTracker() {
  const [rows, setRows] = useFeatureState<PpmRow[]>("sup-quality-ppm", []);
  const [targetPpm, setTargetPpm] = useFeatureState<number>("sup-quality-target-ppm", 5000);
  const [supplier, setSupplier] = useState("");
  const [received, setReceived] = useState("");
  const [rejected, setRejected] = useState("");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      received: Math.max(0, parseFloat(received) || 0),
      rejected: Math.max(0, parseFloat(rejected) || 0),
      period,
    }]);
    setSupplier(""); setReceived(""); setRejected("");
    toast.success("Quality record logged");
  };

  // Aggregate per supplier: PPM = rejected / received × 1,000,000
  const stats = useMemo(() => {
    const map = new Map<string, { recv: number; rej: number; n: number }>();
    for (const r of rows) {
      const cur = map.get(r.supplier) || { recv: 0, rej: 0, n: 0 };
      cur.recv += r.received; cur.rej += r.rejected; cur.n += 1;
      map.set(r.supplier, cur);
    }
    return [...map.entries()].map(([supplier, v]) => ({
      supplier,
      recv: v.recv,
      rej: v.rej,
      lots: v.n,
      ppm: v.recv > 0 ? Math.round((v.rej / v.recv) * 1_000_000) : 0,
    })).sort((a, b) => b.ppm - a.ppm);
  }, [rows]);

  const failing = stats.filter(s => s.ppm > targetPpm).length;
  const worst = stats.length ? stats[0] : null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Microscope size={14} className="text-[var(--color-primary)]" /> Quality-Rejection (PPM) Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log received and rejected units per supplier to track defects per million (PPM). Set a target threshold to flag vendors whose quality is slipping below your acceptance bar.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input type="number" value={received} onChange={e => setReceived(e.target.value)} placeholder="Units received" className={INP} />
          <input type="number" value={rejected} onChange={e => setRejected(e.target.value)} placeholder="Units rejected" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Period</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Log lot</button>
        </div>
        <span className="text-xs text-[var(--color-muted)] flex items-center gap-2">Target PPM (max acceptable)
          <input type="number" value={targetPpm} onChange={e => setTargetPpm(Math.max(0, parseFloat(e.target.value) || 0))} className={`${INP} w-28`} />
        </span>
      </div>

      {stats.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Suppliers tracked", value: String(stats.length), color: "text-[var(--color-primary)]" },
            { label: "Above target PPM", value: String(failing), color: failing > 0 ? "text-red-400" : "text-green-400" },
            { label: "Worst PPM", value: worst ? `${worst.ppm.toLocaleString("en-IN")}` : "—", color: worst && worst.ppm > targetPpm ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Lots", "Received", "Rejected", "Reject %", "PPM", "Status"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {stats.map(s => {
                const fail = s.ppm > targetPpm;
                const rejPct = s.recv > 0 ? (s.rej / s.recv) * 100 : 0;
                return (
                  <tr key={s.supplier} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{s.supplier}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{s.lots}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{s.recv.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{s.rej.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{rejPct.toFixed(2)}%</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-bold ${fail ? "text-red-400" : "text-green-400"}`}>{s.ppm.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${fail ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{fail ? "Above target" : "Within target"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">PPM = rejected ÷ received × 1,000,000. World-class manufacturing aims for under ~500 PPM; set a target that fits your sector. Persistent high-PPM vendors warrant a corrective-action request or a second source.</p>
    </div>
  );
}

// ── #79 Supplier Credit-Period Utilization ───────────────────────────────────────
type CreditRow = { id: string; supplier: string; grantedDays: number; avgPayDays: number; monthlyPurchase: number };
function CreditPeriodUtilization() {
  const [rows, setRows] = useFeatureState<CreditRow[]>("sup-credit-util", []);
  const [supplier, setSupplier] = useState("");
  const [grantedDays, setGrantedDays] = useState("");
  const [avgPayDays, setAvgPayDays] = useState("");
  const [monthlyPurchase, setMonthlyPurchase] = useState("");

  const add = () => {
    if (!supplier.trim()) { toast.error("Enter supplier name"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      grantedDays: Math.max(0, parseFloat(grantedDays) || 0),
      avgPayDays: Math.max(0, parseFloat(avgPayDays) || 0),
      monthlyPurchase: Math.max(0, parseFloat(monthlyPurchase) || 0),
    }]);
    setSupplier(""); setGrantedDays(""); setAvgPayDays(""); setMonthlyPurchase("");
    toast.success("Supplier credit logged");
  };

  // Utilization = avg actual pay days / granted credit days. <100% = paying early (leaving free credit unused).
  const utilOf = (r: CreditRow) => r.grantedDays > 0 ? Math.round((r.avgPayDays / r.grantedDays) * 100) : 0;
  // Unused free credit days × daily purchase ≈ working capital you could still hold.
  const unusedFloat = (r: CreditRow) => {
    const unusedDays = Math.max(0, r.grantedDays - r.avgPayDays);
    return (r.monthlyPurchase / 30) * unusedDays;
  };

  const ranked = useMemo(() => [...rows].sort((a, b) => unusedFloat(b) - unusedFloat(a)), [rows]);
  const totalUnused = rows.reduce((s, r) => s + unusedFloat(r), 0);
  const breaching = rows.filter(r => r.grantedDays > 0 && r.avgPayDays > r.grantedDays).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Supplier Credit-Period Utilization</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">See how much of each supplier's granted credit you actually use. Paying well inside the window leaves free working capital on the table; paying past it risks relationships and late fees.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input type="number" value={grantedDays} onChange={e => setGrantedDays(e.target.value)} placeholder="Granted credit (days)" className={INP} />
          <input type="number" value={avgPayDays} onChange={e => setAvgPayDays(e.target.value)} placeholder="Avg actual pay (days)" className={INP} />
          <input type="number" value={monthlyPurchase} onChange={e => setMonthlyPurchase(e.target.value)} placeholder="Monthly purchase (₹)" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add supplier</button>
        </div>
      </div>

      {ranked.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Suppliers", value: String(ranked.length), color: "text-[var(--color-primary)]" },
            { label: "Unused free credit", value: formatCurrency(totalUnused), color: "text-green-400" },
            { label: "Over-running terms", value: String(breaching), color: breaching > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[660px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Granted", "Avg pay", "Utilization", "Unused float", "Verdict", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ranked.map(r => {
                const util = utilOf(r);
                const over = r.grantedDays > 0 && r.avgPayDays > r.grantedDays;
                const verdict = over ? { t: "Over terms", c: "text-red-400" } : util < 70 ? { t: "Paying early", c: "text-yellow-400" } : { t: "Well-used", c: "text-green-400" };
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.grantedDays}d</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.avgPayDays}d</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className={`h-full ${over ? "bg-red-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${Math.min(100, util)}%` }} /></div>
                        <span>{util}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-green-400">{formatCurrency(unusedFloat(r))}</td>
                    <td className={`px-3 py-2.5 text-xs font-semibold ${verdict.c}`}>{verdict.t}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Free supplier credit is the cheapest working capital you have — use the full granted window unless an early-pay discount beats your cost of capital. Don't run past terms with MSME vendors (43B(h)).</p>
    </div>
  );
}

// ── #80 Landed-Cost Compare across Suppliers ─────────────────────────────────────
type LandedRow = {
  id: string;
  supplier: string;
  item: string;
  qty: number;
  unitPrice: number;
  freight: number;     // total freight for the lot
  dutyPct: number;     // customs/duty % on goods value
  insurance: number;   // total insurance for the lot
};
function LandedCostCompare() {
  const [rows, setRows] = useFeatureState<LandedRow[]>("sup-landed-cost", []);
  const [supplier, setSupplier] = useState("");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [freight, setFreight] = useState("");
  const [dutyPct, setDutyPct] = useState("");
  const [insurance, setInsurance] = useState("");

  const add = () => {
    if (!supplier.trim() || !item.trim()) { toast.error("Enter supplier and item"); return; }
    const n = (v: string) => Math.max(0, parseFloat(v) || 0);
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      item: item.trim(),
      qty: Math.max(1, n(qty)),
      unitPrice: n(unitPrice),
      freight: n(freight),
      dutyPct: n(dutyPct),
      insurance: n(insurance),
    }]);
    setSupplier(""); setUnitPrice(""); setFreight(""); setDutyPct(""); setInsurance("");
    toast.success("Quote added");
  };

  // Landed unit cost = (goods + duty + freight + insurance) / qty
  const goodsOf = (r: LandedRow) => r.qty * r.unitPrice;
  const dutyOf = (r: LandedRow) => goodsOf(r) * (r.dutyPct / 100);
  const landedTotalOf = (r: LandedRow) => goodsOf(r) + dutyOf(r) + r.freight + r.insurance;
  const landedUnitOf = (r: LandedRow) => r.qty > 0 ? landedTotalOf(r) / r.qty : 0;

  // Group by item; flag cheapest landed unit cost. Show premium vs naive lowest sticker price.
  const groups = useMemo(() => {
    const map = new Map<string, LandedRow[]>();
    for (const r of rows) {
      if (!map.has(r.item)) map.set(r.item, []);
      map.get(r.item)!.push(r);
    }
    return [...map.entries()].map(([item, rs]) => {
      const minLanded = Math.min(...rs.map(landedUnitOf));
      const minSticker = Math.min(...rs.map(r => r.unitPrice));
      const stickerWinner = rs.find(r => r.unitPrice === minSticker);
      const flipped = stickerWinner ? landedUnitOf(stickerWinner) !== minLanded : false;
      return { item, rows: [...rs].sort((a, b) => landedUnitOf(a) - landedUnitOf(b)), minLanded, flipped };
    });
  }, [rows]);

  const flips = groups.filter(g => g.flipped).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Truck size={14} className="text-[var(--color-primary)]" /> Landed-Cost Compare across Suppliers</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Compare suppliers on true delivered cost, not sticker price. Add freight, duty, and insurance to find the real cheapest — the lowest quote often loses once logistics are loaded in.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / SKU *" className={INP} />
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="Quantity" className={INP} />
          <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="Unit price (₹)" className={INP} />
          <input type="number" value={freight} onChange={e => setFreight(e.target.value)} placeholder="Freight total (₹)" className={INP} />
          <input type="number" value={dutyPct} onChange={e => setDutyPct(e.target.value)} placeholder="Duty %" className={INP} />
          <input type="number" value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="Insurance total (₹)" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add quote</button>
        </div>
      </div>

      {groups.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Items compared", value: String(groups.length), color: "text-[var(--color-primary)]" },
            { label: "Quotes", value: String(rows.length), color: "text-[var(--color-muted)]" },
            { label: "Sticker ≠ landed winner", value: String(flips), color: flips > 0 ? "text-yellow-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        {groups.map(g => (
          <div key={g.item} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-semibold">{g.item}</p>
              {g.flipped && <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-yellow-900/30 text-yellow-400 border-yellow-800/40">Cheapest sticker isn't cheapest landed</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Unit ₹", "Freight", "Duty", "Insurance", "Landed/unit", "Flag", ""].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {g.rows.map(r => {
                    const lu = landedUnitOf(r);
                    const best = lu === g.minLanded;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-3 py-2 text-xs font-medium">{r.supplier}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{formatCurrency(r.unitPrice)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-[var(--color-muted)]">{formatCurrency(r.freight)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-[var(--color-muted)]">{r.dutyPct}%</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-[var(--color-muted)]">{formatCurrency(r.insurance)}</td>
                        <td className={`px-3 py-2 text-xs tabular-nums font-bold ${best ? "text-green-400" : ""}`}>{formatCurrency(lu)}</td>
                        <td className="px-3 py-2 text-xs">{best && <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-green-900/30 text-green-400 border-green-800/40">Best landed</span>}</td>
                        <td className="px-3 py-2"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Landed unit cost = (goods + duty + freight + insurance) ÷ qty. A distant low-price supplier can lose to a nearby one once freight and duty load in — always decide on landed, not sticker, cost.</p>
    </div>
  );
}

// ── Contract Expiry Calendar ─────────────────────────────────────────────────────
type ContractRow = {
  id: string;
  supplier: string;
  title: string;
  annualValue: number;
  noticeDays: number;   // notice period to renew/exit
  expiry: string;
};
function ContractExpiryCalendar() {
  const [rows, setRows] = useFeatureState<ContractRow[]>("sup-contract-calendar", []);
  const [supplier, setSupplier] = useState("");
  const [title, setTitle] = useState("");
  const [annualValue, setAnnualValue] = useState("");
  const [noticeDays, setNoticeDays] = useState("30");
  const [expiry, setExpiry] = useState("");
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const daysToExpiry = (r: ContractRow) => Math.ceil((new Date(r.expiry).getTime() - today.getTime()) / 86400000);
  const statusOf = (r: ContractRow): { label: string; c: string } => {
    const d = daysToExpiry(r);
    if (d < 0) return { label: "Expired", c: "bg-red-900/30 text-red-400 border-red-800/40" };
    if (d <= r.noticeDays) return { label: `Notice window (${d}d)`, c: "bg-red-900/30 text-red-400 border-red-800/40" };
    if (d <= 90) return { label: `Renew soon (${d}d)`, c: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" };
    return { label: `${d}d left`, c: "bg-green-900/30 text-green-400 border-green-800/40" };
  };

  const add = () => {
    if (!supplier.trim() || !title.trim()) { toast.error("Enter supplier and contract"); return; }
    if (!expiry) { toast.error("Enter expiry date"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      title: title.trim(),
      annualValue: Math.max(0, parseFloat(annualValue) || 0),
      noticeDays: Math.max(0, parseFloat(noticeDays) || 0),
      expiry,
    }]);
    setSupplier(""); setTitle(""); setAnnualValue(""); setExpiry("");
    toast.success("Contract added");
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => a.expiry.localeCompare(b.expiry)), [rows]);
  const inNotice = rows.filter(r => { const d = daysToExpiry(r); return d >= 0 && d <= r.noticeDays; });
  const valueAtRisk = inNotice.reduce((s, r) => s + r.annualValue, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarDays size={14} className="text-[var(--color-primary)]" /> Contract Expiry Calendar</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track supply agreements with their notice periods. Get flagged once you enter the notice window so you renew or exit on time instead of auto-rolling into worse terms.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Contract / SOW *" className={INP} />
          <input type="number" value={annualValue} onChange={e => setAnnualValue(e.target.value)} placeholder="Annual value (₹)" className={INP} />
          <input type="number" value={noticeDays} onChange={e => setNoticeDays(e.target.value)} placeholder="Notice period (days)" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Expiry date</label>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add contract</button>
        </div>
      </div>

      {sorted.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Contracts", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "In notice window", value: String(inNotice.length), color: inNotice.length > 0 ? "text-red-400" : "text-green-400" },
            { label: "Value at risk", value: formatCurrency(valueAtRisk), color: valueAtRisk > 0 ? "text-yellow-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Contract", "Annual value", "Notice", "Expiry", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {sorted.map(r => {
                const st = statusOf(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-xs">{r.title}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{r.annualValue > 0 ? formatCurrency(r.annualValue) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.noticeDays}d</td>
                    <td className="px-3 py-2.5 text-xs">{r.expiry}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${st.c}`}>{st.label}</span></td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Most supply contracts auto-renew unless you serve notice. Diarise the notice date, not the expiry date — miss it and you are locked in for another term at the incumbent rate.</p>
    </div>
  );
}

// ── Payment-Terms Benchmark ──────────────────────────────────────────────────────
type BenchRow = {
  id: string;
  supplier: string;
  category: string;
  creditDays: number;   // terms this supplier gives you
  annualSpend: number;
};
function PaymentTermsBenchmark() {
  const [rows, setRows] = useFeatureState<BenchRow[]>("sup-terms-benchmark", []);
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("");
  const [creditDays, setCreditDays] = useState("");
  const [annualSpend, setAnnualSpend] = useState("");

  const add = () => {
    if (!supplier.trim() || !category.trim()) { toast.error("Enter supplier and category"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      category: category.trim(),
      creditDays: Math.max(0, parseFloat(creditDays) || 0),
      annualSpend: Math.max(0, parseFloat(annualSpend) || 0),
    }]);
    setSupplier(""); setCreditDays(""); setAnnualSpend("");
    toast.success("Supplier added");
  };

  // Benchmark each supplier's credit days against the average for its category
  const catAvg = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      const e = m.get(r.category) || { sum: 0, n: 0 };
      e.sum += r.creditDays; e.n += 1; m.set(r.category, e);
    }
    return m;
  }, [rows]);

  const analysed = useMemo(() => rows.map(r => {
    const e = catAvg.get(r.category)!;
    const avg = e.n > 0 ? e.sum / e.n : 0;
    const gap = Math.round(r.creditDays - avg);
    return { ...r, avg: Math.round(avg), gap };
  }).sort((a, b) => a.gap - b.gap), [rows, catAvg]);

  const belowPeer = analysed.filter(r => r.gap < 0);
  // Working-capital upside of pulling laggards up to category average (1 extra day ≈ spend/365 freed)
  const wcUpside = belowPeer.reduce((s, r) => s + (Math.abs(r.gap) * r.annualSpend / 365), 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Payment-Terms Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Compare the credit days each supplier grants against the average for its category. Spot the laggards giving you tighter terms than their peers and renegotiate them up.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category *" className={INP} />
          <input type="number" value={creditDays} onChange={e => setCreditDays(e.target.value)} placeholder="Credit days they give" className={INP} />
          <input type="number" value={annualSpend} onChange={e => setAnnualSpend(e.target.value)} placeholder="Annual spend (₹)" className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add supplier</button>
        </div>
      </div>

      {analysed.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Suppliers", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Below peer avg", value: String(belowPeer.length), color: belowPeer.length > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Working-cap upside", value: formatCurrency(wcUpside), color: "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Category", "Their terms", "Cat. avg", "Gap", "Verdict", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {analysed.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.category}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{r.creditDays}d</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.avg}d</td>
                  <td className={`px-3 py-2.5 text-xs tabular-nums font-bold ${r.gap < 0 ? "text-yellow-400" : "text-green-400"}`}>{r.gap > 0 ? `+${r.gap}` : r.gap}d</td>
                  <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.gap < 0 ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{r.gap < 0 ? "Push for more" : "At/above peers"}</span></td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Each extra day of credit on a category frees roughly spend÷365 of working capital. Use a peer's better terms as leverage — "Supplier B in the same category gives me 60 days" is a clean ask.</p>
    </div>
  );
}

// ── Supplier Risk Diversification ────────────────────────────────────────────────
type DivRow = {
  id: string;
  supplier: string;
  region: string;
  spend: number;
  singleSource: boolean;  // is this the only supplier for a critical input?
};
function RiskDiversification() {
  const [rows, setRows] = useFeatureState<DivRow[]>("sup-risk-diversification", []);
  const [supplier, setSupplier] = useState("");
  const [region, setRegion] = useState("");
  const [spend, setSpend] = useState("");
  const [singleSource, setSingleSource] = useState(false);

  const add = () => {
    if (!supplier.trim() || !region.trim()) { toast.error("Enter supplier and region"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      supplier: supplier.trim(),
      region: region.trim(),
      spend: Math.max(0, parseFloat(spend) || 0),
      singleSource,
    }]);
    setSupplier(""); setRegion(""); setSpend(""); setSingleSource(false);
    toast.success("Supplier added");
  };

  const total = rows.reduce((s, r) => s + r.spend, 0);
  // Herfindahl index on region spend → 0 (spread) to 1 (one region)
  const regionShare = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.region, (m.get(r.region) || 0) + r.spend);
    return [...m.entries()].map(([region, sp]) => ({ region, sp, pct: total > 0 ? (sp / total) * 100 : 0 }))
      .sort((a, b) => b.sp - a.sp);
  }, [rows, total]);
  const hhi = regionShare.reduce((s, r) => s + Math.pow(r.pct / 100, 2), 0);
  const topRegionPct = regionShare.length > 0 ? regionShare[0].pct : 0;
  const singleSourceCount = rows.filter(r => r.singleSource).length;
  const concentrated = topRegionPct >= 50 || hhi >= 0.5;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-primary)]" /> Supplier Risk Diversification</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Map spend across regions and flag single-source dependencies. A region HHI and single-source count tell you where one disruption could halt supply.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier *" className={INP} />
          <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Region / country *" className={INP} />
          <input type="number" value={spend} onChange={e => setSpend(e.target.value)} placeholder="Annual spend (₹)" className={INP} />
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] px-1">
            <input type="checkbox" checked={singleSource} onChange={e => setSingleSource(e.target.checked)} /> Single-source for a critical input
          </label>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add supplier</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Top region share", value: `${topRegionPct.toFixed(0)}%`, color: topRegionPct >= 50 ? "text-red-400" : "text-green-400" },
            { label: "Region HHI", value: hhi.toFixed(2), color: hhi >= 0.5 ? "text-red-400" : hhi >= 0.25 ? "text-yellow-400" : "text-green-400" },
            { label: "Single-source", value: String(singleSourceCount), color: singleSourceCount > 0 ? "text-yellow-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        {concentrated && <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-xs text-red-300">Supply is concentrated. A single region or sole supplier disruption could stall production — qualify a second source for critical inputs.</div>}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Spend by region</p>
          {regionShare.map(rs => (
            <div key={rs.region}>
              <div className="flex justify-between text-xs mb-0.5"><span>{rs.region}</span><span className="tabular-nums text-[var(--color-muted)]">{rs.pct.toFixed(0)}% · {formatCurrency(rs.sp)}</span></div>
              <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${rs.pct}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Supplier", "Region", "Spend", "Risk", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{r.supplier}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.region}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(r.spend)}</td>
                  <td className="px-3 py-2.5 text-xs">{r.singleSource ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-yellow-900/30 text-yellow-400 border-yellow-800/40">Single-source</span> : <span className="text-[var(--color-muted)]">Multi-source</span>}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">HHI = Σ(region share²): below 0.25 is diversified, above 0.5 is concentrated. Single-source criticals deserve a qualified backup even at a small cost premium — resilience is cheaper than a stockout.</p>
    </div>
  );
}

// ── Economic Order Quantity (EOQ) Check ──────────────────────────────────────────
type EoqRow = {
  id: string;
  item: string;
  annualDemand: number;
  orderCost: number;     // cost to place one order
  unitCost: number;
  holdingPct: number;    // annual holding cost as % of unit cost
  moq: number;           // supplier minimum order qty
};
function EoqCheck() {
  const [rows, setRows] = useFeatureState<EoqRow[]>("sup-eoq-check", []);
  const [item, setItem] = useState("");
  const [annualDemand, setAnnualDemand] = useState("");
  const [orderCost, setOrderCost] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [holdingPct, setHoldingPct] = useState("20");
  const [moq, setMoq] = useState("");

  // EOQ = sqrt(2 D S / H), H = holdingPct% × unitCost
  const eoqOf = (r: EoqRow) => {
    const H = r.unitCost * (r.holdingPct / 100);
    if (H <= 0) return 0;
    return Math.round(Math.sqrt((2 * r.annualDemand * r.orderCost) / H));
  };
  // Order qty must respect MOQ
  const orderQtyOf = (r: EoqRow) => Math.max(eoqOf(r), r.moq);
  const ordersPerYearOf = (r: EoqRow) => { const q = orderQtyOf(r); return q > 0 ? +(r.annualDemand / q).toFixed(1) : 0; };
  const annualCostOf = (r: EoqRow) => {
    const q = orderQtyOf(r); if (q <= 0) return 0;
    const H = r.unitCost * (r.holdingPct / 100);
    return Math.round((r.annualDemand / q) * r.orderCost + (q / 2) * H);
  };

  const add = () => {
    if (!item.trim()) { toast.error("Enter item name"); return; }
    const num = (v: string) => Math.max(0, parseFloat(v) || 0);
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      item: item.trim(),
      annualDemand: num(annualDemand),
      orderCost: num(orderCost),
      unitCost: num(unitCost),
      holdingPct: Math.max(0, parseFloat(holdingPct) || 0),
      moq: num(moq),
    }]);
    setItem(""); setAnnualDemand(""); setOrderCost(""); setUnitCost(""); setMoq("");
    toast.success("Item added");
  };

  const moqBound = rows.filter(r => r.moq > eoqOf(r) && eoqOf(r) > 0).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Economic Order Quantity (EOQ) Check</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Find the order size that minimises ordering + holding cost: EOQ = √(2·demand·order cost ÷ holding cost). Flags where a supplier MOQ forces you above the optimal lot.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / SKU *" className={INP} />
          <input type="number" value={annualDemand} onChange={e => setAnnualDemand(e.target.value)} placeholder="Annual demand (units)" className={INP} />
          <input type="number" value={orderCost} onChange={e => setOrderCost(e.target.value)} placeholder="Cost per order (₹)" className={INP} />
          <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="Unit cost (₹)" className={INP} />
          <input type="number" value={holdingPct} onChange={e => setHoldingPct(e.target.value)} placeholder="Holding cost % p.a." className={INP} />
          <input type="number" value={moq} onChange={e => setMoq(e.target.value)} placeholder="Supplier MOQ (units)" className={INP} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add item</button>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Items", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "MOQ above EOQ", value: String(moqBound), color: moqBound > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Total annual cost", value: formatCurrency(rows.reduce((s, r) => s + annualCostOf(r), 0)), color: "text-[var(--color-muted)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Item", "Demand", "EOQ", "MOQ", "Order qty", "Orders/yr", "Annual cost", "Flag", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const eoq = eoqOf(r);
                const bound = r.moq > eoq && eoq > 0;
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.item}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.annualDemand}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold">{eoq}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.moq || "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-bold">{orderQtyOf(r)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{ordersPerYearOf(r)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{formatCurrency(annualCostOf(r))}</td>
                    <td className="px-3 py-2.5">{bound ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-yellow-900/30 text-yellow-400 border-yellow-800/40">MOQ-bound</span> : <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-green-900/30 text-green-400 border-green-800/40">Optimal</span>}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">EOQ balances ordering cost against carrying cost. Where the supplier MOQ exceeds EOQ you carry excess stock — negotiate a lower MOQ, split lots, or factor the extra holding cost into the price comparison.</p>
    </div>
  );
}

// ── #86 Vendor Advance / Prepayment Tracker ──────────────────────────────────────
type AdvanceRow = {
  id: string;
  vendor: string;
  reference: string;
  advancePaid: number;
  adjusted: number;
  paidDate: string;
};
function VendorAdvanceTracker() {
  const [rows, setRows] = useFeatureState<AdvanceRow[]>("sup-vendor-advances", []);
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [advancePaid, setAdvancePaid] = useState("");
  const [adjusted, setAdjusted] = useState("");
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().split("T")[0]);
  const fc = formatCurrency;
  const today = new Date();

  const balanceOf = (r: AdvanceRow) => Math.max(0, r.advancePaid - r.adjusted);
  const ageOf = (r: AdvanceRow) => Math.floor((today.getTime() - new Date(r.paidDate).getTime()) / 86400000);

  const add = () => {
    if (!vendor.trim()) { toast.error("Enter vendor name"); return; }
    const paid = Math.max(0, parseFloat(advancePaid) || 0);
    const adj = Math.max(0, parseFloat(adjusted) || 0);
    if (adj > paid) { toast.error("Adjusted cannot exceed advance paid"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      vendor: vendor.trim(),
      reference: reference.trim(),
      advancePaid: paid,
      adjusted: adj,
      paidDate,
    }]);
    setVendor(""); setReference(""); setAdvancePaid(""); setAdjusted("");
    toast.success("Advance recorded");
  };

  const fullyAdjust = (id: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, adjusted: r.advancePaid } : r));
    toast.success("Advance fully adjusted");
  };

  const totalOutstanding = rows.reduce((s, r) => s + balanceOf(r), 0);
  const openCount = rows.filter(r => balanceOf(r) > 0).length;
  const staleCount = rows.filter(r => balanceOf(r) > 0 && ageOf(r) > 90).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Vendor Advance / Prepayment Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track advances paid to vendors and adjust them against later invoices. Unadjusted balances are cash sitting with suppliers — chase or net them off before they go stale.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={INP} />
          <input value={reference} onChange={e => setReference(e.target.value)} placeholder="PO / reference" className={INP} />
          <input type="number" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)} placeholder="Advance paid (₹)" className={INP} />
          <input type="number" value={adjusted} onChange={e => setAdjusted(e.target.value)} placeholder="Already adjusted (₹)" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Advance date</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Record advance</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Open advances", value: String(openCount), color: "text-[var(--color-primary)]" },
            { label: "Unadjusted balance", value: fc(totalOutstanding), color: totalOutstanding > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Stale (>90d)", value: String(staleCount), color: staleCount > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Vendor", "Reference", "Advance", "Adjusted", "Balance", "Age", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const bal = balanceOf(r);
                const age = ageOf(r);
                const stale = bal > 0 && age > 90;
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.vendor}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.reference || "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.advancePaid)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{fc(r.adjusted)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-bold ${bal > 0 ? "text-yellow-400" : "text-green-400"}`}>{fc(bal)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${stale ? "text-red-400 font-semibold" : ""}`}>{age}d</td>
                    <td className="px-3 py-2.5">
                      {bal <= 0
                        ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-green-900/30 text-green-400 border-green-800/40">Settled</span>
                        : <button onClick={() => fullyAdjust(r.id)} className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-primary)]">Mark adjusted</button>}
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Advances paid sit as an asset until invoiced against. Net them off promptly — long-open advances tie up cash and signal disputed deliveries or a vendor at risk. GST on advances for goods is not payable post-Nov 2017; advances for services still attract GST.</p>
    </div>
  );
}

// ── #53 Recurring Bill Calendar (rent / utility / SaaS) ──────────────────────────
type RecurRow = {
  id: string;
  name: string;
  amount: number;
  cadence: "monthly" | "quarterly" | "annual";
  dueDay: number;       // day-of-month the bill falls due
};
function RecurringBillCalendar() {
  const [rows, setRows] = useFeatureState<RecurRow[]>("sup-recurring-bills", []);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<RecurRow["cadence"]>("monthly");
  const [dueDay, setDueDay] = useState("1");
  const fc = formatCurrency;
  const today = new Date();
  const tDay = today.getDate();

  // Normalise everything to monthly run-rate for the spend summary.
  const monthlyOf = (r: RecurRow) => r.cadence === "monthly" ? r.amount : r.cadence === "quarterly" ? r.amount / 3 : r.amount / 12;
  const nextDueDate = (r: RecurRow) => {
    const d = new Date(today.getFullYear(), today.getMonth(), Math.min(r.dueDay, 28));
    if (r.dueDay < tDay) d.setMonth(d.getMonth() + 1);
    return d;
  };
  const daysToOf = (r: RecurRow) => Math.ceil((nextDueDate(r).getTime() - new Date(today.getFullYear(), today.getMonth(), tDay).getTime()) / 86400000);

  const add = () => {
    if (!name.trim()) { toast.error("Enter bill name"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      name: name.trim(),
      amount: Math.max(0, parseFloat(amount) || 0),
      cadence,
      dueDay: Math.max(1, Math.min(28, parseInt(dueDay) || 1)),
    }]);
    setName(""); setAmount("");
    toast.success("Recurring bill added");
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => daysToOf(a) - daysToOf(b)), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthlyTotal = rows.reduce((s, r) => s + monthlyOf(r), 0);
  const dueThisWeek = rows.filter(r => daysToOf(r) <= 7).length;
  const CAD: Record<RecurRow["cadence"], string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarRange size={14} className="text-[var(--color-primary)]" /> Recurring Bill Calendar</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Schedule fixed dues — rent, utilities, SaaS — by cadence and due day. See what is due this week and your true monthly run-rate so nothing slips into a late fee.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Bill name *" className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)" className={INP} />
          <select value={cadence} onChange={e => setCadence(e.target.value as RecurRow["cadence"])} className={INP}>
            {(Object.keys(CAD) as RecurRow["cadence"][]).map(k => <option key={k} value={k}>{CAD[k]}</option>)}
          </select>
          <select value={dueDay} onChange={e => setDueDay(e.target.value)} className={INP}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Due on day {d}</option>)}
          </select>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add bill</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Recurring bills", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Monthly run-rate", value: fc(Math.round(monthlyTotal)), color: "text-[var(--color-muted)]" },
            { label: "Due in ≤7 days", value: String(dueThisWeek), color: dueThisWeek > 0 ? "text-yellow-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Bill", "Amount", "Cadence", "Due day", "Next due", "Monthly eq.", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {sorted.map(r => {
                const dt = daysToOf(r);
                const soon = dt <= 7;
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.amount)}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{CAD[r.cadence]}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.dueDay}</td>
                    <td className={`px-3 py-2.5 text-xs ${soon ? "text-yellow-400 font-semibold" : ""}`}>{nextDueDate(r).toISOString().split("T")[0]} <span className="text-[var(--color-muted)]">({dt}d)</span></td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(Math.round(monthlyOf(r)))}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Quarterly and annual dues are shown as a monthly equivalent so the run-rate reflects true commitment. Set the due day a few days ahead of the actual deadline to leave room for approval and bank cut-off times.</p>
    </div>
  );
}

// ── #87 Duplicate Invoice Guard ──────────────────────────────────────────────────
type InvLogRow = {
  id: string;
  vendor: string;
  invoiceNo: string;
  amount: number;
  date: string;
};
function DuplicateInvoiceGuard() {
  const [rows, setRows] = useFeatureState<InvLogRow[]>("sup-dup-invoice", []);
  const [vendor, setVendor] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const fc = formatCurrency;

  const keyOf = (vendorName: string, inv: string) => `${vendorName.trim().toLowerCase()}␟${inv.trim().toLowerCase()}`;

  // A row is a duplicate if its (vendor + invoice no) key matches an earlier row.
  const flagged = useMemo(() => {
    const seen = new Map<string, number>();
    return rows.map((r, i) => {
      const k = keyOf(r.vendor, r.invoiceNo);
      const firstIdx = seen.has(k) ? seen.get(k)! : i;
      if (!seen.has(k)) seen.set(k, i);
      const dup = firstIdx !== i;
      const sameAmt = dup && rows[firstIdx].amount === r.amount;
      return { ...r, dup, exact: dup && sameAmt };
    });
  }, [rows]);

  const add = () => {
    if (!vendor.trim() || !invoiceNo.trim()) { toast.error("Enter vendor and invoice no."); return; }
    const k = keyOf(vendor, invoiceNo);
    const amt = Math.max(0, parseFloat(amount) || 0);
    const prior = rows.find(r => keyOf(r.vendor, r.invoiceNo) === k);
    if (prior) {
      toast.error(prior.amount === amt
        ? `Exact duplicate of ${prior.vendor} ${prior.invoiceNo} (${fc(prior.amount)}) — added but flagged`
        : `Same invoice no. already logged for ${prior.vendor} — added but flagged`);
    }
    setRows(prev => [...prev, { id: crypto.randomUUID(), vendor: vendor.trim(), invoiceNo: invoiceNo.trim(), amount: amt, date }]);
    setVendor(""); setInvoiceNo(""); setAmount("");
    if (!prior) toast.success("Invoice logged — no duplicate");
  };

  const dupCount = flagged.filter(r => r.dup).length;
  const exposure = flagged.filter(r => r.dup).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Copy size={14} className="text-[var(--color-primary)]" /> Duplicate Invoice Guard</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log every bill before payment. The guard flags any repeat of the same vendor + invoice number, and highlights exact amount matches — stopping double payments before the cash leaves.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={INP} />
          <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Invoice no. *" className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)" className={INP} />
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-0.5">Invoice date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Log & check</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Invoices logged", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "Duplicates flagged", value: String(dupCount), color: dupCount > 0 ? "text-red-400" : "text-green-400" },
            { label: "Double-pay exposure", value: fc(exposure), color: exposure > 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Vendor", "Invoice no.", "Amount", "Date", "Check", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {flagged.map(r => (
                <tr key={r.id} className={`hover:bg-white/2 ${r.dup ? "bg-red-900/10" : ""}`}>
                  <td className="px-3 py-2.5 text-xs font-medium">{r.vendor}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-[var(--color-muted)]">{r.invoiceNo}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.amount)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.date}</td>
                  <td className="px-3 py-2.5">
                    {r.exact
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-red-900/30 text-red-400 border-red-800/40">Exact duplicate</span>
                      : r.dup
                        ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-yellow-900/30 text-yellow-400 border-yellow-800/40">Same invoice no.</span>
                        : <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium bg-green-900/30 text-green-400 border-green-800/40">Unique</span>}
                  </td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Duplicate payments are one of the most common AP leaks — often a re-sent PDF or a credit note re-keyed as a fresh bill. Match on vendor + invoice number first, then amount; investigate flagged rows before releasing payment.</p>
    </div>
  );
}

// ── #52 Carrying-Cost Calculator (true holding cost per SKU) ──────────────────────
type CarryRow = {
  id: string;
  item: string;
  avgInventoryValue: number;  // ₹ value of stock held on average
  capitalPct: number;         // cost of capital % p.a.
  storagePct: number;         // warehousing/handling % p.a.
  obsolescencePct: number;    // shrinkage/obsolescence/insurance % p.a.
};
function CarryingCostCalculator() {
  const [rows, setRows] = useFeatureState<CarryRow[]>("sup-carrying-cost", []);
  const [item, setItem] = useState("");
  const [avgInventoryValue, setAvgInventoryValue] = useState("");
  const [capitalPct, setCapitalPct] = useState("14");
  const [storagePct, setStoragePct] = useState("4");
  const [obsolescencePct, setObsolescencePct] = useState("3");
  const fc = formatCurrency;

  const totalPctOf = (r: CarryRow) => r.capitalPct + r.storagePct + r.obsolescencePct;
  const annualCostOf = (r: CarryRow) => Math.round(r.avgInventoryValue * (totalPctOf(r) / 100));

  const add = () => {
    if (!item.trim()) { toast.error("Enter item name"); return; }
    const num = (v: string) => Math.max(0, parseFloat(v) || 0);
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      item: item.trim(),
      avgInventoryValue: num(avgInventoryValue),
      capitalPct: num(capitalPct),
      storagePct: num(storagePct),
      obsolescencePct: num(obsolescencePct),
    }]);
    setItem(""); setAvgInventoryValue("");
    toast.success("Item added");
  };

  const totalAnnual = rows.reduce((s, r) => s + annualCostOf(r), 0);
  const totalValue = rows.reduce((s, r) => s + r.avgInventoryValue, 0);
  const blendedPct = totalValue > 0 ? (totalAnnual / totalValue) * 100 : 0;
  const ranked = useMemo(() => [...rows].sort((a, b) => annualCostOf(b) - annualCostOf(a)), [rows]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Warehouse size={14} className="text-[var(--color-primary)]" /> Carrying-Cost Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Quantify the true cost of holding each SKU: capital tied up + storage/handling + obsolescence & insurance. The hidden 20–30% p.a. drag that makes slow stock far costlier than it looks.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / SKU *" className={INP} />
          <input type="number" value={avgInventoryValue} onChange={e => setAvgInventoryValue(e.target.value)} placeholder="Avg stock value (₹)" className={INP} />
          <input type="number" value={capitalPct} onChange={e => setCapitalPct(e.target.value)} placeholder="Cost of capital % p.a." className={INP} />
          <input type="number" value={storagePct} onChange={e => setStoragePct(e.target.value)} placeholder="Storage % p.a." className={INP} />
          <input type="number" value={obsolescencePct} onChange={e => setObsolescencePct(e.target.value)} placeholder="Obsolescence % p.a." className={INP} />
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add item</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Stock value", value: fc(totalValue), color: "text-[var(--color-muted)]" },
            { label: "Annual carrying cost", value: fc(totalAnnual), color: "text-red-400" },
            { label: "Blended rate", value: `${blendedPct.toFixed(1)}%`, color: blendedPct >= 25 ? "text-red-400" : "text-yellow-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Item", "Stock value", "Capital", "Storage", "Obsolescence", "Total %", "Annual cost", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ranked.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-3 py-2.5 text-xs font-medium">{r.item}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.avgInventoryValue)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.capitalPct}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.storagePct}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.obsolescencePct}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-semibold">{totalPctOf(r).toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-red-400">{fc(annualCostOf(r))}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Carrying cost typically runs 20–30% of stock value per year. A SKU that turns slowly bleeds this rate continuously — weigh it against EOQ savings, bulk discounts, and the margin the stock actually earns before over-ordering.</p>
    </div>
  );
}

// ── #21 TDS-on-Bills Calculator (section / rate / threshold) ─────────────────────
type TdsSection = "194C" | "194C-co" | "194J" | "194J-tech" | "194Q" | "194I-rent" | "194H";
type TdsBillRow = {
  id: string;
  vendor: string;
  section: TdsSection;
  amount: number;        // taxable bill value (ex-GST)
  ytdPaid: number;       // amount already paid to this vendor this FY (for threshold)
  hasPan: boolean;
};
const TDS_RULES: Record<TdsSection, { label: string; rate: number; threshold: number }> = {
  "194C":      { label: "194C — Contractor (indiv/HUF)", rate: 1,  threshold: 30000 },
  "194C-co":   { label: "194C — Contractor (others)",    rate: 2,  threshold: 30000 },
  "194J":      { label: "194J — Professional fees",      rate: 10, threshold: 30000 },
  "194J-tech": { label: "194J — Technical services",     rate: 2,  threshold: 30000 },
  "194Q":      { label: "194Q — Purchase of goods",      rate: 0.1, threshold: 5000000 },
  "194I-rent": { label: "194I — Rent (plant/building)",  rate: 10, threshold: 240000 },
  "194H":      { label: "194H — Commission/brokerage",   rate: 2,  threshold: 20000 },
};
function TdsOnBillsCalculator() {
  const [rows, setRows] = useFeatureState<TdsBillRow[]>("sup-tds-bills", []);
  const [vendor, setVendor] = useState("");
  const [section, setSection] = useState<TdsSection>("194C-co");
  const [amount, setAmount] = useState("");
  const [ytdPaid, setYtdPaid] = useState("");
  const [hasPan, setHasPan] = useState(true);
  const fc = formatCurrency;

  // 194Q applies on value above the ₹50L threshold; other sections on the whole bill once crossed.
  // No-PAN → flat 20% (Sec 206AA) unless the section rate is higher.
  const calc = (r: TdsBillRow) => {
    const rule = TDS_RULES[r.section];
    const crossed = (r.ytdPaid + r.amount) >= rule.threshold;
    if (!crossed) return { applies: false, rate: 0, base: 0, tds: 0 };
    const base = r.section === "194Q" ? Math.max(0, (r.ytdPaid + r.amount) - rule.threshold) : r.amount;
    const rate = r.hasPan ? rule.rate : Math.max(20, rule.rate);
    return { applies: true, rate, base, tds: Math.round(base * (rate / 100)) };
  };

  const add = () => {
    if (!vendor.trim()) { toast.error("Enter vendor name"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      vendor: vendor.trim(),
      section,
      amount: Math.max(0, parseFloat(amount) || 0),
      ytdPaid: Math.max(0, parseFloat(ytdPaid) || 0),
      hasPan,
    }]);
    setVendor(""); setAmount(""); setYtdPaid("");
    toast.success("Bill added");
  };

  const totalTds = rows.reduce((s, r) => s + calc(r).tds, 0);
  const dueCount = rows.filter(r => calc(r).applies).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> TDS-on-Bills Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Apply the right TDS section, rate, and threshold to each vendor bill. Tracks FY-to-date payments to know when a threshold is crossed, and flags the 20% no-PAN rate.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={INP} />
          <select value={section} onChange={e => setSection(e.target.value as TdsSection)} className={INP}>
            {(Object.keys(TDS_RULES) as TdsSection[]).map(k => <option key={k} value={k}>{TDS_RULES[k].label}</option>)}
          </select>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Bill value ex-GST (₹)" className={INP} />
          <input type="number" value={ytdPaid} onChange={e => setYtdPaid(e.target.value)} placeholder="Paid YTD this FY (₹)" className={INP} />
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] px-1">
            <input type="checkbox" checked={hasPan} onChange={e => setHasPan(e.target.checked)} className="accent-[var(--color-primary)]" /> Vendor PAN on file
          </label>
          <button onClick={add} className="flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90"><Plus size={13} /> Add bill</button>
        </div>
      </div>

      {rows.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Bills", value: String(rows.length), color: "text-[var(--color-primary)]" },
            { label: "TDS applicable", value: String(dueCount), color: "text-yellow-400" },
            { label: "Total TDS to deduct", value: fc(totalTds), color: "text-[var(--color-primary)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Vendor", "Section", "Bill value", "Rate", "TDS base", "TDS", "Net payable", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => {
                const c = calc(r);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.vendor}{!r.hasPan && <span className="ml-1 text-[9px] text-red-400 font-semibold">no-PAN</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.section}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.amount)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{c.applies ? `${c.rate}%` : "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{c.applies ? fc(c.base) : "below thr."}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-bold ${c.applies ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{c.applies ? fc(c.tds) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.amount - c.tds)}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
      <p className="text-[10px] text-[var(--color-muted)]">Indicative rates for resident vendors — deduct on the ex-GST value. 194Q applies only above the ₹50L per-vendor annual threshold (and not where the seller charges 206C(1H) TCS). No PAN triggers a flat 20% under Sec 206AA. Confirm current rates and your 194C single-bill vs ₹1L annual limits with your CA.</p>
    </div>
  );
}
