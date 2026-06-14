import { useMemo, useState } from "react";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  ShoppingCart, FileSpreadsheet, Calculator, Undo2, Layers, CalendarClock,
  Receipt, Tag, GitCompareArrows, ClipboardCheck, Megaphone,
  Plus, AlertTriangle, CheckCircle2, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

// Reused TaxPage input class string.
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type MktTab =
  | "overview" | "settlement" | "commission" | "rto" | "consolidate"
  | "payout-cycle" | "tcs52" | "sku-pnl" | "channel-compare" | "ondc-ready" | "roas";

const CHANNELS = ["Amazon", "Flipkart", "Meesho", "ONDC", "D2C / Shopify"] as const;
type Channel = typeof CHANNELS[number];

export default function MarketplacePage() {
  const [tab, setTab] = useState<MktTab>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShoppingCart size={18} className="text-[var(--color-primary)]" /> E-commerce & ONDC
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Reconcile marketplace payouts, find true per-SKU margin and stay GST-compliant — Amazon, Flipkart, Meesho, ONDC & D2C in one ledger.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", ShoppingCart],
            ["settlement", "Settlement Recon", FileSpreadsheet],
            ["commission", "Fee Calculator", Calculator],
            ["rto", "Return / RTO Loss", Undo2],
            ["consolidate", "Sales Consolidator", Layers],
            ["payout-cycle", "Payout Calendar", CalendarClock],
            ["tcs52", "TCS u/s 52", Receipt],
            ["sku-pnl", "Listing P&L / SKU", Tag],
            ["channel-compare", "Channel Compare", GitCompareArrows],
            ["ondc-ready", "ONDC Readiness", ClipboardCheck],
            ["roas", "Ad ROAS", Megaphone],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview onJump={setTab} />}
      {tab === "settlement" && <SettlementRecon />}
      {tab === "commission" && <CommissionCalculator />}
      {tab === "rto" && <RtoLossTracker />}
      {tab === "consolidate" && <SalesConsolidator />}
      {tab === "payout-cycle" && <PayoutCalendar />}
      {tab === "tcs52" && <Tcs52Tracker />}
      {tab === "sku-pnl" && <SkuPnL />}
      {tab === "channel-compare" && <ChannelCompare />}
      {tab === "ondc-ready" && <OndcReadiness />}
      {tab === "roas" && <RoasCalculator />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ onJump }: { onJump: (t: MktTab) => void }) {
  const [recon] = useFeatureState<SettlementLine[]>("mkt-settlement-lines", []);
  const [skus] = useFeatureState<SkuRow[]>("mkt-sku-rows", []);
  const [rtos] = useFeatureState<RtoRow[]>("mkt-rto-rows", []);

  const netPayout = recon.reduce((s, l) => s + l.orderValue - l.fees - l.refunds - l.tcs, 0);
  const rtoLoss = rtos.reduce((s, r) => s + rtoLossOf(r), 0);
  const skusBelowBreakeven = skus.filter(s => skuNet(s) < 0).length;

  const cards = [
    { label: "Net marketplace payout", value: recon.length ? formatCurrency(Math.round(netPayout)) : "—", sub: `${recon.length} settlement line(s)`, color: "text-green-400" },
    { label: "Return / RTO loss", value: rtos.length ? formatCurrency(Math.round(rtoLoss)) : "—", sub: `${rtos.length} return event(s)`, color: rtoLoss > 0 ? "text-red-400" : "text-[var(--color-text)]" },
    { label: "SKUs tracked", value: String(skus.length), sub: `${skusBelowBreakeven} selling below cost`, color: skusBelowBreakeven > 0 ? "text-yellow-400" : "text-[var(--color-text)]" },
    { label: "Channels covered", value: String(CHANNELS.length), sub: "Amazon · Flipkart · Meesho · ONDC · D2C", color: "text-[var(--color-text)]" },
  ];

  const tools: { id: MktTab; title: string; desc: string }[] = [
    { id: "settlement", title: "Settlement reconciliation", desc: "Paste an Amazon/Flipkart settlement CSV → net payout after fees, refunds & TCS." },
    { id: "commission", title: "Commission / fee calculator", desc: "Effective platform fee per channel: referral, closing, shipping & ad cut." },
    { id: "rto", title: "Return / RTO loss tracker", desc: "True cost of every return — lost margin, forward & reverse freight." },
    { id: "consolidate", title: "Multi-channel consolidator", desc: "One revenue + fee + net view across all your sales channels." },
    { id: "payout-cycle", title: "Payout calendar", desc: "Project each channel's next settlement date and amount." },
    { id: "tcs52", title: "TCS u/s 52", desc: "1% operator-collected TCS reconciled to claim as cash-ledger credit." },
    { id: "sku-pnl", title: "Listing P&L per SKU", desc: "Net margin per SKU after fees, ads, returns, shipping & GST." },
    { id: "channel-compare", title: "Channel profitability compare", desc: "Rank channels by net margin % to decide where to push volume." },
    { id: "ondc-ready", title: "ONDC readiness checklist", desc: "Catalog, GST, FSSAI & bank steps to go live as an ONDC seller." },
    { id: "roas", title: "Ad-spend ROAS calculator", desc: "ACoS, ROAS and break-even ACoS so ads never erode margin." },
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

      <div className={`${CARD} p-4`}>
        <h2 className="text-sm font-semibold mb-1">Why marketplace sellers leak money</h2>
        <p className="text-xs text-[var(--color-muted)] mb-3">
          Gross order value is never what hits your bank. Referral, closing, weight-handling and ad fees, customer
          returns and RTO freight, plus 1% TCS, all carve into it silently. These tools rebuild the path from
          gross sale to net cash so you can see — and recover — the leakage.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {tools.map(t => (
            <button key={t.id} onClick={() => onJump(t.id)}
              className="text-left bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-primary)]/40 transition-colors">
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        Marketplace operators collect 1% TCS under Sec 52 of the CGST Act and file it in GSTR-8 — reconcile it so you claim the credit. Fee schedules differ by category and change often; verify against your latest rate card.
      </div>
    </>
  );
}

// ── #1 Settlement reconciliation (paste CSV → net payout) ──────────────────────
type SettlementLine = { id: string; orderId: string; orderValue: number; fees: number; refunds: number; tcs: number };

function parseSettlementCsv(raw: string): { rows: SettlementLine[]; skipped: number } {
  const lines = raw.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0 };
  // Detect a header row (contains non-numeric tokens in the value columns).
  const looksHeader = /order|amount|fee|value|refund|tcs/i.test(lines[0]) && !/\d/.test(lines[0].replace(/[^\d,]/g, "").replace(/,/g, ""));
  const body = looksHeader ? lines.slice(1) : lines;
  const rows: SettlementLine[] = [];
  let skipped = 0;
  for (const line of body) {
    const cols = line.split(",").map(c => c.trim());
    // Expected: orderId, orderValue, fees, refunds, [tcs]
    const orderValue = Number(cols[1]?.replace(/[^0-9.-]/g, ""));
    if (cols.length < 2 || !cols[0] || Number.isNaN(orderValue)) { skipped++; continue; }
    rows.push({
      id: crypto.randomUUID(),
      orderId: cols[0],
      orderValue,
      fees: Number(cols[2]?.replace(/[^0-9.-]/g, "")) || 0,
      refunds: Number(cols[3]?.replace(/[^0-9.-]/g, "")) || 0,
      tcs: Number(cols[4]?.replace(/[^0-9.-]/g, "")) || 0,
    });
  }
  return { rows, skipped };
}

function SettlementRecon() {
  const [lines, setLines] = useFeatureState<SettlementLine[]>("mkt-settlement-lines", []);
  const [raw, setRaw] = useState("");
  const [expectedRaw, setExpectedRaw] = useState("");

  const totals = useMemo(() => {
    const gross = lines.reduce((s, l) => s + l.orderValue, 0);
    const fees = lines.reduce((s, l) => s + l.fees, 0);
    const refunds = lines.reduce((s, l) => s + l.refunds, 0);
    const tcs = lines.reduce((s, l) => s + l.tcs, 0);
    return { gross, fees, refunds, tcs, net: gross - fees - refunds - tcs };
  }, [lines]);

  const expected = parseFloat(expectedRaw) || 0;
  const variance = expected > 0 ? totals.net - expected : null;

  const importCsv = () => {
    const { rows, skipped } = parseSettlementCsv(raw);
    if (rows.length === 0) { toast.error("No valid rows found. Use: orderId, orderValue, fees, refunds, tcs"); return; }
    setLines(prev => [...prev, ...rows]);
    setRaw("");
    toast.success(`Imported ${rows.length} line(s)${skipped ? `, skipped ${skipped}` : ""}`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet size={14} className="text-[var(--color-primary)]" /> Settlement Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Paste your Amazon / Flipkart settlement export as CSV — one line per order:
          <span className="text-[var(--color-text)] font-medium"> orderId, orderValue, fees, refunds, tcs</span>. We compute the net payout that should hit your bank.
        </p>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={5}
          placeholder={"403-1234567, 1200, 180, 0, 12\n403-7654321, 2499, 410, 0, 25\n407-0001111, 899, 142, 899, 0"}
          className={`${INP} font-mono text-xs leading-relaxed`} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-1">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Expected bank credit (₹, optional)</label>
            <input type="number" value={expectedRaw} onChange={e => setExpectedRaw(e.target.value)} placeholder="e.g. 3349" className={INP} />
          </div>
          <div className="flex gap-2">
            <button onClick={importCsv} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2.5 text-sm font-medium"><Plus size={13} /> Import CSV</button>
            {lines.length > 0 && <button onClick={() => setLines([])} className="text-xs text-[var(--color-muted)] hover:text-red-400 px-3">Clear all</button>}
          </div>
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Gross order value", value: formatCurrency(Math.round(totals.gross)), color: "text-[var(--color-text)]" },
              { label: "Platform fees", value: formatCurrency(Math.round(totals.fees)), color: "text-red-400" },
              { label: "Refunds", value: formatCurrency(Math.round(totals.refunds)), color: "text-orange-400" },
              { label: "TCS (Sec 52)", value: formatCurrency(Math.round(totals.tcs)), color: "text-purple-400" },
              { label: "Net payout", value: formatCurrency(Math.round(totals.net)), color: "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {variance !== null && (
            <div className={`rounded-lg p-4 border ${Math.abs(variance) < 1 ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
              <p className={`text-sm font-bold flex items-center gap-2 ${Math.abs(variance) < 1 ? "text-green-400" : "text-red-400"}`}>
                {Math.abs(variance) < 1 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {Math.abs(variance) < 1
                  ? "Computed net payout matches the expected bank credit — settlement reconciled."
                  : `${variance > 0 ? "Shortfall" : "Excess credit"} of ${formatCurrency(Math.round(Math.abs(variance)))} vs the expected bank credit — investigate unaccounted fees or held reserves.`}
              </p>
            </div>
          )}

          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Settlement lines</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Order", "Order value", "Fees", "Refunds", "TCS", "Net", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {lines.map(l => {
                    const net = l.orderValue - l.fees - l.refunds - l.tcs;
                    return (
                      <tr key={l.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium text-xs">{l.orderId}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(l.orderValue)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(l.fees)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(l.refunds)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-purple-400">{formatCurrency(l.tcs)}</td>
                        <td className={`px-4 py-2.5 tabular-nums font-semibold ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(net))}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setLines(lines.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
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

// ── #2 Commission / fee calculator per channel ─────────────────────────────────
function CommissionCalculator() {
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [price, setPrice] = useState("");
  const [referralPct, setReferralPct] = useState("15");
  const [closingFee, setClosingFee] = useState("25");
  const [shippingFee, setShippingFee] = useState("70");
  const [adPct, setAdPct] = useState("8");
  const [gstPct, setGstPct] = useState("18");

  const p = parseFloat(price) || 0;
  const referral = p * (parseFloat(referralPct) || 0) / 100;
  const closing = parseFloat(closingFee) || 0;
  const shipping = parseFloat(shippingFee) || 0;
  const ad = p * (parseFloat(adPct) || 0) / 100;
  const feeBase = referral + closing + shipping + ad;
  const feeGst = feeBase * (parseFloat(gstPct) || 0) / 100; // GST levied on the platform fee (claimable as ITC)
  const totalFee = feeBase + feeGst;
  const netRealisation = p - totalFee;
  const effectivePct = p > 0 ? (totalFee / p) * 100 : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Commission / Fee Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter the per-order fee components for a channel to see the effective fee load and net realisation. GST on platform fees is claimable as ITC.</p>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map(c => (
            <button key={c} onClick={() => setChannel(c)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${channel === c ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ["Selling price (₹)", price, setPrice, "1200"],
            ["Referral fee %", referralPct, setReferralPct, "15"],
            ["Closing / fixed fee (₹)", closingFee, setClosingFee, "25"],
            ["Shipping / weight fee (₹)", shippingFee, setShippingFee, "70"],
            ["Ad / promo %", adPct, setAdPct, "8"],
            ["GST on fees %", gstPct, setGstPct, "18"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      {p > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{channel} — per-order economics</h3>
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${effectivePct > 30 ? "bg-red-950/30 text-red-400 border-red-800/30" : "bg-blue-950/30 text-blue-400 border-blue-800/30"}`}>{effectivePct.toFixed(1)}% effective fee</span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Selling price", value: formatCurrency(Math.round(p)), color: "text-[var(--color-text)]" },
              { label: `Referral fee (${referralPct || 0}%)`, value: `(${formatCurrency(Math.round(referral))})`, color: "text-red-400" },
              { label: "Closing / fixed fee", value: `(${formatCurrency(Math.round(closing))})`, color: "text-red-400" },
              { label: "Shipping / weight fee", value: `(${formatCurrency(Math.round(shipping))})`, color: "text-red-400" },
              { label: `Ad / promo (${adPct || 0}%)`, value: `(${formatCurrency(Math.round(ad))})`, color: "text-red-400" },
              { label: `GST on fees (${gstPct || 0}%, ITC claimable)`, value: `(${formatCurrency(Math.round(feeGst))})`, color: "text-purple-400" },
              { label: "Net realisation", value: formatCurrency(Math.round(netRealisation)), color: netRealisation >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── #3 Return / RTO loss tracker ───────────────────────────────────────────────
type RtoRow = { id: string; sku: string; channel: Channel; kind: "return" | "rto"; orderValue: number; cogs: number; fwdFreight: number; revFreight: number; count: number };

function rtoLossOf(r: RtoRow): number {
  // RTO: order never delivered → you eat both freights + (optionally) restocking, no revenue, recover goods.
  // Return: delivered then returned → lost margin if not resaleable + reverse freight; here we lose freights + COGS write-down proxy via lost margin.
  const perUnit = r.kind === "rto"
    ? r.fwdFreight + r.revFreight                       // goods come back; freight is the bleed
    : r.fwdFreight + r.revFreight + (r.orderValue - r.cogs > 0 ? 0 : 0); // delivered return: freight bleed (margin reversed on credit note)
  // For a delivered return we also lose the forward margin opportunity only if item is unsellable — approximated as freight here.
  return perUnit * r.count;
}

function RtoLossTracker() {
  const [rows, setRows] = useFeatureState<RtoRow[]>("mkt-rto-rows", []);
  const [sku, setSku] = useState("");
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [kind, setKind] = useState<RtoRow["kind"]>("rto");
  const [orderValue, setOrderValue] = useState("");
  const [cogs, setCogs] = useState("");
  const [fwd, setFwd] = useState("60");
  const [rev, setRev] = useState("60");
  const [count, setCount] = useState("1");

  const add = () => {
    const ov = parseFloat(orderValue) || 0;
    if (!sku.trim() || ov <= 0) { toast.error("Enter a SKU and order value"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), sku: sku.trim(), channel, kind, orderValue: ov,
      cogs: parseFloat(cogs) || 0, fwdFreight: parseFloat(fwd) || 0, revFreight: parseFloat(rev) || 0,
      count: Math.max(1, Math.round(parseFloat(count) || 1)),
    }]);
    setSku(""); setOrderValue(""); setCogs("");
    toast.success("Return event added");
  };

  const totalLoss = rows.reduce((s, r) => s + rtoLossOf(r), 0);
  const totalUnits = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Undo2 size={14} className="text-[var(--color-primary)]" /> Return / RTO Loss Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">RTO (return-to-origin) means the order never delivered — you bleed forward + reverse freight. Track it per SKU to see where returns are quietly killing margin.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">SKU</label>
            <input value={sku} onChange={e => setSku(e.target.value)} placeholder="TSHIRT-BLK-M" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Type</label>
            <select value={kind} onChange={e => setKind(e.target.value as RtoRow["kind"])} className={INP}>
              <option value="rto">RTO (undelivered)</option>
              <option value="return">Customer return</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Order value (₹)</label>
            <input type="number" value={orderValue} onChange={e => setOrderValue(e.target.value)} placeholder="1200" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">COGS (₹)</label>
            <input type="number" value={cogs} onChange={e => setCogs(e.target.value)} placeholder="600" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Forward freight (₹)</label>
            <input type="number" value={fwd} onChange={e => setFwd(e.target.value)} placeholder="60" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Reverse freight (₹)</label>
            <input type="number" value={rev} onChange={e => setRev(e.target.value)} placeholder="60" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">No. of events</label>
            <input type="number" value={count} onChange={e => setCount(e.target.value)} placeholder="1" className={INP} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add return event</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total return / RTO loss</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totalLoss))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Units lost</p><p className="text-xl font-bold tabular-nums">{totalUnits}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Avg loss / unit</p><p className="text-xl font-bold tabular-nums text-orange-400">{formatCurrency(totalUnits ? Math.round(totalLoss / totalUnits) : 0)}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["SKU", "Channel", "Type", "Order ₹", "Freight (fwd+rev)", "Events", "Loss", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{r.sku}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.channel}</td>
                      <td className="px-4 py-2.5 text-xs uppercase">{r.kind}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.orderValue)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(r.fwdFreight + r.revFreight)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-red-400">{formatCurrency(Math.round(rtoLossOf(r)))}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">RTO loss = forward + reverse freight per undelivered unit (goods are recovered). Delivered returns also bleed freight; if the item is unsellable, add the unrecovered COGS manually as a separate event.</p>
        </>
      )}
    </div>
  );
}

// ── #4 Multi-channel sales consolidator ────────────────────────────────────────
type ChannelSales = { id: string; channel: Channel; orders: number; grossSales: number; fees: number; returns: number };

function SalesConsolidator() {
  const [rows, setRows] = useFeatureState<ChannelSales[]>("mkt-channel-sales", []);
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [orders, setOrders] = useState("");
  const [gross, setGross] = useState("");
  const [fees, setFees] = useState("");
  const [returns, setReturns] = useState("");

  const add = () => {
    const g = parseFloat(gross) || 0;
    if (g <= 0) { toast.error("Enter gross sales for the channel"); return; }
    setRows(prev => [...prev.filter(r => r.channel !== channel), {
      id: crypto.randomUUID(), channel, orders: Math.round(parseFloat(orders) || 0), grossSales: g,
      fees: parseFloat(fees) || 0, returns: parseFloat(returns) || 0,
    }]);
    setOrders(""); setGross(""); setFees(""); setReturns("");
    toast.success(`${channel} updated`);
  };

  const net = (r: ChannelSales) => r.grossSales - r.fees - r.returns;
  const totGross = rows.reduce((s, r) => s + r.grossSales, 0);
  const totFees = rows.reduce((s, r) => s + r.fees, 0);
  const totReturns = rows.reduce((s, r) => s + r.returns, 0);
  const totNet = rows.reduce((s, r) => s + net(r), 0);
  const totOrders = rows.reduce((s, r) => s + r.orders, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Multi-channel Sales Consolidator</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter each channel's period totals to unify fragmented marketplaces into one revenue-to-net view. Re-adding a channel overwrites its row.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Orders</label><input type="number" value={orders} onChange={e => setOrders(e.target.value)} placeholder="320" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Gross sales (₹)</label><input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="450000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Fees (₹)</label><input type="number" value={fees} onChange={e => setFees(e.target.value)} placeholder="68000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Returns (₹)</label><input type="number" value={returns} onChange={e => setReturns(e.target.value)} placeholder="22000" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add / update channel</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total gross sales</p><p className="text-xl font-bold tabular-nums">{formatCurrency(Math.round(totGross))}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">{totOrders} orders</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total fees</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totFees))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total returns</p><p className="text-xl font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(totReturns))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Net revenue</p><p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(totNet))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Channel", "Orders", "Gross", "Fees", "Returns", "Net", "Mix %", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.orders}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.grossSales)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(r.fees)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(r.returns)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(Math.round(net(r)))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{totNet > 0 ? `${Math.round((net(r) / totNet) * 100)}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
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

// ── #5 Platform payout-cycle calendar ──────────────────────────────────────────
type PayoutCfg = { id: string; channel: Channel; cycleDays: number; lastPayout: string; pendingAmount: number };

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function PayoutCalendar() {
  const [rows, setRows] = useFeatureState<PayoutCfg[]>("mkt-payout-cfg", []);
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [cycleDays, setCycleDays] = useState("7");
  const [lastPayout, setLastPayout] = useState(() => new Date().toISOString().split("T")[0]);
  const [pending, setPending] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const add = () => {
    const days = Math.round(parseFloat(cycleDays) || 0);
    if (days <= 0) { toast.error("Enter a payout cycle in days"); return; }
    setRows(prev => [...prev.filter(r => r.channel !== channel), {
      id: crypto.randomUUID(), channel, cycleDays: days, lastPayout, pendingAmount: parseFloat(pending) || 0,
    }]);
    setPending("");
    toast.success(`${channel} payout cycle saved`);
  };

  const projected = rows.map(r => {
    const next = addDaysISO(r.lastPayout, r.cycleDays);
    const daysAway = Math.ceil((new Date(next).getTime() - new Date(today).getTime()) / 86400000);
    return { ...r, next, daysAway };
  }).sort((a, b) => a.daysAway - b.daysAway);

  const totalPending = rows.reduce((s, r) => s + r.pendingAmount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Platform Payout Calendar</h2>
        <p className="text-xs text-[var(--color-muted)]">Each marketplace settles on its own cycle (Amazon ~7 days, Flipkart ~7–15). Log the cycle and last payout to project when cash lands and how much is still locked.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Cycle (days)</label><input type="number" value={cycleDays} onChange={e => setCycleDays(e.target.value)} placeholder="7" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Last payout date</label><input type="date" value={lastPayout} onChange={e => setLastPayout(e.target.value)} className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Pending / unsettled (₹)</label><input type="number" value={pending} onChange={e => setPending(e.target.value)} placeholder="180000" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add / update channel</button>
      </div>

      {projected.length > 0 && (
        <>
          <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total locked in payouts</p><p className="text-xl font-bold tabular-nums text-yellow-400">{formatCurrency(Math.round(totalPending))}</p></div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Channel", "Cycle", "Last payout", "Next payout", "When", "Pending", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {projected.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.cycleDays}d</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.lastPayout}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.next}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.daysAway <= 0 ? "bg-green-950/30 text-green-400" : r.daysAway <= 3 ? "bg-yellow-950/30 text-yellow-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                          {r.daysAway <= 0 ? "Due / overdue" : r.daysAway === 1 ? "Tomorrow" : `${r.daysAway}d`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-yellow-400">{formatCurrency(r.pendingAmount)}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
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

// ── #6 TCS u/s 52 on marketplace sales ─────────────────────────────────────────
type TcsRow = { id: string; operator: string; netTaxableSales: number; tcsCollected: number; month: string; reconciled: boolean };

function Tcs52Tracker() {
  const [rows, setRows] = useFeatureState<TcsRow[]>("mkt-tcs52", []);
  const [operator, setOperator] = useState<Channel>("Amazon");
  const [sales, setSales] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const TCS_RATE = 0.5 + 0.5; // 0.5% CGST + 0.5% SGST = 1% (or 1% IGST) under Sec 52
  const expectedTcs = (parseFloat(sales) || 0) * TCS_RATE / 100;

  const add = () => {
    const s = parseFloat(sales) || 0;
    if (s <= 0) { toast.error("Enter the net taxable marketplace sales"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), operator, netTaxableSales: s, tcsCollected: Math.round(s * TCS_RATE / 100), month, reconciled: false }]);
    setSales("");
    toast.success("TCS entry added");
  };

  const totalSales = rows.reduce((s, r) => s + r.netTaxableSales, 0);
  const totalTcs = rows.reduce((s, r) => s + r.tcsCollected, 0);
  const claimable = rows.filter(r => r.reconciled).reduce((s, r) => s + r.tcsCollected, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> TCS u/s 52 — Marketplace Sales</h2>
        <p className="text-xs text-[var(--color-muted)]">E-commerce operators deduct 1% TCS on your net taxable supplies (Sec 52, CGST Act) and file it in GSTR-8. Reconcile each month so you claim it as a credit in your electronic cash ledger.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Operator</label>
            <select value={operator} onChange={e => setOperator(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Net taxable sales (₹)</label><input type="number" value={sales} onChange={e => setSales(e.target.value)} placeholder="500000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Month</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2.5 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
        {parseFloat(sales) > 0 && <p className="text-xs text-[var(--color-muted)]">TCS @ 1% = <span className="font-semibold text-[var(--color-primary)]">{formatCurrency(Math.round(expectedTcs))}</span></p>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Net taxable sales</p><p className="text-lg font-bold tabular-nums">{formatCurrency(Math.round(totalSales))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">TCS collected (1%)</p><p className="text-lg font-bold tabular-nums text-purple-400">{formatCurrency(Math.round(totalTcs))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Reconciled / claimable</p><p className="text-lg font-bold tabular-nums text-green-400">{formatCurrency(Math.round(claimable))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Operator", "Month", "Net sales", "TCS @1%", "GSTR-8 matched", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.operator}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.month}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.netTaxableSales)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-purple-400 font-semibold">{formatCurrency(r.tcsCollected)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setRows(rows.map(x => x.id === r.id ? { ...x, reconciled: !x.reconciled } : x))}
                          className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.reconciled ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                          {r.reconciled ? "Matched" : "Unmatched"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">TCS is 1% of net taxable supplies (gross supplies less returns). Mark a month "Matched" once it appears in your GSTR-2B/GSTR-8 auto-draft, then claim it in your cash ledger.</p>
        </>
      )}
    </div>
  );
}

// ── #7 Listing P&L per SKU ─────────────────────────────────────────────────────
type SkuRow = { id: string; sku: string; channel: Channel; price: number; cogs: number; feesPct: number; adPerUnit: number; shipping: number; returnPct: number; unitsSold: number };

function skuNet(s: SkuRow): number {
  const fees = s.price * s.feesPct / 100;
  const returnCost = s.price * (s.returnPct / 100) * 0.5; // half the return value bleeds (freight + write-down proxy)
  return s.price - s.cogs - fees - s.adPerUnit - s.shipping - returnCost;
}

function SkuPnL() {
  const [rows, setRows] = useFeatureState<SkuRow[]>("mkt-sku-rows", []);
  const [sku, setSku] = useState("");
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [price, setPrice] = useState("");
  const [cogs, setCogs] = useState("");
  const [feesPct, setFeesPct] = useState("18");
  const [ad, setAd] = useState("");
  const [shipping, setShipping] = useState("");
  const [returnPct, setReturnPct] = useState("5");
  const [units, setUnits] = useState("");

  const add = () => {
    const p = parseFloat(price) || 0;
    if (!sku.trim() || p <= 0) { toast.error("Enter a SKU and selling price"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), sku: sku.trim(), channel, price: p, cogs: parseFloat(cogs) || 0,
      feesPct: parseFloat(feesPct) || 0, adPerUnit: parseFloat(ad) || 0, shipping: parseFloat(shipping) || 0,
      returnPct: parseFloat(returnPct) || 0, unitsSold: Math.round(parseFloat(units) || 0),
    }]);
    setSku(""); setPrice(""); setCogs(""); setAd(""); setShipping(""); setUnits("");
    toast.success("SKU added");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Tag size={14} className="text-[var(--color-primary)]" /> Listing P&L per SKU</h2>
        <p className="text-xs text-[var(--color-muted)]">True net margin per SKU after platform fees, ads, shipping and a return-rate provision. Anything below the line is selling at a loss.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">SKU</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="MUG-CER-01" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label><select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Price (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="499" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">COGS (₹)</label><input type="number" value={cogs} onChange={e => setCogs(e.target.value)} placeholder="180" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Fees %</label><input type="number" value={feesPct} onChange={e => setFeesPct(e.target.value)} placeholder="18" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Ad / unit (₹)</label><input type="number" value={ad} onChange={e => setAd(e.target.value)} placeholder="20" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Shipping (₹)</label><input type="number" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="55" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Return rate %</label><input type="number" value={returnPct} onChange={e => setReturnPct(e.target.value)} placeholder="5" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Units sold</label><input type="number" value={units} onChange={e => setUnits(e.target.value)} placeholder="120" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add SKU</button>
      </div>

      {rows.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["SKU", "Channel", "Price", "Net / unit", "Margin %", "Units", "Total profit", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const netUnit = skuNet(r);
                  const marginPct = r.price > 0 ? (netUnit / r.price) * 100 : 0;
                  const total = netUnit * r.unitsSold;
                  return (
                    <tr key={r.id} className={`hover:bg-white/2 ${netUnit < 0 ? "bg-red-950/15" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-xs">{r.sku}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.channel}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.price)}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${netUnit >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(netUnit))}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${marginPct >= 0 ? "text-[var(--color-text)]" : "text-red-400"}`}>{marginPct.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.unitsSold}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${total >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(total))}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rows.length > 0 && <p className="text-[10px] text-[var(--color-muted)]">Net/unit = price − COGS − fees − ad − shipping − return provision (half of return-rate × price). Negative rows are highlighted: reprice, cut ad spend, or delist.</p>}
    </div>
  );
}

// ── #8 Channel profitability compare ───────────────────────────────────────────
function ChannelCompare() {
  const [rows] = useFeatureState<ChannelSales[]>("mkt-channel-sales", []);

  const evaluated = rows.map(r => {
    const net = r.grossSales - r.fees - r.returns;
    const marginPct = r.grossSales > 0 ? (net / r.grossSales) * 100 : 0;
    const feeLoad = r.grossSales > 0 ? (r.fees / r.grossSales) * 100 : 0;
    const aov = r.orders > 0 ? r.grossSales / r.orders : 0;
    return { ...r, net, marginPct, feeLoad, aov };
  }).sort((a, b) => b.marginPct - a.marginPct);

  const best = evaluated[0] ?? null;
  const worst = evaluated.length > 1 ? evaluated[evaluated.length - 1] : null;
  const maxMargin = Math.max(1, ...evaluated.map(e => Math.abs(e.marginPct)));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Channel Profitability Compare</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">Ranks channels by net margin % using the figures you entered in the Sales Consolidator — so you push volume to the channels that actually pay.</p>
      </div>

      {evaluated.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg p-8 text-center">
          <Layers size={22} className="mx-auto text-[var(--color-muted)] mb-2" />
          <p className="text-sm font-medium mb-1">No channel data yet</p>
          <p className="text-xs text-[var(--color-muted)]">Add channels in the Sales Consolidator tab — they will appear here ranked by margin.</p>
        </div>
      ) : (
        <>
          {best && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
                <p className="text-sm font-bold text-green-400 flex items-center gap-2"><TrendingUp size={14} /> Best margin: {best.channel} at {best.marginPct.toFixed(1)}% net</p>
              </div>
              {worst && worst.id !== best.id && (
                <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
                  <p className="text-sm font-bold text-red-400 flex items-center gap-2"><TrendingDown size={14} /> Weakest: {worst.channel} at {worst.marginPct.toFixed(1)}% — review fees or shift volume away</p>
                </div>
              )}
            </div>
          )}
          <div className={`${CARD} p-5 space-y-3`}>
            {evaluated.map(e => (
              <div key={e.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{e.channel}</span>
                  <span className="text-[var(--color-muted)]">Net {formatCurrency(Math.round(e.net))} · fee load {e.feeLoad.toFixed(1)}% · AOV {formatCurrency(Math.round(e.aov))}</span>
                </div>
                <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (Math.abs(e.marginPct) / maxMargin) * 100)}%`, background: e.marginPct >= 0 ? "#22c55e" : "#ef4444" }} />
                </div>
                <p className={`text-[11px] mt-0.5 tabular-nums ${e.marginPct >= 0 ? "text-green-400" : "text-red-400"}`}>{e.marginPct.toFixed(1)}% net margin</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── #9 ONDC readiness checklist ────────────────────────────────────────────────
const ONDC_STEPS: { id: string; label: string; detail: string }[] = [
  { id: "gst", label: "Active GST registration", detail: "ONDC seller apps require a valid GSTIN for taxable supplies." },
  { id: "pan", label: "Business PAN & bank account", detail: "Settlement happens to a verified business bank account." },
  { id: "catalog", label: "Catalog with HSN & GST rates", detail: "Each SKU needs title, image, price, HSN code and GST rate." },
  { id: "fssai", label: "FSSAI licence (if food)", detail: "Mandatory for any food / grocery category seller." },
  { id: "seller-app", label: "Onboarded to an ONDC seller app", detail: "Pick a seller-side app (e.g. SellerApp, eSamudaay, Mystore)." },
  { id: "logistics", label: "Logistics / shipping configured", detail: "Either self-ship or an ONDC logistics provider linked." },
  { id: "returns", label: "Return & cancellation policy set", detail: "ONDC requires a published returns/cancellation policy." },
  { id: "pricing", label: "Floor-price / margin guardrails", detail: "Set minimum prices so ONDC discovery never sells below cost." },
];

function OndcReadiness() {
  const [done, setDone] = useFeatureState<string[]>("mkt-ondc-checklist", []);
  const completed = ONDC_STEPS.filter(s => done.includes(s.id)).length;
  const pct = Math.round((completed / ONDC_STEPS.length) * 100);

  const toggle = (id: string) => setDone(done.includes(id) ? done.filter(x => x !== id) : [...done, id]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> ONDC Readiness Checklist</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1 mb-3">Open Network for Digital Commerce lets you sell across buyer apps (Paytm, PhonePe) from one catalog. Tick off each step to go live as a seller node.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : "#3b82f6" }} />
          </div>
          <span className={`text-sm font-bold tabular-nums ${pct === 100 ? "text-green-400" : "text-blue-400"}`}>{pct}%</span>
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {ONDC_STEPS.map(s => {
          const isDone = done.includes(s.id);
          return (
            <button key={s.id} onClick={() => toggle(s.id)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/2">
              <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center ${isDone ? "bg-green-500 border-green-500" : "border-[var(--color-border)]"}`}>
                {isDone && <CheckCircle2 size={12} className="text-[var(--color-bg)]" />}
              </span>
              <span className="flex-1">
                <p className={`text-sm font-medium ${isDone ? "line-through text-[var(--color-muted)]" : ""}`}>{s.label}</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{s.detail}</p>
              </span>
            </button>
          );
        })}
      </div>

      {pct === 100 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400 flex items-center gap-2"><CheckCircle2 size={14} /> You are ONDC-ready — reach out to your chosen seller app to publish your catalog to the network.</p>
        </div>
      )}
    </div>
  );
}

// ── #10 Ad-spend ROAS calculator ───────────────────────────────────────────────
function RoasCalculator() {
  const [adSpend, setAdSpend] = useState("");
  const [adSales, setAdSales] = useState("");
  const [grossMarginPct, setGrossMarginPct] = useState("30");

  const spend = parseFloat(adSpend) || 0;
  const sales = parseFloat(adSales) || 0;
  const gm = parseFloat(grossMarginPct) || 0;

  const roas = spend > 0 ? sales / spend : 0;
  const acos = sales > 0 ? (spend / sales) * 100 : 0;
  const breakEvenAcos = gm; // you can spend up to your gross margin % on ads before the ad-driven sale loses money
  const marginAfterAd = sales * (gm / 100) - spend;
  const profitable = acos > 0 && acos <= breakEvenAcos;

  return (
    <div className="space-y-4 max-w-xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Megaphone size={14} className="text-[var(--color-primary)]" /> Ad-spend ROAS Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">For Amazon/Flipkart PPC: ROAS = ad sales ÷ ad spend, ACoS = spend ÷ sales. Your break-even ACoS equals your gross margin % — spend more than that and the ad-driven order loses money.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Ad spend (₹)</label><input type="number" value={adSpend} onChange={e => setAdSpend(e.target.value)} placeholder="15000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Sales from ads (₹)</label><input type="number" value={adSales} onChange={e => setAdSales(e.target.value)} placeholder="75000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Gross margin %</label><input type="number" value={grossMarginPct} onChange={e => setGrossMarginPct(e.target.value)} placeholder="30" className={INP} /></div>
        </div>
      </div>

      {spend > 0 && sales > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "ROAS", value: `${roas.toFixed(2)}x`, color: "text-[var(--color-text)]" },
              { label: "ACoS", value: `${acos.toFixed(1)}%`, color: profitable ? "text-green-400" : "text-red-400" },
              { label: "Break-even ACoS", value: `${breakEvenAcos.toFixed(1)}%`, color: "text-blue-400" },
              { label: "Profit after ad", value: formatCurrency(Math.round(marginAfterAd)), color: marginAfterAd >= 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${profitable ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
            <p className={`text-sm font-bold flex items-center gap-2 ${profitable ? "text-green-400" : "text-red-400"}`}>
              {profitable ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {profitable
                ? `Profitable: ACoS ${acos.toFixed(1)}% is within your ${breakEvenAcos.toFixed(1)}% break-even — keep scaling while it holds.`
                : `Loss-making: ACoS ${acos.toFixed(1)}% exceeds your ${breakEvenAcos.toFixed(1)}% break-even — cut bids or improve conversion before spending more.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
