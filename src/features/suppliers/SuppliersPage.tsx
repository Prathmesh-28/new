import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useFeatureState } from "@/hooks/useFeatureState";
import { Package, Zap, TrendingDown, Check, Award, RefreshCw, FileText, BadgeCheck, Plus, Trash2, Search } from "lucide-react";
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

type SupTab = "early-pay" | "scorecard" | "reorder" | "rate-contract" | "msme-verify";
const SUP_TABS: { id: SupTab; label: string; Icon: typeof Package }[] = [
  { id: "early-pay",     label: "Early-Pay",      Icon: Zap },
  { id: "scorecard",     label: "Scorecard",      Icon: Award },
  { id: "reorder",       label: "Reorder Point",  Icon: RefreshCw },
  { id: "rate-contract", label: "Rate Contracts", Icon: FileText },
  { id: "msme-verify",   label: "MSME Verify",    Icon: BadgeCheck },
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
      {tab === "early-pay"     && <EarlyPaySection />}
      {tab === "scorecard"     && <SupplierScorecard />}
      {tab === "reorder"       && <ReorderPointTracker />}
      {tab === "rate-contract" && <RateContractManager />}
      {tab === "msme-verify"   && <MsmeVerificationBatch />}
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
