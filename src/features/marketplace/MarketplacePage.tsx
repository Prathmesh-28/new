import { useMemo, useRef, useState } from "react";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  ShoppingCart, FileSpreadsheet, Calculator, Undo2, Layers, CalendarClock,
  Receipt, Tag, GitCompareArrows, ClipboardCheck, Megaphone,
  Plus, AlertTriangle, CheckCircle2, TrendingDown, TrendingUp,
  Crosshair, Boxes, Warehouse, PieChart, RefreshCw, Star,
  FileCheck, RotateCcw, ListChecks, Wallet,
  Trophy, Lock, ShieldAlert, Package, Scale, PartyPopper, Hourglass,
  Ticket, MousePointerClick, PackageX, ScrollText,
  MapPin, Banknote, CreditCard, MinusCircle, Rocket,
  Upload, Database, Link2,
} from "lucide-react";
import { toast } from "sonner";

// Reused TaxPage input class string.
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type MktTab =
  | "overview" | "settlement" | "commission" | "rto" | "consolidate"
  | "payout-cycle" | "tcs52" | "sku-pnl" | "channel-compare" | "ondc-ready" | "roas"
  | "target-price" | "inventory-sync" | "fba-fees" | "ppc-budget" | "repricer"
  | "reviews" | "gstr8-recon" | "refund-cost" | "listing-quality" | "cod-mix"
  | "buy-box" | "reserve" | "chargeback" | "bundle" | "break-even" | "festival" | "holding-cost"
  | "promo-roi" | "conversion" | "return-rate" | "fee-recon"
  | "place-of-supply" | "cod-remit" | "gateway-fee" | "neg-balance" | "channel-roi";

const CHANNELS = ["Amazon", "Flipkart", "Meesho", "ONDC", "D2C / Shopify"] as const;
type Channel = typeof CHANNELS[number];

// ── SHARED imported-settlement bucket ──────────────────────────────────────────
// One source of truth for settlement-report rows that the Consolidator, Payout
// Calendar and Cash-Cycle tabs all read from — so the same channel totals are
// never re-keyed across three tabs. Manual entry remains a fallback everywhere.
type ImportedSettlement = {
  id: string;
  channel: Channel;
  settlementId: string;
  gross: number;
  fees: number;
  net: number;
  date: string; // YYYY-MM-DD (best-effort), or "" if unparseable
};

const IMPORTED_KEY = "mkt-imported-settlements";

// Quote-aware CSV row splitter (mirrors TransactionImportModal's parseCSV).
function splitCsvRows(text: string): string[][] {
  return text.trim().split(/\r?\n/).map(line => {
    const cols: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === "," && !inQuotes) { cols.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function normNum(v: string | undefined): number {
  const n = Number((v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Best-effort date normaliser → YYYY-MM-DD (handles DD/MM/YYYY, DD-MM-YY, ISO).
function normDate(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}[-/]\d{2}[-/]\d{4}/.test(s)) {
    const [d, m, y] = s.slice(0, 10).split(/[-/]/);
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}[-/]\d{2}[-/]\d{2}$/.test(s)) {
    const [d, m, y] = s.split(/[-/]/);
    return `20${y}-${m}-${d}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

// Auto-map marketplace settlement-export columns by fuzzy header match.
// Amazon/Flipkart/Meesho all differ; we match on keywords, not fixed positions.
function parseImportedSettlementCsv(text: string, fallbackChannel: Channel): { rows: ImportedSettlement[]; skipped: number; mapped: Record<string, number> } {
  const all = splitCsvRows(text).filter(r => r.some(c => c.length > 0));
  if (all.length < 2) return { rows: [], skipped: 0, mapped: {} };
  const header = all[0].map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const find = (re: RegExp) => header.findIndex(h => re.test(h));

  const idIdx = find(/settlement|transaction|order[-_]?id|order_item|sub_?order|orderid|invoice/);
  const grossIdx = find(/gross|order[-_]?value|invoice[-_]?amount|item[-_]?total|product[-_]?amount|total[-_]?sale|principal|mrp/);
  const feeIdx = find(/fee|commission|charge|deduction|tcs|tds|expense/);
  const netIdx = find(/net|settle?ment[-_]?value|payout|amount[-_]?paid|final[-_]?settlement|order[-_]?settlement|disbursal/);
  const chIdx = find(/channel|marketplace|platform|source/);
  const dateIdx = find(/date|settled_on|settlement_date|payment_date|order_date/);

  // Need at least one money column we can anchor on.
  if (grossIdx === -1 && netIdx === -1) {
    return { rows: [], skipped: all.length - 1, mapped: {} };
  }

  const rows: ImportedSettlement[] = [];
  let skipped = 0;
  all.slice(1).forEach((cols, i) => {
    const gross = grossIdx >= 0 ? normNum(cols[grossIdx]) : 0;
    const fees = feeIdx >= 0 ? Math.abs(normNum(cols[feeIdx])) : 0;
    let net = netIdx >= 0 ? normNum(cols[netIdx]) : 0;
    if (netIdx === -1) net = gross - fees;          // derive net if not exported
    const grossResolved = grossIdx === -1 ? net + fees : gross; // derive gross if not exported
    if (grossResolved === 0 && net === 0) { skipped++; return; }

    let channel = fallbackChannel;
    if (chIdx >= 0) {
      const raw = (cols[chIdx] || "").toLowerCase();
      const match = CHANNELS.find(c => raw.includes(c.toLowerCase().split(" ")[0]));
      if (match) channel = match;
    }

    rows.push({
      id: crypto.randomUUID(),
      channel,
      settlementId: (idIdx >= 0 ? cols[idIdx] : "") || `row-${i + 2}`,
      gross: grossResolved,
      fees,
      net,
      date: dateIdx >= 0 ? normDate(cols[dateIdx]) : "",
    });
  });

  return {
    rows,
    skipped,
    mapped: {
      settlementId: idIdx, gross: grossIdx, fees: feeIdx, net: netIdx, channel: chIdx, date: dateIdx,
    },
  };
}

// Per-channel rollup derived from the shared imported rows.
type ImportedChannelTotal = { channel: Channel; orders: number; gross: number; fees: number; net: number; firstDate: string; lastDate: string };

function rollupImported(rows: ImportedSettlement[]): { byChannel: ImportedChannelTotal[]; gross: number; fees: number; net: number } {
  const acc: Record<string, ImportedChannelTotal> = {};
  for (const r of rows) {
    const k = r.channel;
    if (!acc[k]) acc[k] = { channel: r.channel, orders: 0, gross: 0, fees: 0, net: 0, firstDate: r.date, lastDate: r.date };
    const a = acc[k];
    a.orders += 1;
    a.gross += r.gross;
    a.fees += r.fees;
    a.net += r.net;
    if (r.date) {
      if (!a.firstDate || r.date < a.firstDate) a.firstDate = r.date;
      if (!a.lastDate || r.date > a.lastDate) a.lastDate = r.date;
    }
  }
  const byChannel = CHANNELS.map(c => acc[c]).filter(Boolean) as ImportedChannelTotal[];
  return {
    byChannel,
    gross: byChannel.reduce((s, r) => s + r.gross, 0),
    fees: byChannel.reduce((s, r) => s + r.fees, 0),
    net: byChannel.reduce((s, r) => s + r.net, 0),
  };
}

// Reusable uploader card. Lives in the Consolidator but its parsed rows feed all
// three tabs via the shared IMPORTED_KEY bucket. Wrapped in try/catch + toast.
function SettlementImportCard({ compact }: { compact?: boolean }) {
  const [rows, setRows] = useFeatureState<ImportedSettlement[]>(IMPORTED_KEY, []);
  const [defaultChannel, setDefaultChannel] = useState<Channel>("Amazon");
  const [lastMap, setLastMap] = useState<Record<string, number> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ingest = (text: string) => {
    try {
      const { rows: parsed, skipped, mapped } = parseImportedSettlementCsv(text, defaultChannel);
      if (parsed.length === 0) {
        toast.error("No rows mapped. Need at least a gross/order-value or a net/settlement column.");
        return;
      }
      setRows(prev => [...prev, ...parsed]);
      setLastMap(mapped);
      toast.success(`Imported ${parsed.length} settlement row(s)${skipped ? `, skipped ${skipped}` : ""} — shared across Consolidator, Payout & Cash-Cycle`);
    } catch (err) {
      toast.error("Could not parse that CSV. Check it is a settlement export.");
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = ev => ingest((ev.target?.result as string) || "");
    reader.onerror = () => toast.error("Could not read that file");
    reader.readAsText(file);
  };

  const roll = useMemo(() => rollupImported(rows), [rows]);

  return (
    <div className={`${CARD} p-5 space-y-3 border-[var(--color-primary)]/30`}>
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Database size={14} className="text-[var(--color-primary)]" /> Import settlement report (CSV)
        <span className="ml-auto text-[10px] font-normal text-[var(--color-muted)] flex items-center gap-1"><Link2 size={11} /> shared across 3 tabs</span>
      </h2>
      <p className="text-xs text-[var(--color-muted)]">
        Upload the settlement export from Amazon, Flipkart or Meesho. Columns are auto-mapped by header
        (settlement/order id, gross/order-value, fees/commission, net/payout, date) — no fixed format needed.
        One import feeds the Sales Consolidator, Payout Calendar and Cash-Cycle tabs at once.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Default channel (if CSV has no channel column)</label>
          <select value={defaultChannel} onChange={e => setDefaultChannel(e.target.value as Channel)} className={INP}>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2.5 text-sm font-medium">
          <Upload size={13} /> Upload settlement CSV
        </button>
        {rows.length > 0 && (
          <button onClick={() => { setRows([]); setLastMap(null); toast.success("Cleared imported settlements"); }}
            className="text-xs text-[var(--color-muted)] hover:text-red-400 px-2">Clear imported</button>
        )}
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
      </div>

      {lastMap && (
        <p className="text-[10px] text-[var(--color-muted)]">
          Auto-mapped columns:{" "}
          {Object.entries(lastMap).map(([k, v]) => `${k}${v >= 0 ? `→#${v + 1}` : "→(derived)"}`).join("  ·  ")}
        </p>
      )}

      {rows.length > 0 && !compact && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <p className="text-[11px] text-[var(--color-muted)] mb-2">
            {rows.length} imported row(s) · gross {formatCurrency(Math.round(roll.gross))} · fees {formatCurrency(Math.round(roll.fees))} · net {formatCurrency(Math.round(roll.net))}
          </p>
          <div className="flex flex-wrap gap-2">
            {roll.byChannel.map(c => (
              <span key={c.channel} className="text-[11px] px-2 py-1 rounded bg-[var(--color-accent)] text-[var(--color-muted)]">
                {c.channel}: {c.orders} · net {formatCurrency(Math.round(c.net))}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact read-only banner reused by Payout Calendar & Cash-Cycle so they show
// (and use) the imported totals without re-keying. Returns null when empty.
function ImportedTotalsBanner({ note }: { note: string }) {
  const [rows] = useFeatureState<ImportedSettlement[]>(IMPORTED_KEY, []);
  const roll = useMemo(() => rollupImported(rows), [rows]);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-4 py-3">
      <p className="text-xs font-medium flex items-center gap-1.5 mb-1"><Database size={12} className="text-[var(--color-primary)]" /> Using imported settlement data ({rows.length} rows)</p>
      <p className="text-[11px] text-[var(--color-muted)]">{note}</p>
      <div className="flex flex-wrap gap-2 mt-2">
        {roll.byChannel.map(c => (
          <span key={c.channel} className="text-[11px] px-2 py-1 rounded bg-[var(--color-accent)] text-[var(--color-muted)]">
            {c.channel}: net {formatCurrency(Math.round(c.net))}
          </span>
        ))}
      </div>
    </div>
  );
}

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
            ["target-price", "Target-Margin Price", Crosshair],
            ["inventory-sync", "Inventory Sync", Boxes],
            ["fba-fees", "FBA Fee Estimator", Warehouse],
            ["ppc-budget", "PPC Allocator", PieChart],
            ["repricer", "Repricing Sim", RefreshCw],
            ["reviews", "Rating Tracker", Star],
            ["gstr8-recon", "GSTR-8 Recon", FileCheck],
            ["refund-cost", "Refund Cost", RotateCcw],
            ["listing-quality", "Listing Quality", ListChecks],
            ["cod-mix", "COD vs Prepaid", Wallet],
            ["buy-box", "Buy-Box Win Rate", Trophy],
            ["reserve", "Reserve Release", Lock],
            ["chargeback", "Chargeback Ledger", ShieldAlert],
            ["bundle", "Bundle COGS", Package],
            ["break-even", "Break-even Price", Scale],
            ["festival", "Festival Planner", PartyPopper],
            ["holding-cost", "Cash-Cycle Cost", Hourglass],
            ["promo-roi", "Coupon ROI", Ticket],
            ["conversion", "Conversion Tracker", MousePointerClick],
            ["return-rate", "Return Rate / SKU", PackageX],
            ["fee-recon", "Fee Reconciliation", ScrollText],
            ["place-of-supply", "Place of Supply", MapPin],
            ["cod-remit", "COD Remittance", Banknote],
            ["gateway-fee", "Gateway Fee Recon", CreditCard],
            ["neg-balance", "Negative Balance", MinusCircle],
            ["channel-roi", "Channel-add ROI", Rocket],
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
      {tab === "target-price" && <TargetMarginPricer />}
      {tab === "inventory-sync" && <InventorySync />}
      {tab === "fba-fees" && <FbaFeeEstimator />}
      {tab === "ppc-budget" && <PpcBudgetAllocator />}
      {tab === "repricer" && <RepricingSimulator />}
      {tab === "reviews" && <RatingTracker />}
      {tab === "gstr8-recon" && <Gstr8Recon />}
      {tab === "refund-cost" && <RefundCostTracker />}
      {tab === "listing-quality" && <ListingQuality />}
      {tab === "cod-mix" && <CodMixAnalyzer />}
      {tab === "buy-box" && <BuyBoxTracker />}
      {tab === "reserve" && <ReserveReleaseTracker />}
      {tab === "chargeback" && <ChargebackLedger />}
      {tab === "bundle" && <BundleCogsSplitter />}
      {tab === "break-even" && <BreakEvenCalculator />}
      {tab === "festival" && <FestivalPlanner />}
      {tab === "holding-cost" && <HoldingCostCalculator />}
      {tab === "promo-roi" && <CouponRoi />}
      {tab === "conversion" && <ConversionTracker />}
      {tab === "return-rate" && <ReturnRateBySku />}
      {tab === "fee-recon" && <FeeReconciliation />}
      {tab === "place-of-supply" && <PlaceOfSupplyResolver />}
      {tab === "cod-remit" && <CodRemittanceTracker />}
      {tab === "gateway-fee" && <GatewayFeeRecon />}
      {tab === "neg-balance" && <NegativeBalanceTracker />}
      {tab === "channel-roi" && <ChannelAddRoi />}
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

// A consolidated row can come from an imported settlement file or manual entry.
type ConsolidatedRow = ChannelSales & { source: "imported" | "manual" };

function SalesConsolidator() {
  const [rows, setRows] = useFeatureState<ChannelSales[]>("mkt-channel-sales", []);
  const [imported] = useFeatureState<ImportedSettlement[]>(IMPORTED_KEY, []);
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

  // Merge: imported channel totals are authoritative; manual rows fill any
  // channel not present in the import, so the same totals are never re-keyed.
  const merged = useMemo<ConsolidatedRow[]>(() => {
    const roll = rollupImported(imported);
    const importedChannels = new Set<string>();
    const out: ConsolidatedRow[] = roll.byChannel.map(c => {
      importedChannels.add(c.channel);
      return {
        id: `imp-${c.channel}`, channel: c.channel, orders: c.orders,
        grossSales: c.gross, fees: c.fees, returns: 0, source: "imported",
      };
    });
    for (const r of rows) {
      if (importedChannels.has(r.channel)) continue;
      out.push({ ...r, source: "manual" });
    }
    return out;
  }, [imported, rows]);

  const net = (r: ChannelSales) => r.grossSales - r.fees - r.returns;
  const totGross = merged.reduce((s, r) => s + r.grossSales, 0);
  const totFees = merged.reduce((s, r) => s + r.fees, 0);
  const totReturns = merged.reduce((s, r) => s + r.returns, 0);
  const totNet = merged.reduce((s, r) => s + net(r), 0);
  const totOrders = merged.reduce((s, r) => s + r.orders, 0);

  return (
    <div className="space-y-4">
      <SettlementImportCard />
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Multi-channel Sales Consolidator</h2>
        <p className="text-xs text-[var(--color-muted)]">Imported settlement channels feed this view automatically. Use the manual form below to add channels you didn't import (re-adding a channel overwrites its manual row).</p>
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

      {merged.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total gross sales</p><p className="text-xl font-bold tabular-nums">{formatCurrency(Math.round(totGross))}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">{totOrders} orders</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total fees</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totFees))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total returns</p><p className="text-xl font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(totReturns))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Net revenue</p><p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(totNet))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Channel", "Source", "Orders", "Gross", "Fees", "Returns", "Net", "Mix %", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {merged.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.source === "imported" ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{r.source === "imported" ? "Imported" : "Manual"}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{r.orders}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.grossSales)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(r.fees)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(r.returns)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(Math.round(net(r)))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{totNet > 0 ? `${Math.round((net(r) / totNet) * 100)}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.source === "manual"
                          ? <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
                          : <span className="text-[10px] text-[var(--color-muted)]">CSV</span>}
                      </td>
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

const DEFAULT_CYCLE_DAYS: Record<string, number> = { "Amazon": 7, "Flipkart": 10, "Meesho": 15, "ONDC": 7, "D2C / Shopify": 2 };

function PayoutCalendar() {
  const [rows, setRows] = useFeatureState<PayoutCfg[]>("mkt-payout-cfg", []);
  const [imported] = useFeatureState<ImportedSettlement[]>(IMPORTED_KEY, []);
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

  // Build payout rows straight from the shared imported settlements: each
  // imported channel's net becomes the pending amount and its latest settlement
  // date becomes the "last payout" anchor — no re-keying.
  const prefillFromImport = () => {
    try {
      const roll = rollupImported(imported);
      if (roll.byChannel.length === 0) { toast.error("Import a settlement CSV first"); return; }
      setRows(prev => {
        const kept = prev.filter(r => !roll.byChannel.some(c => c.channel === r.channel));
        const fromImport: PayoutCfg[] = roll.byChannel.map(c => ({
          id: crypto.randomUUID(),
          channel: c.channel,
          cycleDays: DEFAULT_CYCLE_DAYS[c.channel] ?? 7,
          lastPayout: c.lastDate || today,
          pendingAmount: Math.round(c.net),
        }));
        return [...kept, ...fromImport];
      });
      toast.success(`Prefilled ${roll.byChannel.length} channel(s) from imported settlements`);
    } catch (err) {
      toast.error("Could not prefill from imported data");
    }
  };

  const projected = rows.map(r => {
    const next = addDaysISO(r.lastPayout, r.cycleDays);
    const daysAway = Math.ceil((new Date(next).getTime() - new Date(today).getTime()) / 86400000);
    return { ...r, next, daysAway };
  }).sort((a, b) => a.daysAway - b.daysAway);

  const totalPending = rows.reduce((s, r) => s + r.pendingAmount, 0);

  return (
    <div className="space-y-4">
      <ImportedTotalsBanner note="Click 'Prefill from imported' below to load each channel's pending amount (its imported net) and last-settlement date automatically." />
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Platform Payout Calendar</h2>
        <p className="text-xs text-[var(--color-muted)]">Each marketplace settles on its own cycle (Amazon ~7 days, Flipkart ~7–15). Prefill from your imported settlement file, or log a cycle and last payout manually to project when cash lands and how much is still locked.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Cycle (days)</label><input type="number" value={cycleDays} onChange={e => setCycleDays(e.target.value)} placeholder="7" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Last payout date</label><input type="date" value={lastPayout} onChange={e => setLastPayout(e.target.value)} className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Pending / unsettled (₹)</label><input type="number" value={pending} onChange={e => setPending(e.target.value)} placeholder="180000" className={INP} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add / update channel</button>
          {imported.length > 0 && (
            <button onClick={prefillFromImport} className="flex items-center gap-1.5 border border-[var(--color-primary)]/40 text-[var(--color-primary)] rounded-lg px-4 py-2 text-sm font-medium"><Database size={13} /> Prefill from imported</button>
          )}
        </div>
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

// ── #11 Target-margin pricer (back-solve listing price after commission) ────────
function TargetMarginPricer() {
  const [cogs, setCogs] = useState("");
  const [referralPct, setReferralPct] = useState("15");
  const [fixedFee, setFixedFee] = useState("25");
  const [shipping, setShipping] = useState("70");
  const [targetMarginPct, setTargetMarginPct] = useState("20");
  const [gstPct, setGstPct] = useState("18");

  const c = parseFloat(cogs) || 0;
  const ref = (parseFloat(referralPct) || 0) / 100;
  const fixed = parseFloat(fixedFee) || 0;
  const ship = parseFloat(shipping) || 0;
  const margin = (parseFloat(targetMarginPct) || 0) / 100;
  const gst = (parseFloat(gstPct) || 0) / 100;

  // Solve: price = cogs + ship + fixed + price*ref + price*margin
  // price*(1 - ref - margin) = cogs + ship + fixed  → price (pre-GST listing net of commission)
  const denom = 1 - ref - margin;
  const feasible = c > 0 && denom > 0;
  const basePrice = feasible ? (c + ship + fixed) / denom : 0; // net listing price before adding output GST
  const listPrice = basePrice * (1 + gst); // gross MRP the buyer pays (output GST added on top)
  const referralAmt = basePrice * ref;
  const profit = basePrice - c - ship - fixed - referralAmt;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Crosshair size={14} className="text-[var(--color-primary)]" /> Target-margin Pricer</h2>
        <p className="text-xs text-[var(--color-muted)]">Back-solve the listing price that still leaves your target net margin <em>after</em> the marketplace takes its referral cut, fixed fee and shipping. We add output GST on top to give the buyer-facing MRP.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ["COGS / landed cost (₹)", cogs, setCogs, "180"],
            ["Referral commission %", referralPct, setReferralPct, "15"],
            ["Fixed / closing fee (₹)", fixedFee, setFixedFee, "25"],
            ["Shipping / weight (₹)", shipping, setShipping, "70"],
            ["Target net margin %", targetMarginPct, setTargetMarginPct, "20"],
            ["Output GST %", gstPct, setGstPct, "18"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      {c > 0 && !feasible && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> Referral % + target margin % must be under 100% — at these inputs no price can hit the margin.</p>
        </div>
      )}

      {feasible && (
        <div className={`${CARD} p-5`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "List price (pre-GST)", value: formatCurrency(Math.round(basePrice)), color: "text-[var(--color-text)]" },
              { label: "Buyer MRP (incl. GST)", value: formatCurrency(Math.round(listPrice)), color: "text-[var(--color-primary)]" },
              { label: "Referral fee", value: formatCurrency(Math.round(referralAmt)), color: "text-red-400" },
              { label: "Net profit / unit", value: formatCurrency(Math.round(profit)), color: profit >= 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">Set your listing at <span className="font-semibold text-[var(--color-text)]">{formatCurrency(Math.round(listPrice))}</span> (GST-inclusive) to net {targetMarginPct || 0}% margin after fees. Round up to a clean price point for better conversion.</p>
        </div>
      )}
    </div>
  );
}

// ── #12 Inventory-across-channels sync sheet ───────────────────────────────────
type InvRow = { id: string; sku: string; warehouse: number; amazon: number; flipkart: number; meesho: number; ondc: number };

function InventorySync() {
  const [rows, setRows] = useFeatureState<InvRow[]>("mkt-inventory-sync", []);
  const [sku, setSku] = useState("");
  const [wh, setWh] = useState("");
  const [amz, setAmz] = useState("");
  const [flp, setFlp] = useState("");
  const [mee, setMee] = useState("");
  const [ond, setOnd] = useState("");

  const add = () => {
    if (!sku.trim()) { toast.error("Enter a SKU"); return; }
    const n = (v: string) => Math.max(0, Math.round(parseFloat(v) || 0));
    setRows(prev => [...prev.filter(r => r.sku.toLowerCase() !== sku.trim().toLowerCase()), {
      id: crypto.randomUUID(), sku: sku.trim(), warehouse: n(wh), amazon: n(amz), flipkart: n(flp), meesho: n(mee), ondc: n(ond),
    }]);
    setSku(""); setWh(""); setAmz(""); setFlp(""); setMee(""); setOnd("");
    toast.success("SKU stock saved");
  };

  const listed = (r: InvRow) => r.amazon + r.flipkart + r.meesho + r.ondc;
  const totalWh = rows.reduce((s, r) => s + r.warehouse, 0);
  const totalListed = rows.reduce((s, r) => s + listed(r), 0);
  const oversold = rows.filter(r => listed(r) > r.warehouse);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Inventory Sync Across Channels</h2>
        <p className="text-xs text-[var(--color-muted)]">Hold one physical stock count and the quantity you've listed on each channel. When listed exceeds warehouse, you risk overselling and a marketplace penalty — those rows flag red.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">SKU</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="MUG-01" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Warehouse</label><input type="number" value={wh} onChange={e => setWh(e.target.value)} placeholder="200" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Amazon</label><input type="number" value={amz} onChange={e => setAmz(e.target.value)} placeholder="80" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Flipkart</label><input type="number" value={flp} onChange={e => setFlp(e.target.value)} placeholder="60" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Meesho</label><input type="number" value={mee} onChange={e => setMee(e.target.value)} placeholder="40" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">ONDC</label><input type="number" value={ond} onChange={e => setOnd(e.target.value)} placeholder="20" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add / update SKU</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total in warehouse</p><p className="text-xl font-bold tabular-nums">{totalWh}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total listed (all channels)</p><p className="text-xl font-bold tabular-nums">{totalListed}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">SKUs at oversell risk</p><p className={`text-xl font-bold tabular-nums ${oversold.length ? "text-red-400" : "text-green-400"}`}>{oversold.length}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["SKU", "Warehouse", "Amazon", "Flipkart", "Meesho", "ONDC", "Listed", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const lst = listed(r);
                    const over = lst > r.warehouse;
                    return (
                      <tr key={r.id} className={`hover:bg-white/2 ${over ? "bg-red-950/15" : ""}`}>
                        <td className="px-4 py-2.5 font-medium text-xs">{r.sku}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.warehouse}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.amazon}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.flipkart}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.meesho}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.ondc}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold">{lst}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${over ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{over ? `Oversold ${lst - r.warehouse}` : "In sync"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
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

// ── #13 FBA / warehouse fee estimator ──────────────────────────────────────────
function FbaFeeEstimator() {
  const [weight, setWeight] = useState("0.5");
  const [length, setLength] = useState("25");
  const [width, setWidth] = useState("18");
  const [height, setHeight] = useState("5");
  const [pickPack, setPickPack] = useState("18");
  const [storageRate, setStorageRate] = useState("45"); // ₹ per cubic foot per month
  const [monthsStored, setMonthsStored] = useState("1");
  const [units, setUnits] = useState("100");

  const wt = parseFloat(weight) || 0;
  const l = parseFloat(length) || 0;
  const w = parseFloat(width) || 0;
  const h = parseFloat(height) || 0;
  const qty = Math.max(0, Math.round(parseFloat(units) || 0));

  // Volumetric weight (kg) ≈ (L×W×H cm) / 5000 — couriers bill the higher of actual vs volumetric.
  const volWeightKg = (l * w * h) / 5000;
  const billedWeight = Math.max(wt, volWeightKg);
  // Weight-handling proxy: ₹40 base for first 0.5kg + ₹20 per additional 0.5kg slab.
  const slabs = Math.max(0, Math.ceil((billedWeight - 0.5) / 0.5));
  const weightHandling = 40 + slabs * 20;
  const pick = parseFloat(pickPack) || 0;
  // Storage: volume in cubic feet (cm³ → ft³ ÷ 28316.8) × rate × months.
  const cubicFt = (l * w * h) / 28316.8;
  const storage = cubicFt * (parseFloat(storageRate) || 0) * (parseFloat(monthsStored) || 0);
  const perUnit = weightHandling + pick + storage;
  const totalFee = perUnit * qty;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Warehouse size={14} className="text-[var(--color-primary)]" /> FBA / Warehouse Fee Estimator</h2>
        <p className="text-xs text-[var(--color-muted)]">Estimate per-unit fulfilment cost: weight-handling (billed on the higher of actual vs volumetric weight), pick-and-pack, and monthly storage by volume. Rates are indicative — match to your latest rate card.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["Actual weight (kg)", weight, setWeight, "0.5"],
            ["Length (cm)", length, setLength, "25"],
            ["Width (cm)", width, setWidth, "18"],
            ["Height (cm)", height, setHeight, "5"],
            ["Pick & pack (₹)", pickPack, setPickPack, "18"],
            ["Storage ₹/cu.ft/mo", storageRate, setStorageRate, "45"],
            ["Months stored", monthsStored, setMonthsStored, "1"],
            ["Units", units, setUnits, "100"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-2`}>
        {[
          { label: "Volumetric weight", value: `${volWeightKg.toFixed(2)} kg`, color: "text-[var(--color-muted)]" },
          { label: "Billed weight (higher of)", value: `${billedWeight.toFixed(2)} kg`, color: "text-[var(--color-text)]" },
          { label: "Weight handling", value: formatCurrency(Math.round(weightHandling)), color: "text-red-400" },
          { label: "Pick & pack", value: formatCurrency(Math.round(pick)), color: "text-red-400" },
          { label: "Storage (per unit)", value: formatCurrency(Math.round(storage)), color: "text-red-400" },
          { label: "Fulfilment cost / unit", value: formatCurrency(Math.round(perUnit)), color: "text-orange-400 font-bold" },
          { label: `Total for ${qty} units`, value: formatCurrency(Math.round(totalFee)), color: "text-[var(--color-primary)] font-bold" },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
            <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
            <span className={`tabular-nums ${r.color}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #14 Ad / PPC budget allocator ──────────────────────────────────────────────
type PpcRow = { id: string; campaign: string; weight: number };

function PpcBudgetAllocator() {
  const [budget, setBudget] = useState("50000");
  const [rows, setRows] = useFeatureState<PpcRow[]>("mkt-ppc-rows", []);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  const add = () => {
    const w = parseFloat(weight) || 0;
    if (!name.trim() || w <= 0) { toast.error("Enter a campaign and weight"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), campaign: name.trim(), weight: w }]);
    setName(""); setWeight("");
    toast.success("Campaign added");
  };

  const total = parseFloat(budget) || 0;
  const sumWeight = rows.reduce((s, r) => s + r.weight, 0);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> PPC Budget Allocator</h2>
        <p className="text-xs text-[var(--color-muted)]">Split a total monthly ad budget across campaigns by weight (priority / expected ROI). Weights are relative — a campaign with weight 3 gets thrice the budget of one with weight 1.</p>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Total monthly ad budget (₹)</label>
          <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="50000" className={INP} />
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Campaign</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Sponsored Products — Mugs" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Weight</label><input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="3" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add campaign</button>
      </div>

      {rows.length > 0 && (
        <div className={`${CARD} p-5 space-y-3`}>
          {rows.map(r => {
            const share = sumWeight > 0 ? r.weight / sumWeight : 0;
            const alloc = total * share;
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-2">{r.campaign}
                    <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400">✕</button>
                  </span>
                  <span className="tabular-nums text-[var(--color-primary)] font-semibold">{formatCurrency(Math.round(alloc))} · {(share * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${share * 100}%` }} />
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-[var(--color-muted)] pt-1">Allocated {formatCurrency(Math.round(total))} across {rows.length} campaign(s). Re-check after a week and shift weight toward the lowest-ACoS campaigns.</p>
        </div>
      )}
    </div>
  );
}

// ── #15 Repricing simulator (margin-floor aware) ───────────────────────────────
function RepricingSimulator() {
  const [cogs, setCogs] = useState("180");
  const [feesPct, setFeesPct] = useState("18");
  const [currentPrice, setCurrentPrice] = useState("499");
  const [newPrice, setNewPrice] = useState("449");
  const [minMarginPct, setMinMarginPct] = useState("10");
  const [unitsAtCurrent, setUnitsAtCurrent] = useState("100");
  const [elasticity, setElasticity] = useState("1.5"); // % volume change per % price change

  const c = parseFloat(cogs) || 0;
  const fp = (parseFloat(feesPct) || 0) / 100;
  const cur = parseFloat(currentPrice) || 0;
  const nw = parseFloat(newPrice) || 0;
  const minM = (parseFloat(minMarginPct) || 0) / 100;
  const u0 = Math.max(0, Math.round(parseFloat(unitsAtCurrent) || 0));
  const e = parseFloat(elasticity) || 0;

  const netUnit = (p: number) => p - p * fp - c;
  const curNet = netUnit(cur);
  const newNet = netUnit(nw);
  // Floor price: smallest price where net margin ≥ minMargin% of price. p - p*fp - c ≥ minM*p → p(1-fp-minM) ≥ c
  const floorDenom = 1 - fp - minM;
  const floorPrice = floorDenom > 0 ? c / floorDenom : Infinity;
  const breachesFloor = nw > 0 && nw < floorPrice;

  // Demand response: % price change → % volume change via elasticity.
  const pricePct = cur > 0 ? (nw - cur) / cur : 0;
  const newUnits = Math.max(0, Math.round(u0 * (1 - pricePct * e)));
  const curProfit = curNet * u0;
  const newProfit = newNet * newUnits;
  const delta = newProfit - curProfit;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><RefreshCw size={14} className="text-[var(--color-primary)]" /> Repricing Simulator</h2>
        <p className="text-xs text-[var(--color-muted)]">Test a price change before you push it. We compute the margin floor (lowest price that still clears your minimum margin) and project total profit using a simple elasticity (% volume change per 1% price change).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["COGS (₹)", cogs, setCogs, "180"],
            ["Fees %", feesPct, setFeesPct, "18"],
            ["Current price (₹)", currentPrice, setCurrentPrice, "499"],
            ["New price (₹)", newPrice, setNewPrice, "449"],
            ["Min margin %", minMarginPct, setMinMarginPct, "10"],
            ["Units @ current", unitsAtCurrent, setUnitsAtCurrent, "100"],
            ["Elasticity", elasticity, setElasticity, "1.5"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
              <input type="number" value={val} onChange={e2 => setter(e2.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      <div className={`rounded-lg p-4 border ${breachesFloor ? "border-red-800/40 bg-red-950/20" : "border-blue-800/40 bg-blue-950/20"}`}>
        <p className={`text-sm font-bold flex items-center gap-2 ${breachesFloor ? "text-red-400" : "text-blue-400"}`}>
          {breachesFloor ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {floorDenom <= 0
            ? "Fees % + min margin % ≥ 100% — no floor price exists at these inputs."
            : breachesFloor
              ? `New price ${formatCurrency(Math.round(nw))} is below the margin floor of ${formatCurrency(Math.round(floorPrice))} — it breaches your ${minMarginPct || 0}% minimum.`
              : `Margin floor is ${formatCurrency(Math.round(floorPrice))}. The new price stays above it — safe to reprice.`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Net / unit (current)", value: formatCurrency(Math.round(curNet)), color: curNet >= 0 ? "text-[var(--color-text)]" : "text-red-400" },
          { label: "Net / unit (new)", value: formatCurrency(Math.round(newNet)), color: newNet >= 0 ? "text-[var(--color-text)]" : "text-red-400" },
          { label: "Projected units (new)", value: String(newUnits), color: "text-[var(--color-muted)]" },
          { label: "Profit change", value: `${delta >= 0 ? "+" : ""}${formatCurrency(Math.round(delta))}`, color: delta >= 0 ? "text-green-400" : "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #16 Review / rating tracker ────────────────────────────────────────────────
type ReviewRow = { id: string; sku: string; channel: Channel; rating: number; reviews: number };

function RatingTracker() {
  const [rows, setRows] = useFeatureState<ReviewRow[]>("mkt-review-rows", []);
  const [sku, setSku] = useState("");
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [rating, setRating] = useState("");
  const [reviews, setReviews] = useState("");

  const add = () => {
    const r = parseFloat(rating) || 0;
    if (!sku.trim() || r <= 0 || r > 5) { toast.error("Enter a SKU and rating (0–5)"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), sku: sku.trim(), channel, rating: r, reviews: Math.max(0, Math.round(parseFloat(reviews) || 0)) }]);
    setSku(""); setRating(""); setReviews("");
    toast.success("Listing rating added");
  };

  const totalReviews = rows.reduce((s, r) => s + r.reviews, 0);
  // Review-weighted average rating across all listings.
  const weighted = totalReviews > 0 ? rows.reduce((s, r) => s + r.rating * r.reviews, 0) / totalReviews : 0;
  const atRisk = rows.filter(r => r.rating < 4).length; // sub-4.0 listings risk buy-box / discoverability loss

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Star size={14} className="text-[var(--color-primary)]" /> Review / Rating Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Log each listing's star rating and review count per channel. A listing under 4.0 stars loses buy-box share and discoverability — those rows flag so you prioritise fixing them.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">SKU</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="MUG-01" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label><select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Rating (0–5)</label><input type="number" step="0.1" value={rating} onChange={e => setRating(e.target.value)} placeholder="4.2" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1"># Reviews</label><input type="number" value={reviews} onChange={e => setReviews(e.target.value)} placeholder="86" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add listing</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Weighted avg rating</p><p className={`text-xl font-bold tabular-nums ${weighted >= 4 ? "text-green-400" : "text-yellow-400"}`}>{weighted.toFixed(2)} ★</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total reviews</p><p className="text-xl font-bold tabular-nums">{totalReviews}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Listings below 4.0★</p><p className={`text-xl font-bold tabular-nums ${atRisk ? "text-red-400" : "text-green-400"}`}>{atRisk}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["SKU", "Channel", "Rating", "Reviews", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className={`hover:bg-white/2 ${r.rating < 4 ? "bg-red-950/15" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-xs">{r.sku}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.channel}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.rating >= 4 ? "text-green-400" : "text-red-400"}`}>{r.rating.toFixed(1)} ★</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.reviews}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.rating >= 4 ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"}`}>{r.rating >= 4 ? "Healthy" : "At risk"}</span>
                      </td>
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

// ── #17 GSTR-8 (TCS) reconciliation — operator-filed vs your books ─────────────
type Gstr8Row = { id: string; operator: Channel; month: string; tcsAsPerBooks: number; tcsInGstr8: number };

function Gstr8Recon() {
  const [rows, setRows] = useFeatureState<Gstr8Row[]>("mkt-gstr8-rows", []);
  const [operator, setOperator] = useState<Channel>("Amazon");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [books, setBooks] = useState("");
  const [filed, setFiled] = useState("");

  const add = () => {
    const b = parseFloat(books) || 0;
    if (b <= 0) { toast.error("Enter the TCS as per your books"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), operator, month, tcsAsPerBooks: b, tcsInGstr8: parseFloat(filed) || 0 }]);
    setBooks(""); setFiled("");
    toast.success("Reconciliation row added");
  };

  const diffOf = (r: Gstr8Row) => r.tcsInGstr8 - r.tcsAsPerBooks; // operator over/under-reported vs your books
  const totalBooks = rows.reduce((s, r) => s + r.tcsAsPerBooks, 0);
  const totalFiled = rows.reduce((s, r) => s + r.tcsInGstr8, 0);
  const mismatches = rows.filter(r => Math.abs(diffOf(r)) >= 1).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileCheck size={14} className="text-[var(--color-primary)]" /> GSTR-8 (TCS) Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)]">Operators file the 1% TCS they collected in GSTR-8, which flows to your GSTR-2B. Compare what each operator <em>filed</em> against the TCS in <em>your</em> books — any gap means a credit you can't claim, or one to chase the operator to correct.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Operator</label><select value={operator} onChange={e => setOperator(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Month</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">TCS per books (₹)</label><input type="number" value={books} onChange={e => setBooks(e.target.value)} placeholder="5000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">TCS in GSTR-8 (₹)</label><input type="number" value={filed} onChange={e => setFiled(e.target.value)} placeholder="4800" className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2.5 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">TCS per your books</p><p className="text-lg font-bold tabular-nums">{formatCurrency(Math.round(totalBooks))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">TCS filed in GSTR-8</p><p className="text-lg font-bold tabular-nums text-purple-400">{formatCurrency(Math.round(totalFiled))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Mismatched periods</p><p className={`text-lg font-bold tabular-nums ${mismatches ? "text-red-400" : "text-green-400"}`}>{mismatches}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Operator", "Month", "Per books", "In GSTR-8", "Gap", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const diff = diffOf(r);
                    const matched = Math.abs(diff) < 1;
                    return (
                      <tr key={r.id} className={`hover:bg-white/2 ${matched ? "" : "bg-red-950/15"}`}>
                        <td className="px-4 py-2.5 font-medium">{r.operator}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.month}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.tcsAsPerBooks)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-purple-400">{formatCurrency(r.tcsInGstr8)}</td>
                        <td className={`px-4 py-2.5 tabular-nums font-semibold ${matched ? "text-[var(--color-muted)]" : diff < 0 ? "text-red-400" : "text-yellow-400"}`}>{diff >= 0 ? "+" : ""}{formatCurrency(Math.round(diff))}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${matched ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-red-900/30 text-red-400 border-red-800/40"}`}>{matched ? "Matched" : diff < 0 ? "Under-reported" : "Over-reported"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">A negative gap means the operator under-reported TCS in GSTR-8 — raise it with them so the full credit reflects in your GSTR-2B before you file.</p>
        </>
      )}
    </div>
  );
}

// ── #18 Refund / replacement cost tracker ──────────────────────────────────────
type RefundRow = { id: string; sku: string; kind: "refund" | "returnless" | "replacement"; orderValue: number; refundAmt: number; replacementCogs: number; count: number };

function refundCostOf(r: RefundRow): number {
  // Refund: customer returns goods, you refund — net cost is the refunded amount you can't fully recover (proxy: refund - resaleable value handled elsewhere; here refund amount).
  // Returnless: you refund AND lose the goods → refund + COGS proxy (replacementCogs field doubles as lost-goods cost).
  // Replacement: you ship a new unit free → COGS of replacement + (any partial refund).
  const per = r.kind === "returnless"
    ? r.refundAmt + r.replacementCogs
    : r.kind === "replacement"
      ? r.replacementCogs + r.refundAmt
      : r.refundAmt;
  return per * r.count;
}

function RefundCostTracker() {
  const [rows, setRows] = useFeatureState<RefundRow[]>("mkt-refund-rows", []);
  const [sku, setSku] = useState("");
  const [kind, setKind] = useState<RefundRow["kind"]>("refund");
  const [orderValue, setOrderValue] = useState("");
  const [refundAmt, setRefundAmt] = useState("");
  const [replacementCogs, setReplacementCogs] = useState("");
  const [count, setCount] = useState("1");

  const add = () => {
    const ov = parseFloat(orderValue) || 0;
    if (!sku.trim() || ov <= 0) { toast.error("Enter a SKU and order value"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), sku: sku.trim(), kind, orderValue: ov,
      refundAmt: parseFloat(refundAmt) || 0, replacementCogs: parseFloat(replacementCogs) || 0,
      count: Math.max(1, Math.round(parseFloat(count) || 1)),
    }]);
    setSku(""); setOrderValue(""); setRefundAmt(""); setReplacementCogs("");
    toast.success("Refund event added");
  };

  const totalCost = rows.reduce((s, r) => s + refundCostOf(r), 0);
  const totalEvents = rows.reduce((s, r) => s + r.count, 0);
  const returnless = rows.filter(r => r.kind === "returnless").reduce((s, r) => s + refundCostOf(r), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><RotateCcw size={14} className="text-[var(--color-primary)]" /> Refund / Replacement Cost Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Separate from RTO freight: this tracks the cash cost of <em>refunds</em>, marketplace <em>returnless refunds</em> (you refund and lose the goods) and free <em>replacements</em> (you ship a new unit's COGS). Returnless refunds are the most abused — watch that total.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">SKU</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="MUG-01" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Type</label>
            <select value={kind} onChange={e => setKind(e.target.value as RefundRow["kind"])} className={INP}>
              <option value="refund">Refund (goods returned)</option>
              <option value="returnless">Returnless refund</option>
              <option value="replacement">Free replacement</option>
            </select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Order value (₹)</label><input type="number" value={orderValue} onChange={e => setOrderValue(e.target.value)} placeholder="499" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Refund amount (₹)</label><input type="number" value={refundAmt} onChange={e => setRefundAmt(e.target.value)} placeholder="499" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Lost-goods / replacement COGS (₹)</label><input type="number" value={replacementCogs} onChange={e => setReplacementCogs(e.target.value)} placeholder="180" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">No. of events</label><input type="number" value={count} onChange={e => setCount(e.target.value)} placeholder="1" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add refund event</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total refund / replacement cost</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totalCost))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Events</p><p className="text-xl font-bold tabular-nums">{totalEvents}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Returnless-refund cost</p><p className="text-xl font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(returnless))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["SKU", "Type", "Order ₹", "Refund ₹", "Lost/Repl COGS", "Events", "Cost", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{r.sku}</td>
                      <td className="px-4 py-2.5 text-xs uppercase">{r.kind}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.orderValue)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(r.refundAmt)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.replacementCogs)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-red-400">{formatCurrency(Math.round(refundCostOf(r)))}</td>
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

// ── #19 Listing-quality checklist (per-SKU score) ──────────────────────────────
const LISTING_CHECKS: { id: string; label: string; detail: string }[] = [
  { id: "title", label: "Keyword-rich title", detail: "Brand + product + key attribute, within the channel's character limit." },
  { id: "images", label: "7+ images incl. lifestyle", detail: "White-background main + lifestyle, infographic and scale shots." },
  { id: "bullets", label: "5 benefit-led bullet points", detail: "Lead with benefits, not specs; cover top buyer questions." },
  { id: "aplus", label: "A+ / enhanced content", detail: "A+ content (Amazon) or rich description lifts conversion." },
  { id: "video", label: "Product video", detail: "A short demo video reduces returns and boosts conversion." },
  { id: "hsn", label: "Correct HSN & GST rate", detail: "Right HSN avoids wrong tax heads and listing rejection." },
  { id: "backend", label: "Backend search terms filled", detail: "Hidden keywords improve discoverability without keyword-stuffing the title." },
  { id: "price", label: "Price within buy-box band", detail: "Competitive enough to win/share the buy box at a safe margin." },
];

function ListingQuality() {
  const [done, setDone] = useFeatureState<string[]>("mkt-listing-quality", []);
  const completed = LISTING_CHECKS.filter(s => done.includes(s.id)).length;
  const pct = Math.round((completed / LISTING_CHECKS.length) * 100);
  const toggle = (id: string) => setDone(done.includes(id) ? done.filter(x => x !== id) : [...done, id]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Listing-Quality Checklist</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1 mb-3">A complete listing converts better and ranks higher. Score a SKU against these eight levers before you spend on ads — a weak listing wastes ad budget.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : pct >= 60 ? "#3b82f6" : "#eab308" }} />
          </div>
          <span className={`text-sm font-bold tabular-nums ${pct === 100 ? "text-green-400" : pct >= 60 ? "text-blue-400" : "text-yellow-400"}`}>{pct}%</span>
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {LISTING_CHECKS.map(s => {
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

      {pct < 100 && (
        <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
          <AlertTriangle size={12} className="shrink-0 mt-px" /> Fix the remaining {LISTING_CHECKS.length - completed} item(s) before scaling ad spend — ads amplify a good listing and burn cash on a weak one.
        </div>
      )}
    </div>
  );
}

// ── #20 COD vs prepaid mix analyzer ────────────────────────────────────────────
function CodMixAnalyzer() {
  const [totalOrders, setTotalOrders] = useState("1000");
  const [codSharePct, setCodSharePct] = useState("60");
  const [aov, setAov] = useState("700");
  const [marginPct, setMarginPct] = useState("25");
  const [codRtoPct, setCodRtoPct] = useState("18");
  const [prepaidRtoPct, setPrepaidRtoPct] = useState("4");
  const [rtoCostPerOrder, setRtoCostPerOrder] = useState("120"); // forward+reverse freight bled per RTO

  const orders = Math.max(0, Math.round(parseFloat(totalOrders) || 0));
  const codShare = (parseFloat(codSharePct) || 0) / 100;
  const av = parseFloat(aov) || 0;
  const margin = (parseFloat(marginPct) || 0) / 100;
  const codRto = (parseFloat(codRtoPct) || 0) / 100;
  const ppRto = (parseFloat(prepaidRtoPct) || 0) / 100;
  const rtoCost = parseFloat(rtoCostPerOrder) || 0;

  const codOrders = Math.round(orders * codShare);
  const ppOrders = orders - codOrders;
  const grossMargin = av * margin;

  const segment = (cnt: number, rtoRate: number) => {
    const rtos = Math.round(cnt * rtoRate);
    const delivered = cnt - rtos;
    const earned = delivered * grossMargin;
    const bled = rtos * rtoCost; // RTO orders earn nothing and cost freight
    return { cnt, rtos, delivered, net: earned - bled };
  };

  const cod = segment(codOrders, codRto);
  const pp = segment(ppOrders, ppRto);
  const totalNet = cod.net + pp.net;
  const codNetPerOrder = cod.cnt > 0 ? cod.net / cod.cnt : 0;
  const ppNetPerOrder = pp.cnt > 0 ? pp.net / pp.cnt : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> COD vs Prepaid Mix Analyzer</h2>
        <p className="text-xs text-[var(--color-muted)]">COD orders RTO far more often than prepaid, and each RTO bleeds freight with zero revenue. Model your current mix to see the real net per order of each — then decide how hard to nudge buyers to prepay.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["Total orders", totalOrders, setTotalOrders, "1000"],
            ["COD share %", codSharePct, setCodSharePct, "60"],
            ["AOV (₹)", aov, setAov, "700"],
            ["Gross margin %", marginPct, setMarginPct, "25"],
            ["COD RTO %", codRtoPct, setCodRtoPct, "18"],
            ["Prepaid RTO %", prepaidRtoPct, setPrepaidRtoPct, "4"],
            ["RTO cost / order (₹)", rtoCostPerOrder, setRtoCostPerOrder, "120"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { name: "COD", seg: cod, per: codNetPerOrder },
          { name: "Prepaid", seg: pp, per: ppNetPerOrder },
        ].map(({ name, seg, per }) => (
          <div key={name} className={`${CARD} p-5 space-y-2`}>
            <p className="text-sm font-semibold">{name} segment</p>
            {[
              { label: "Orders", value: String(seg.cnt) },
              { label: "RTO orders", value: String(seg.rtos) },
              { label: "Delivered", value: String(seg.delivered) },
              { label: "Net margin", value: formatCurrency(Math.round(seg.net)) },
              { label: "Net / order", value: formatCurrency(Math.round(per)) },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-1.5 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.label.startsWith("Net") ? (seg.net >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold") : "text-[var(--color-text)]"}`}>{r.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="rounded-lg p-4 border border-blue-800/40 bg-blue-950/20">
        <p className="text-sm font-bold text-blue-400 flex items-center gap-2"><TrendingUp size={14} /> Total net margin {formatCurrency(Math.round(totalNet))} across {orders} orders. Prepaid nets {formatCurrency(Math.round(ppNetPerOrder))}/order vs COD {formatCurrency(Math.round(codNetPerOrder))}/order — a prepaid discount under that gap still leaves you ahead.</p>
      </div>
    </div>
  );
}

// ── #21 Buy-Box / win-rate tracker ─────────────────────────────────────────────
type BuyBoxRow = { id: string; sku: string; channel: Channel; impressions: number; buyBoxWins: number; yourPrice: number; lowestPrice: number };

function BuyBoxTracker() {
  const [rows, setRows] = useFeatureState<BuyBoxRow[]>("mkt-buybox-rows", []);
  const [sku, setSku] = useState("");
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [impr, setImpr] = useState("");
  const [wins, setWins] = useState("");
  const [yourPrice, setYourPrice] = useState("");
  const [lowest, setLowest] = useState("");

  const add = () => {
    const i = Math.round(parseFloat(impr) || 0);
    if (!sku.trim() || i <= 0) { toast.error("Enter a SKU and listing views"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), sku: sku.trim(), channel, impressions: i,
      buyBoxWins: Math.min(i, Math.round(parseFloat(wins) || 0)),
      yourPrice: parseFloat(yourPrice) || 0, lowestPrice: parseFloat(lowest) || 0,
    }]);
    setSku(""); setImpr(""); setWins(""); setYourPrice(""); setLowest("");
    toast.success("Buy-box entry added");
  };

  const totImpr = rows.reduce((s, r) => s + r.impressions, 0);
  const totWins = rows.reduce((s, r) => s + r.buyBoxWins, 0);
  const blendedRate = totImpr > 0 ? (totWins / totImpr) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Trophy size={14} className="text-[var(--color-primary)]" /> Buy-Box Win-Rate Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">On Amazon/Flipkart the Buy Box (default "Add to Cart" seller) wins the vast majority of sales. Log listing views, wins won and your price vs the lowest competitor to see where you're losing the box and by how much.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">SKU</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="TSHIRT-BLK-M" className={INP} /></div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Listing views</label><input type="number" value={impr} onChange={e => setImpr(e.target.value)} placeholder="4000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Buy-box wins</label><input type="number" value={wins} onChange={e => setWins(e.target.value)} placeholder="2600" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Your price (₹)</label><input type="number" value={yourPrice} onChange={e => setYourPrice(e.target.value)} placeholder="599" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Lowest price (₹)</label><input type="number" value={lowest} onChange={e => setLowest(e.target.value)} placeholder="549" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add SKU</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Blended buy-box win rate</p><p className={`text-xl font-bold tabular-nums ${blendedRate >= 80 ? "text-green-400" : blendedRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>{blendedRate.toFixed(1)}%</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total listing views</p><p className="text-xl font-bold tabular-nums">{totImpr.toLocaleString("en-IN")}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">SKUs tracked</p><p className="text-xl font-bold tabular-nums">{rows.length}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["SKU", "Channel", "Views", "Wins", "Win %", "Your ₹ vs lowest", "Gap", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const rate = r.impressions > 0 ? (r.buyBoxWins / r.impressions) * 100 : 0;
                    const gap = r.yourPrice - r.lowestPrice;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium text-xs">{r.sku}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.channel}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.impressions.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.buyBoxWins.toLocaleString("en-IN")}</td>
                        <td className={`px-4 py-2.5 tabular-nums font-semibold ${rate >= 80 ? "text-green-400" : rate >= 50 ? "text-yellow-400" : "text-red-400"}`}>{rate.toFixed(0)}%</td>
                        <td className="px-4 py-2.5 tabular-nums text-xs">{formatCurrency(r.yourPrice)} / {formatCurrency(r.lowestPrice)}</td>
                        <td className={`px-4 py-2.5 tabular-nums ${gap > 0 ? "text-red-400" : "text-green-400"}`}>{gap > 0 ? `+${formatCurrency(gap)}` : formatCurrency(gap)}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">A low win % with a positive price gap means you're being undercut — close the gap or improve fulfilment/rating. A low win % at price parity points to account-health or stock issues, not price.</p>
        </>
      )}
    </div>
  );
}

// ── #22 Reserve balance / release tracker ──────────────────────────────────────
type ReserveRow = { id: string; channel: Channel; amount: number; heldOn: string; releaseDays: number };

function ReserveReleaseTracker() {
  const [rows, setRows] = useFeatureState<ReserveRow[]>("mkt-reserve-rows", []);
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [amount, setAmount] = useState("");
  const [heldOn, setHeldOn] = useState(() => new Date().toISOString().split("T")[0]);
  const [releaseDays, setReleaseDays] = useState("7");

  const today = new Date().toISOString().split("T")[0];

  const add = () => {
    const a = parseFloat(amount) || 0;
    if (a <= 0) { toast.error("Enter the held reserve amount"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), channel, amount: a, heldOn, releaseDays: Math.round(parseFloat(releaseDays) || 0) }]);
    setAmount("");
    toast.success("Reserve entry added");
  };

  const projected = rows.map(r => {
    const release = addDaysISO(r.heldOn, r.releaseDays);
    const daysAway = Math.ceil((new Date(release).getTime() - new Date(today).getTime()) / 86400000);
    return { ...r, release, daysAway };
  }).sort((a, b) => a.daysAway - b.daysAway);

  const totalHeld = rows.reduce((s, r) => s + r.amount, 0);
  const releasingSoon = projected.filter(r => r.daysAway >= 0 && r.daysAway <= 7).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Lock size={14} className="text-[var(--color-primary)]" /> Reserve Balance & Release Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Marketplaces hold a rolling reserve (often 7 days of payouts) against returns and chargebacks. Log each held amount and its release window so you know exactly how much cash is trapped and when it frees up.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Held amount (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="120000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Held on</label><input type="date" value={heldOn} onChange={e => setHeldOn(e.target.value)} className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Release in (days)</label><input type="number" value={releaseDays} onChange={e => setReleaseDays(e.target.value)} placeholder="7" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add reserve</button>
      </div>

      {projected.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total reserve held</p><p className="text-xl font-bold tabular-nums text-yellow-400">{formatCurrency(Math.round(totalHeld))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Releasing within 7 days</p><p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(releasingSoon))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Channel", "Held", "Held on", "Release date", "When", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {projected.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                      <td className="px-4 py-2.5 tabular-nums text-yellow-400">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.heldOn}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.release}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.daysAway <= 0 ? "bg-green-950/30 text-green-400" : r.daysAway <= 3 ? "bg-yellow-950/30 text-yellow-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                          {r.daysAway <= 0 ? "Released" : r.daysAway === 1 ? "Tomorrow" : `${r.daysAway}d`}
                        </span>
                      </td>
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

// ── #23 Chargeback / A-to-z dispute ledger ─────────────────────────────────────
type ChargebackRow = { id: string; orderId: string; channel: Channel; reason: string; amount: number; raisedOn: string; status: "open" | "won" | "lost" };

function ChargebackLedger() {
  const [rows, setRows] = useFeatureState<ChargebackRow[]>("mkt-chargeback-rows", []);
  const [orderId, setOrderId] = useState("");
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [reason, setReason] = useState("Item not received");
  const [amount, setAmount] = useState("");
  const [raisedOn, setRaisedOn] = useState(() => new Date().toISOString().split("T")[0]);

  const REASONS = ["Item not received", "Not as described", "Damaged", "Fraudulent", "Late delivery", "Other"];

  const add = () => {
    const a = parseFloat(amount) || 0;
    if (!orderId.trim() || a <= 0) { toast.error("Enter an order ID and disputed amount"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), orderId: orderId.trim(), channel, reason, amount: a, raisedOn, status: "open" }]);
    setOrderId(""); setAmount("");
    toast.success("Chargeback logged");
  };

  const setStatus = (id: string, status: ChargebackRow["status"]) => setRows(rows.map(r => r.id === id ? { ...r, status } : r));

  const open = rows.filter(r => r.status === "open");
  const atRisk = open.reduce((s, r) => s + r.amount, 0);
  const lost = rows.filter(r => r.status === "lost").reduce((s, r) => s + r.amount, 0);
  const settled = rows.filter(r => r.status !== "open").length;
  const winRate = settled > 0 ? (rows.filter(r => r.status === "won").length / settled) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Chargeback / A-to-z Dispute Ledger</h2>
        <p className="text-xs text-[var(--color-muted)]">Track every A-to-z guarantee claim, payment chargeback and dispute against revenue. Watch open exposure, decide which to contest, and measure your win rate so you can spot abuse patterns.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Order ID</label><input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="403-1234567" className={INP} /></div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className={INP}>{REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Amount (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1499" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Raised on</label><input type="date" value={raisedOn} onChange={e => setRaisedOn(e.target.value)} className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Log chargeback</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Open exposure</p><p className="text-xl font-bold tabular-nums text-yellow-400">{formatCurrency(Math.round(atRisk))}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">{open.length} open</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Lost (written off)</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(lost))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Dispute win rate</p><p className={`text-xl font-bold tabular-nums ${winRate >= 50 ? "text-green-400" : "text-orange-400"}`}>{settled > 0 ? `${winRate.toFixed(0)}%` : "—"}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Order", "Channel", "Reason", "Amount", "Raised", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium text-xs">{r.orderId}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.channel}</td>
                      <td className="px-4 py-2.5 text-xs">{r.reason}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.raisedOn}</td>
                      <td className="px-4 py-2.5">
                        <select value={r.status} onChange={e => setStatus(r.id, e.target.value as ChargebackRow["status"])}
                          className={`text-[10px] px-1.5 py-0.5 rounded border bg-[var(--color-bg)] ${r.status === "won" ? "text-green-400 border-green-800/40" : r.status === "lost" ? "text-red-400 border-red-800/40" : "text-yellow-400 border-yellow-800/40"}`}>
                          <option value="open">Open</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                        </select>
                      </td>
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

// ── #24 Bundle / combo COGS splitter ───────────────────────────────────────────
type BundleComponent = { id: string; name: string; cogs: number; qty: number };

function BundleCogsSplitter() {
  const [components, setComponents] = useState<BundleComponent[]>([]);
  const [name, setName] = useState("");
  const [cogs, setCogs] = useState("");
  const [qty, setQty] = useState("1");
  const [bundlePrice, setBundlePrice] = useState("");
  const [feesPct, setFeesPct] = useState("18");
  const [shipping, setShipping] = useState("80");

  const add = () => {
    const c = parseFloat(cogs) || 0;
    if (!name.trim() || c <= 0) { toast.error("Enter a component name and cost"); return; }
    setComponents(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), cogs: c, qty: Math.max(1, Math.round(parseFloat(qty) || 1)) }]);
    setName(""); setCogs(""); setQty("1");
  };

  const totalCogs = components.reduce((s, c) => s + c.cogs * c.qty, 0);
  const price = parseFloat(bundlePrice) || 0;
  const fees = price * (parseFloat(feesPct) || 0) / 100;
  const ship = parseFloat(shipping) || 0;
  const netMargin = price - totalCogs - fees - ship;
  const marginPct = price > 0 ? (netMargin / price) * 100 : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Package size={14} className="text-[var(--color-primary)]" /> Bundle / Combo COGS Splitter</h2>
        <p className="text-xs text-[var(--color-muted)]">A combo listing has one price but many component costs. Add each item and its cost to roll up true bundle COGS, then layer fees and shipping to see whether the combo is actually carrying margin or quietly clearing stock at a loss.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Component</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Face wash 100ml" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Unit COGS (₹)</label><input type="number" value={cogs} onChange={e => setCogs(e.target.value)} placeholder="85" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Qty in combo</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="1" className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2.5 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {components.length > 0 && (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {components.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm">{c.name} <span className="text-[var(--color-muted)] text-xs">× {c.qty}</span></span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-sm">{formatCurrency(c.cogs * c.qty)}</span>
                <button onClick={() => setComponents(components.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--color-accent)]/30">
            <span className="text-sm font-semibold">Bundle COGS</span>
            <span className="tabular-nums text-sm font-semibold">{formatCurrency(Math.round(totalCogs))}</span>
          </div>
        </div>
      )}

      <div className={`${CARD} p-5 space-y-3`}>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Bundle price (₹)</label><input type="number" value={bundlePrice} onChange={e => setBundlePrice(e.target.value)} placeholder="499" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Fees %</label><input type="number" value={feesPct} onChange={e => setFeesPct(e.target.value)} placeholder="18" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Shipping (₹)</label><input type="number" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="80" className={INP} /></div>
        </div>
        {price > 0 && (
          <div className="space-y-2 pt-1">
            {[
              { label: "Bundle price", value: formatCurrency(Math.round(price)), color: "text-[var(--color-text)]" },
              { label: "Components COGS", value: `(${formatCurrency(Math.round(totalCogs))})`, color: "text-red-400" },
              { label: `Platform fees (${feesPct || 0}%)`, value: `(${formatCurrency(Math.round(fees))})`, color: "text-red-400" },
              { label: "Shipping", value: `(${formatCurrency(Math.round(ship))})`, color: "text-red-400" },
              { label: "Net margin", value: `${formatCurrency(Math.round(netMargin))} (${marginPct.toFixed(1)}%)`, color: netMargin >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── #25 SKU break-even price calculator ────────────────────────────────────────
function BreakEvenCalculator() {
  const [cogs, setCogs] = useState("");
  const [feesPct, setFeesPct] = useState("18");
  const [shipping, setShipping] = useState("70");
  const [adPerUnit, setAdPerUnit] = useState("0");
  const [returnPct, setReturnPct] = useState("5");
  const [targetMarginPct, setTargetMarginPct] = useState("15");

  const c = parseFloat(cogs) || 0;
  const f = (parseFloat(feesPct) || 0) / 100;
  const ship = parseFloat(shipping) || 0;
  const ad = parseFloat(adPerUnit) || 0;
  const ret = (parseFloat(returnPct) || 0) / 100;
  const tgt = (parseFloat(targetMarginPct) || 0) / 100;

  // price * (1 - f) - cogs - ship - ad - price*ret*0.5 = targetMargin * price  → solve for price
  // price * (1 - f - ret*0.5 - tgt) = cogs + ship + ad
  const denomBE = 1 - f - ret * 0.5;
  const denomTgt = 1 - f - ret * 0.5 - tgt;
  const fixed = c + ship + ad;
  const breakEven = denomBE > 0 ? fixed / denomBE : 0;
  const targetPrice = denomTgt > 0 ? fixed / denomTgt : 0;

  const valid = c > 0 && denomTgt > 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> SKU Break-even Price Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">Find the minimum price that recovers cost after fees, shipping, ads and a return-loss provision — and the price needed to hit a target net margin. Anything below break-even is selling at a loss.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ["COGS (₹)", cogs, setCogs, "300"],
            ["Fees %", feesPct, setFeesPct, "18"],
            ["Shipping (₹)", shipping, setShipping, "70"],
            ["Ad / unit (₹)", adPerUnit, setAdPerUnit, "0"],
            ["Return %", returnPct, setReturnPct, "5"],
            ["Target margin %", targetMarginPct, setTargetMarginPct, "15"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      {valid ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={`${CARD} p-5`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Break-even price</p>
            <p className="text-2xl font-bold tabular-nums text-yellow-400">{formatCurrency(Math.round(breakEven))}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-1">Recovers all costs; zero profit. Never list below this.</p>
          </div>
          <div className={`${CARD} p-5`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Price for {targetMarginPct || 0}% net margin</p>
            <p className="text-2xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(targetPrice))}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-1">List at or above this to hit your target margin.</p>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
          <AlertTriangle size={12} className="shrink-0 mt-px" /> Enter a COGS. If fees + half the return rate + target margin exceed 100%, no price can hit that margin — lower the target or the fee load.
        </div>
      )}
    </div>
  );
}

// ── #26 Festival / sale event planner ──────────────────────────────────────────
type FestivalTask = { id: string; label: string; dueOffset: number; done: boolean };

const FESTIVAL_TEMPLATE: { label: string; dueOffset: number }[] = [
  { label: "Confirm stock cover for projected event volume", dueOffset: -21 },
  { label: "Send FBA/warehouse inbound (account for inbound SLA)", dueOffset: -14 },
  { label: "Set event prices with margin floor after deeper discounts", dueOffset: -10 },
  { label: "Lock ad budget & lightning-deal slots", dueOffset: -7 },
  { label: "Arrange working capital for the payout gap", dueOffset: -7 },
  { label: "Brief logistics partner on RTO / pickup surge", dueOffset: -3 },
  { label: "Reconcile event payouts & event fees after sale", dueOffset: 7 },
];

function FestivalPlanner() {
  const [eventName, setEventName] = useFeatureState<string>("mkt-festival-name", "Big Billion Days");
  const [eventDate, setEventDate] = useFeatureState<string>("mkt-festival-date", addDaysISO(new Date().toISOString().split("T")[0], 30));
  const [tasks, setTasks] = useFeatureState<FestivalTask[]>("mkt-festival-tasks",
    FESTIVAL_TEMPLATE.map(t => ({ id: `ft-${t.dueOffset}`, label: t.label, dueOffset: t.dueOffset, done: false })));
  const [projUnits, setProjUnits] = useState("2000");
  const [aov, setAov] = useState("700");
  const [discountPct, setDiscountPct] = useState("15");

  const today = new Date().toISOString().split("T")[0];
  const toggle = (id: string) => setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const reset = () => { setTasks(FESTIVAL_TEMPLATE.map(t => ({ id: crypto.randomUUID(), label: t.label, dueOffset: t.dueOffset, done: false }))); toast.success("Checklist reset"); };

  const completed = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const units = Math.max(0, Math.round(parseFloat(projUnits) || 0));
  const av = parseFloat(aov) || 0;
  const disc = (parseFloat(discountPct) || 0) / 100;
  const projGmv = units * av * (1 - disc);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PartyPopper size={14} className="text-[var(--color-primary)]" /> Festival / Sale Event Planner</h2>
        <p className="text-xs text-[var(--color-muted)]">Big Billion Days, Great Indian Festival and Diwali sales make or break the quarter. Set the event date and the checklist auto-dates each prep task backwards from it — so stock, pricing, ads and cash are ready in time.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2"><label className="block text-xs text-[var(--color-muted)] mb-1">Event</label><input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Big Billion Days" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Event date</label><input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Proj. units</label><input type="number" value={projUnits} onChange={e => setProjUnits(e.target.value)} placeholder="2000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">AOV (₹)</label><input type="number" value={aov} onChange={e => setAov(e.target.value)} placeholder="700" className={INP} /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Event discount %</label><input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="15" className={INP} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Projected event GMV</p><p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(projGmv))}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">{units} units after {discountPct || 0}% off</p></div>
        <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Prep readiness</p><p className={`text-xl font-bold tabular-nums ${pct === 100 ? "text-green-400" : pct >= 60 ? "text-blue-400" : "text-yellow-400"}`}>{pct}%</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">{completed}/{tasks.length} done</p></div>
        <div className={`${CARD} p-4 flex items-end`}><button onClick={reset} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Reset checklist</button></div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {tasks.map(t => {
          const due = addDaysISO(eventDate, t.dueOffset);
          const daysAway = Math.ceil((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
          return (
            <button key={t.id} onClick={() => toggle(t.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/2">
              <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${t.done ? "bg-green-500 border-green-500" : "border-[var(--color-border)]"}`}>
                {t.done && <CheckCircle2 size={12} className="text-[var(--color-bg)]" />}
              </span>
              <span className={`flex-1 text-sm font-medium ${t.done ? "line-through text-[var(--color-muted)]" : ""}`}>{t.label}</span>
              <span className="text-[11px] text-[var(--color-muted)] tabular-nums">{due}</span>
              {!t.done && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${daysAway < 0 ? "bg-red-950/30 text-red-400" : daysAway <= 3 ? "bg-yellow-950/30 text-yellow-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                  {daysAway < 0 ? `${Math.abs(daysAway)}d late` : daysAway === 0 ? "Today" : `${daysAway}d`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── #27 Holding-period / cash-cycle cost calculator ────────────────────────────
function HoldingCostCalculator() {
  const [rows, setRows] = useFeatureState<{ id: string; channel: Channel; monthlyGmv: number; payoutDays: number }[]>("mkt-holding-rows", []);
  const [imported] = useFeatureState<ImportedSettlement[]>(IMPORTED_KEY, []);
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [monthlyGmv, setMonthlyGmv] = useState("");
  const [payoutDays, setPayoutDays] = useState("7");
  const [apr, setApr] = useState("18");

  const add = () => {
    const g = parseFloat(monthlyGmv) || 0;
    if (g <= 0) { toast.error("Enter the channel's monthly GMV"); return; }
    setRows(prev => [...prev.filter(r => r.channel !== channel), { id: crypto.randomUUID(), channel, monthlyGmv: g, payoutDays: Math.round(parseFloat(payoutDays) || 0) }]);
    setMonthlyGmv("");
    toast.success(`${channel} saved`);
  };

  // Derive monthly GMV per channel from imported gross. If the import spans a
  // date range we annualise to a 30-day month; otherwise use raw gross as-is.
  const prefillFromImport = () => {
    try {
      const roll = rollupImported(imported);
      if (roll.byChannel.length === 0) { toast.error("Import a settlement CSV first"); return; }
      setRows(prev => {
        const kept = prev.filter(r => !roll.byChannel.some(c => c.channel === r.channel));
        const fromImport = roll.byChannel.map(c => {
          let monthly = c.gross;
          if (c.firstDate && c.lastDate && c.lastDate > c.firstDate) {
            const spanDays = Math.max(1, Math.round((new Date(c.lastDate).getTime() - new Date(c.firstDate).getTime()) / 86400000) + 1);
            monthly = (c.gross / spanDays) * 30;
          }
          return {
            id: crypto.randomUUID(),
            channel: c.channel,
            monthlyGmv: Math.round(monthly),
            payoutDays: DEFAULT_CYCLE_DAYS[c.channel] ?? 7,
          };
        });
        return [...kept, ...fromImport];
      });
      toast.success(`Prefilled ${roll.byChannel.length} channel(s) from imported settlements`);
    } catch (err) {
      toast.error("Could not prefill from imported data");
    }
  };

  const aprPct = (parseFloat(apr) || 0) / 100;
  const enriched = rows.map(r => {
    const dailyGmv = r.monthlyGmv / 30;
    const lockedCapital = dailyGmv * r.payoutDays; // avg cash tied up between sale and payout
    const annualCost = lockedCapital * aprPct;
    return { ...r, lockedCapital, annualCost };
  });
  const totalLocked = enriched.reduce((s, r) => s + r.lockedCapital, 0);
  const totalAnnualCost = enriched.reduce((s, r) => s + r.annualCost, 0);

  return (
    <div className="space-y-4">
      <ImportedTotalsBanner note="Click 'Prefill from imported' to derive each channel's monthly GMV from imported gross (annualised over the import's date range)." />
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Hourglass size={14} className="text-[var(--color-primary)]" /> Cash-Cycle / Holding-Period Cost</h2>
        <p className="text-xs text-[var(--color-muted)]">Every day between a sale and its payout, your money is locked at the marketplace — and if you fund operations on credit, that wait has a real interest cost. Prefill GMV from your imported settlement file, or enter it manually per channel.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Monthly GMV (₹)</label><input type="number" value={monthlyGmv} onChange={e => setMonthlyGmv(e.target.value)} placeholder="450000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Payout lag (days)</label><input type="number" value={payoutDays} onChange={e => setPayoutDays(e.target.value)} placeholder="7" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Borrowing APR %</label><input type="number" value={apr} onChange={e => setApr(e.target.value)} placeholder="18" className={INP} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add / update channel</button>
          {imported.length > 0 && (
            <button onClick={prefillFromImport} className="flex items-center gap-1.5 border border-[var(--color-primary)]/40 text-[var(--color-primary)] rounded-lg px-4 py-2 text-sm font-medium"><Database size={13} /> Prefill from imported</button>
          )}
        </div>
      </div>

      {enriched.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Avg capital locked in transit</p><p className="text-xl font-bold tabular-nums text-yellow-400">{formatCurrency(Math.round(totalLocked))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Annual cost of the wait @ {apr || 0}%</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totalAnnualCost))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Channel", "Monthly GMV", "Payout lag", "Capital locked", "Annual cost", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {enriched.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.monthlyGmv)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.payoutDays}d</td>
                      <td className="px-4 py-2.5 tabular-nums text-yellow-400">{formatCurrency(Math.round(r.lockedCapital))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-400 font-semibold">{formatCurrency(Math.round(r.annualCost))}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Capital locked ≈ daily GMV × payout-lag days. Faster payouts or settlement financing cut this carry cost — compare it against any financing fee before deciding.</p>
        </>
      )}
    </div>
  );
}

// ── Coupon / Promo ROI ─────────────────────────────────────────────────────────
type PromoRow = { id: string; name: string; spend: number; baselineUnits: number; promoUnits: number; marginPerUnit: number };
function CouponRoi() {
  const [rows, setRows] = useFeatureState<PromoRow[]>("mkt-promo-roi", []);
  const [name, setName] = useState("");
  const [spend, setSpend] = useState("");
  const [baseline, setBaseline] = useState("");
  const [promo, setPromo] = useState("");
  const [margin, setMargin] = useState("");

  const add = () => {
    const s = parseFloat(spend) || 0;
    const bu = Math.max(0, Math.round(parseFloat(baseline) || 0));
    const pu = Math.max(0, Math.round(parseFloat(promo) || 0));
    const m = parseFloat(margin) || 0;
    if (!name.trim() || s <= 0) { toast.error("Enter a promo name and discount spend"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), spend: s, baselineUnits: bu, promoUnits: pu, marginPerUnit: m }]);
    setName(""); setSpend(""); setBaseline(""); setPromo(""); setMargin("");
    toast.success("Promo added");
  };

  const enriched = rows.map(r => {
    const incrUnits = Math.max(0, r.promoUnits - r.baselineUnits);
    const incrMargin = incrUnits * r.marginPerUnit;
    const netGain = incrMargin - r.spend;
    const roi = r.spend > 0 ? netGain / r.spend : 0;
    return { ...r, incrUnits, incrMargin, netGain, roi };
  });
  const totSpend = enriched.reduce((s, r) => s + r.spend, 0);
  const totNet = enriched.reduce((s, r) => s + r.netGain, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3 max-w-2xl`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Ticket size={14} className="text-[var(--color-primary)]" /> Coupon / Promo ROI</h2>
        <p className="text-xs text-[var(--color-muted)]">A coupon only pays off if the extra units it drives earn more margin than the discount costs. Enter baseline units (what you'd sell anyway) and promo-period units — we count only the incremental ones.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1"><label className="block text-xs text-[var(--color-muted)] mb-1">Promo name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="10% off — Diwali" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Discount spend (₹)</label><input type="number" value={spend} onChange={e => setSpend(e.target.value)} placeholder="15000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Baseline units</label><input type="number" value={baseline} onChange={e => setBaseline(e.target.value)} placeholder="200" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Promo units</label><input type="number" value={promo} onChange={e => setPromo(e.target.value)} placeholder="320" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Margin / unit (₹)</label><input type="number" value={margin} onChange={e => setMargin(e.target.value)} placeholder="120" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add promo</button>
      </div>

      {enriched.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-2xl">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total discount spend</p><p className="text-xl font-bold tabular-nums">{formatCurrency(Math.round(totSpend))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Net margin gain</p><p className={`text-xl font-bold tabular-nums ${totNet >= 0 ? "text-green-400" : "text-red-400"}`}>{totNet >= 0 ? "+" : ""}{formatCurrency(Math.round(totNet))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Promo", "Spend", "Incr. units", "Incr. margin", "Net", "ROI", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {enriched.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.spend))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.incrUnits}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.incrMargin))}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.netGain >= 0 ? "text-green-400" : "text-red-400"}`}>{r.netGain >= 0 ? "+" : ""}{formatCurrency(Math.round(r.netGain))}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${r.roi >= 0 ? "text-green-400" : "text-red-400"}`}>{(r.roi * 100).toFixed(0)}%</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Net = incremental units × margin/unit − discount spend. A negative net means you subsidised sales you'd have made anyway.</p>
        </>
      )}
    </div>
  );
}

// ── Listing conversion tracker ──────────────────────────────────────────────────
type ConvRow = { id: string; listing: string; sessions: number; orders: number };
function ConversionTracker() {
  const [rows, setRows] = useFeatureState<ConvRow[]>("mkt-conversion-rows", []);
  const [listing, setListing] = useState("");
  const [sessions, setSessions] = useState("");
  const [orders, setOrders] = useState("");

  const add = () => {
    const s = Math.max(0, Math.round(parseFloat(sessions) || 0));
    const o = Math.max(0, Math.round(parseFloat(orders) || 0));
    if (!listing.trim() || s <= 0) { toast.error("Enter a listing and session count"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), listing: listing.trim(), sessions: s, orders: o }]);
    setListing(""); setSessions(""); setOrders("");
    toast.success("Listing added");
  };

  const enriched = rows.map(r => ({ ...r, cvr: r.sessions > 0 ? r.orders / r.sessions : 0 }));
  const totSess = enriched.reduce((s, r) => s + r.sessions, 0);
  const totOrders = enriched.reduce((s, r) => s + r.orders, 0);
  const blended = totSess > 0 ? totOrders / totSess : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3 max-w-2xl`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><MousePointerClick size={14} className="text-[var(--color-primary)]" /> Listing Conversion Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Conversion rate (orders ÷ sessions) is the fastest read on listing health. Low CVR with high sessions usually means price, images or reviews — not traffic. Pull sessions from your Seller/Flipkart dashboard.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1"><label className="block text-xs text-[var(--color-muted)] mb-1">Listing / ASIN</label><input value={listing} onChange={e => setListing(e.target.value)} placeholder="Steel Bottle 1L" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Sessions</label><input type="number" value={sessions} onChange={e => setSessions(e.target.value)} placeholder="1200" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Orders</label><input type="number" value={orders} onChange={e => setOrders(e.target.value)} placeholder="48" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add listing</button>
      </div>

      {enriched.length > 0 && (
        <>
          <div className={`${CARD} p-4 max-w-2xl`}><p className="text-xs text-[var(--color-muted)] mb-1">Blended conversion across {enriched.length} listing(s)</p><p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{(blended * 100).toFixed(1)}%</p></div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Listing", "Sessions", "Orders", "CVR", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {enriched.map(r => {
                    const flag = r.cvr < blended * 0.6;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium flex items-center gap-1.5">{flag && <AlertTriangle size={12} className="text-yellow-400" />}{r.listing}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.sessions}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.orders}</td>
                        <td className={`px-4 py-2.5 tabular-nums font-semibold ${flag ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{(r.cvr * 100).toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Listings flagged ⚠ convert below 60% of your blended rate — review price, hero image and Q&amp;A first.</p>
        </>
      )}
    </div>
  );
}

// ── Return rate by SKU ──────────────────────────────────────────────────────────
type RetRow = { id: string; sku: string; delivered: number; returned: number };
function ReturnRateBySku() {
  const [rows, setRows] = useFeatureState<RetRow[]>("mkt-return-rate-rows", []);
  const [sku, setSku] = useState("");
  const [delivered, setDelivered] = useState("");
  const [returned, setReturned] = useState("");

  const add = () => {
    const d = Math.max(0, Math.round(parseFloat(delivered) || 0));
    const rt = Math.max(0, Math.round(parseFloat(returned) || 0));
    if (!sku.trim() || d <= 0) { toast.error("Enter a SKU and delivered units"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), sku: sku.trim(), delivered: d, returned: rt }]);
    setSku(""); setDelivered(""); setReturned("");
    toast.success("SKU added");
  };

  const enriched = rows.map(r => ({ ...r, rate: r.delivered > 0 ? r.returned / r.delivered : 0 }))
    .sort((a, b) => b.rate - a.rate);
  const totDel = enriched.reduce((s, r) => s + r.delivered, 0);
  const totRet = enriched.reduce((s, r) => s + r.returned, 0);
  const avg = totDel > 0 ? totRet / totDel : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3 max-w-2xl`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PackageX size={14} className="text-[var(--color-primary)]" /> Return Rate by SKU</h2>
        <p className="text-xs text-[var(--color-muted)]">Return rate (returns ÷ delivered) isolates which products customers send back — a sizing, quality or expectation problem. High-rate SKUs quietly erase margin through reverse logistics, so fix the listing or drop them.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1"><label className="block text-xs text-[var(--color-muted)] mb-1">SKU</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="TSHIRT-BLK-M" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Delivered</label><input type="number" value={delivered} onChange={e => setDelivered(e.target.value)} placeholder="500" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Returned</label><input type="number" value={returned} onChange={e => setReturned(e.target.value)} placeholder="65" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add SKU</button>
      </div>

      {enriched.length > 0 && (
        <>
          <div className={`${CARD} p-4 max-w-2xl`}><p className="text-xs text-[var(--color-muted)] mb-1">Portfolio return rate ({totRet} of {totDel} units)</p><p className={`text-xl font-bold tabular-nums ${avg > 0.2 ? "text-red-400" : avg > 0.1 ? "text-yellow-400" : "text-green-400"}`}>{(avg * 100).toFixed(1)}%</p></div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["SKU", "Delivered", "Returned", "Return rate", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {enriched.map(r => {
                    const color = r.rate > 0.2 ? "text-red-400" : r.rate > 0.1 ? "text-yellow-400" : "text-green-400";
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.sku}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.delivered}</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.returned}</td>
                        <td className={`px-4 py-2.5 tabular-nums font-semibold ${color}`}>{(r.rate * 100).toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Sorted worst-first. Above 20% (red) usually flags a fit or quality issue worth fixing before it eats your reverse-logistics budget.</p>
        </>
      )}
    </div>
  );
}

// ── Marketplace fee reconciliation ──────────────────────────────────────────────
type FeeReconRow = { id: string; order: string; expected: number; charged: number };
function FeeReconciliation() {
  const [rows, setRows] = useFeatureState<FeeReconRow[]>("mkt-fee-recon-rows", []);
  const [order, setOrder] = useState("");
  const [expected, setExpected] = useState("");
  const [charged, setCharged] = useState("");
  const [tol, setTol] = useState("2");

  const add = () => {
    const ex = parseFloat(expected) || 0;
    const ch = parseFloat(charged) || 0;
    if (!order.trim()) { toast.error("Enter an order / settlement ID"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), order: order.trim(), expected: ex, charged: ch }]);
    setOrder(""); setExpected(""); setCharged("");
    toast.success("Line added");
  };

  const tolPct = (parseFloat(tol) || 0) / 100;
  const enriched = rows.map(r => {
    const diff = r.charged - r.expected;
    const overcharged = r.expected > 0 ? diff > r.expected * tolPct : diff > 0;
    return { ...r, diff, overcharged };
  });
  const totDiff = enriched.reduce((s, r) => s + r.diff, 0);
  const totOver = enriched.filter(r => r.overcharged).reduce((s, r) => s + r.diff, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3 max-w-2xl`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ScrollText size={14} className="text-[var(--color-primary)]" /> Marketplace Fee Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)]">Marketplaces routinely deduct more commission, shipping or closing fees than their own rate card implies. Enter what you expected to be charged versus what the settlement actually deducted — we flag the overcharges worth disputing.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-1"><label className="block text-xs text-[var(--color-muted)] mb-1">Order / settlement ID</label><input value={order} onChange={e => setOrder(e.target.value)} placeholder="402-1234567" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Expected fee (₹)</label><input type="number" value={expected} onChange={e => setExpected(e.target.value)} placeholder="85" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Charged fee (₹)</label><input type="number" value={charged} onChange={e => setCharged(e.target.value)} placeholder="98" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Tolerance %</label><input type="number" value={tol} onChange={e => setTol(e.target.value)} placeholder="2" className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add line</button>
      </div>

      {enriched.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-2xl">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Net fee variance</p><p className={`text-xl font-bold tabular-nums ${totDiff > 0 ? "text-red-400" : "text-green-400"}`}>{totDiff > 0 ? "+" : ""}{formatCurrency(Math.round(totDiff))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Disputable overcharge</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totOver))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Order", "Expected", "Charged", "Variance", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {enriched.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.order}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.expected))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.charged))}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.diff > 0 ? "text-red-400" : r.diff < 0 ? "text-green-400" : "text-[var(--color-muted)]"}`}>{r.diff > 0 ? "+" : ""}{formatCurrency(Math.round(r.diff))}</td>
                      <td className="px-4 py-2.5">{r.overcharged
                        ? <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> Overcharged</span>
                        : <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> OK</span>}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Lines charged more than {tol || 0}% above the expected fee are flagged. Raise a reimbursement / FBA fee-correction case with the order IDs above.</p>
        </>
      )}
    </div>
  );
}

// ── Place-of-supply resolver (IGST vs CGST/SGST) ────────────────────────────────
const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

function PlaceOfSupplyResolver() {
  const [sellerState, setSellerState] = useState<string>("Maharashtra");
  const [buyerState, setBuyerState] = useState<string>("Karnataka");
  const [taxable, setTaxable] = useState("");
  const [ratePct, setRatePct] = useState("18");

  const base = parseFloat(taxable) || 0;
  const rate = parseFloat(ratePct) || 0;
  const interState = sellerState !== buyerState;
  const totalTax = base * rate / 100;
  const igst = interState ? totalTax : 0;
  const cgst = interState ? 0 : totalTax / 2;
  const sgst = interState ? 0 : totalTax / 2;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><MapPin size={14} className="text-[var(--color-primary)]" /> Place-of-Supply Resolver</h2>
        <p className="text-xs text-[var(--color-muted)]">For goods, place of supply is the buyer's ship-to state. If it differs from your registered state the supply is inter-state (charge IGST); if it matches, it is intra-state (split into CGST + SGST). Marketplace orders ship pan-India, so the head flips order to order — get it wrong and you mis-report in GSTR-1.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Your (seller) state</label>
            <select value={sellerState} onChange={e => setSellerState(e.target.value)} className={INP}>{STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Buyer ship-to state</label>
            <select value={buyerState} onChange={e => setBuyerState(e.target.value)} className={INP}>{STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Taxable value (₹)</label><input type="number" value={taxable} onChange={e => setTaxable(e.target.value)} placeholder="1000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">GST rate %</label><input type="number" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="18" className={INP} /></div>
        </div>
      </div>

      {base > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Tax breakup</h3>
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${interState ? "bg-purple-950/30 text-purple-400 border-purple-800/30" : "bg-blue-950/30 text-blue-400 border-blue-800/30"}`}>{interState ? "Inter-state → IGST" : "Intra-state → CGST + SGST"}</span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Taxable value", value: formatCurrency(Math.round(base)), color: "text-[var(--color-text)]" },
              { label: `IGST (${interState ? rate : 0}%)`, value: formatCurrency(Math.round(igst)), color: interState ? "text-purple-400" : "text-[var(--color-muted)]" },
              { label: `CGST (${interState ? 0 : rate / 2}%)`, value: formatCurrency(Math.round(cgst)), color: interState ? "text-[var(--color-muted)]" : "text-blue-400" },
              { label: `SGST (${interState ? 0 : rate / 2}%)`, value: formatCurrency(Math.round(sgst)), color: interState ? "text-[var(--color-muted)]" : "text-blue-400" },
              { label: "Invoice total", value: formatCurrency(Math.round(base + totalTax)), color: "text-green-400 font-bold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-3">Rule applies to goods (Sec 10, IGST Act). Services and special cases (e-commerce operator supplies, bill-to/ship-to) can differ — confirm with your CA for edge scenarios.</p>
        </div>
      )}
    </div>
  );
}

// ── COD remittance tracker ──────────────────────────────────────────────────────
type CodRow = { id: string; partner: string; orders: number; collected: number; remitted: number; expectedOn: string };

function CodRemittanceTracker() {
  const [rows, setRows] = useFeatureState<CodRow[]>("mkt-cod-remit-rows", []);
  const [partner, setPartner] = useState("");
  const [orders, setOrders] = useState("");
  const [collected, setCollected] = useState("");
  const [remitted, setRemitted] = useState("");
  const [expectedOn, setExpectedOn] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    const c = parseFloat(collected) || 0;
    if (!partner.trim() || c <= 0) { toast.error("Enter a logistics partner and amount collected"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), partner: partner.trim(), orders: Math.round(parseFloat(orders) || 0),
      collected: c, remitted: parseFloat(remitted) || 0, expectedOn,
    }]);
    setPartner(""); setOrders(""); setCollected(""); setRemitted("");
    toast.success("COD batch added");
  };

  const today = new Date().toISOString().split("T")[0];
  const enriched = rows.map(r => ({ ...r, float: r.collected - r.remitted, overdue: r.collected - r.remitted > 0 && r.expectedOn < today }));
  const totCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totRemitted = rows.reduce((s, r) => s + r.remitted, 0);
  const totFloat = totCollected - totRemitted;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> COD Remittance Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Your courier collects cash on delivery and remits it days later. That float is your money sitting in their account — track collected vs remitted per partner so nothing goes unremitted past its due date.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="col-span-2 md:col-span-1"><label className="block text-xs text-[var(--color-muted)] mb-1">Logistics partner</label><input value={partner} onChange={e => setPartner(e.target.value)} placeholder="Delhivery" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">COD orders</label><input type="number" value={orders} onChange={e => setOrders(e.target.value)} placeholder="120" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Collected (₹)</label><input type="number" value={collected} onChange={e => setCollected(e.target.value)} placeholder="180000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Remitted (₹)</label><input type="number" value={remitted} onChange={e => setRemitted(e.target.value)} placeholder="120000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Remit due by</label><input type="date" value={expectedOn} onChange={e => setExpectedOn(e.target.value)} className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add COD batch</button>
      </div>

      {enriched.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total collected</p><p className="text-xl font-bold tabular-nums">{formatCurrency(Math.round(totCollected))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total remitted</p><p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(totRemitted))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">COD float (unremitted)</p><p className={`text-xl font-bold tabular-nums ${totFloat > 0 ? "text-yellow-400" : "text-green-400"}`}>{formatCurrency(Math.round(totFloat))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Partner", "Orders", "Collected", "Remitted", "Float", "Due by", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {enriched.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.partner}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.orders}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.collected)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(r.remitted)}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.float > 0 ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>{formatCurrency(Math.round(r.float))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.expectedOn}</td>
                      <td className="px-4 py-2.5">{r.float <= 0
                        ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> Settled</span>
                        : r.overdue
                          ? <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> Overdue</span>
                          : <span className="text-xs text-yellow-400 flex items-center gap-1"><Hourglass size={12} /> Pending</span>}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Float = collected − remitted. Overdue rows (due date passed, still unremitted) are your courier holding your cash — follow up.</p>
        </>
      )}
    </div>
  );
}

// ── Payment-gateway fee normalizer (D2C) ────────────────────────────────────────
type GatewayRow = { id: string; gateway: string; method: string; gross: number; feePct: number; fixedFee: number; gstOnFee: boolean };

function GatewayFeeRecon() {
  const [rows, setRows] = useFeatureState<GatewayRow[]>("mkt-gateway-rows", []);
  const [gateway, setGateway] = useState("Razorpay");
  const [method, setMethod] = useState("UPI");
  const [gross, setGross] = useState("");
  const [feePct, setFeePct] = useState("2");
  const [fixedFee, setFixedFee] = useState("0");
  const [gstOnFee, setGstOnFee] = useState(true);

  const feeOf = (r: GatewayRow) => {
    const base = r.gross * r.feePct / 100 + r.fixedFee;
    return r.gstOnFee ? base * 1.18 : base;
  };

  const add = () => {
    const g = parseFloat(gross) || 0;
    if (g <= 0) { toast.error("Enter the gross transaction value"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), gateway: gateway.trim() || "Gateway", method: method.trim() || "—",
      gross: g, feePct: parseFloat(feePct) || 0, fixedFee: parseFloat(fixedFee) || 0, gstOnFee,
    }]);
    setGross("");
    toast.success("Transaction added");
  };

  const totGross = rows.reduce((s, r) => s + r.gross, 0);
  const totFee = rows.reduce((s, r) => s + feeOf(r), 0);
  const totNet = totGross - totFee;
  const blendedPct = totGross > 0 ? (totFee / totGross) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CreditCard size={14} className="text-[var(--color-primary)]" /> Gateway Fee Normalizer</h2>
        <p className="text-xs text-[var(--color-muted)]">Razorpay, PayU and Cashfree each charge a different MDR by payment method (UPI vs cards vs netbanking), often plus 18% GST on the fee. Normalize them here to see the true net settlement and your blended payment cost across D2C transactions.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Gateway</label><input value={gateway} onChange={e => setGateway(e.target.value)} placeholder="Razorpay" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Method</label><input value={method} onChange={e => setMethod(e.target.value)} placeholder="UPI" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Gross (₹)</label><input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="2000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Fee %</label><input type="number" value={feePct} onChange={e => setFeePct(e.target.value)} placeholder="2" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Fixed fee (₹)</label><input type="number" value={fixedFee} onChange={e => setFixedFee(e.target.value)} placeholder="0" className={INP} /></div>
          <div className="flex items-center gap-2 pb-2.5">
            <input id="gst-on-fee" type="checkbox" checked={gstOnFee} onChange={e => setGstOnFee(e.target.checked)} className="accent-[var(--color-primary)]" />
            <label htmlFor="gst-on-fee" className="text-xs text-[var(--color-muted)]">+18% GST</label>
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Add transaction</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Gross processed</p><p className="text-xl font-bold tabular-nums">{formatCurrency(Math.round(totGross))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Gateway fees</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totFee))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Net settlement</p><p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(totNet))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Blended fee rate</p><p className={`text-xl font-bold tabular-nums ${blendedPct > 2.5 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{blendedPct.toFixed(2)}%</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Gateway", "Method", "Gross", "Fee", "Net", "Eff %", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const fee = feeOf(r);
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.gateway}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.method}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.gross)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(Math.round(fee))}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(Math.round(r.gross - fee))}</td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.gross > 0 ? `${(fee / r.gross * 100).toFixed(2)}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">GST on the gateway fee is claimable as ITC against your output tax. Fee includes the fixed per-transaction charge where applicable.</p>
        </>
      )}
    </div>
  );
}

// ── Negative-balance recovery tracker ───────────────────────────────────────────
type NegRow = { id: string; channel: Channel; reason: string; amount: number; recovered: number; raisedOn: string };

function NegativeBalanceTracker() {
  const [rows, setRows] = useFeatureState<NegRow[]>("mkt-neg-balance-rows", []);
  const [channel, setChannel] = useState<Channel>("Amazon");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [recovered, setRecovered] = useState("");
  const [raisedOn, setRaisedOn] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    const a = parseFloat(amount) || 0;
    if (a <= 0) { toast.error("Enter the negative-balance amount"); return; }
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), channel, reason: reason.trim() || "Unspecified", amount: a,
      recovered: Math.min(a, parseFloat(recovered) || 0), raisedOn,
    }]);
    setReason(""); setAmount(""); setRecovered("");
    toast.success("Negative balance logged");
  };

  const totAmount = rows.reduce((s, r) => s + r.amount, 0);
  const totRecovered = rows.reduce((s, r) => s + r.recovered, 0);
  const outstanding = totAmount - totRecovered;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><MinusCircle size={14} className="text-[var(--color-primary)]" /> Negative-Balance Recovery</h2>
        <p className="text-xs text-[var(--color-muted)]">When refunds, reimb, A-to-z claims or fee reversals exceed a period's sales, the marketplace shows a negative balance and claws it back from your next payouts. Log each one so you can confirm the clawback actually stops once it is recovered.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)} className={INP}>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div className="col-span-2 md:col-span-1"><label className="block text-xs text-[var(--color-muted)] mb-1">Reason</label><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Refund > sales" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Amount (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="14000" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Recovered (₹)</label><input type="number" value={recovered} onChange={e => setRecovered(e.target.value)} placeholder="0" className={INP} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Raised on</label><input type="date" value={raisedOn} onChange={e => setRaisedOn(e.target.value)} className={INP} /></div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium"><Plus size={13} /> Log negative balance</button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total clawed back</p><p className="text-xl font-bold tabular-nums text-red-400">{formatCurrency(Math.round(totAmount))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Recovered from payouts</p><p className="text-xl font-bold tabular-nums text-green-400">{formatCurrency(Math.round(totRecovered))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Still outstanding</p><p className={`text-xl font-bold tabular-nums ${outstanding > 0 ? "text-yellow-400" : "text-green-400"}`}>{formatCurrency(Math.round(outstanding))}</p></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]"><tr>{["Channel", "Reason", "Raised", "Amount", "Recovered", "Outstanding", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const out = r.amount - r.recovered;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.reason}</td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.raisedOn}</td>
                        <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(r.amount)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(r.recovered)}</td>
                        <td className={`px-4 py-2.5 tabular-nums font-semibold ${out > 0 ? "text-yellow-400" : "text-green-400"}`}>{formatCurrency(Math.round(out))}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
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

// ── Channel-add ROI simulator ───────────────────────────────────────────────────
function ChannelAddRoi() {
  const [monthlyUnits, setMonthlyUnits] = useState("");
  const [price, setPrice] = useState("");
  const [cogs, setCogs] = useState("");
  const [feePct, setFeePct] = useState("18");
  const [shipPerUnit, setShipPerUnit] = useState("60");
  const [returnPct, setReturnPct] = useState("8");
  const [setupCost, setSetupCost] = useState("");
  const [monthlyFixed, setMonthlyFixed] = useState("");
  const [cannibalPct, setCannibalPct] = useState("0");

  const units = parseFloat(monthlyUnits) || 0;
  const p = parseFloat(price) || 0;
  const c = parseFloat(cogs) || 0;
  const eff = units * (1 - (parseFloat(cannibalPct) || 0) / 100); // units that are genuinely incremental
  const grossPerUnit = p - c - p * (parseFloat(feePct) || 0) / 100 - (parseFloat(shipPerUnit) || 0);
  const lossPerReturn = (parseFloat(shipPerUnit) || 0) * 2 + c; // freight both ways + unrecovered cost proxy
  const returnRate = (parseFloat(returnPct) || 0) / 100;
  const netPerUnit = grossPerUnit - returnRate * lossPerReturn;
  const monthlyContribution = eff * netPerUnit - (parseFloat(monthlyFixed) || 0);
  const annualContribution = monthlyContribution * 12;
  const setup = parseFloat(setupCost) || 0;
  const annualNet = annualContribution - setup;
  const paybackMonths = monthlyContribution > 0 ? setup / monthlyContribution : Infinity;
  const roiPct = setup > 0 ? (annualContribution - setup) / setup * 100 : (annualContribution > 0 ? Infinity : 0);

  const ready = units > 0 && p > 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Rocket size={14} className="text-[var(--color-primary)]" /> Channel-Add ROI Simulator</h2>
        <p className="text-xs text-[var(--color-muted)]">Before launching on a new marketplace, model whether it actually adds profit. Account for that channel's fees, shipping, returns, one-time onboarding, recurring fixed costs and — crucially — how much volume just cannibalizes your existing channels rather than being net-new.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ["Monthly units", monthlyUnits, setMonthlyUnits, "300"],
            ["Avg selling price (₹)", price, setPrice, "899"],
            ["COGS / unit (₹)", cogs, setCogs, "350"],
            ["Channel fee %", feePct, setFeePct, "18"],
            ["Shipping / unit (₹)", shipPerUnit, setShipPerUnit, "60"],
            ["Return rate %", returnPct, setReturnPct, "8"],
            ["One-time setup (₹)", setupCost, setSetupCost, "25000"],
            ["Monthly fixed (₹)", monthlyFixed, setMonthlyFixed, "5000"],
            ["Cannibalization %", cannibalPct, setCannibalPct, "0"],
          ] as const).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
              <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder={ph} className={INP} />
            </div>
          ))}
        </div>
      </div>

      {ready && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Net contribution / unit</p><p className={`text-xl font-bold tabular-nums ${netPerUnit >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(netPerUnit))}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Monthly contribution</p><p className={`text-xl font-bold tabular-nums ${monthlyContribution >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(monthlyContribution))}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">on {Math.round(eff)} incremental units</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Payback period</p><p className={`text-xl font-bold tabular-nums ${Number.isFinite(paybackMonths) && paybackMonths <= 12 ? "text-green-400" : "text-yellow-400"}`}>{Number.isFinite(paybackMonths) ? `${paybackMonths.toFixed(1)} mo` : "Never"}</p></div>
            <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Year-1 ROI</p><p className={`text-xl font-bold tabular-nums ${roiPct >= 0 ? "text-green-400" : "text-red-400"}`}>{Number.isFinite(roiPct) ? `${roiPct.toFixed(0)}%` : "—"}</p></div>
          </div>
          <div className={`rounded-lg p-4 border ${annualNet >= 0 && netPerUnit >= 0 ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}>
            <p className={`text-sm font-bold flex items-center gap-2 ${annualNet >= 0 && netPerUnit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {annualNet >= 0 && netPerUnit >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {netPerUnit < 0
                ? "Each unit loses money on this channel after fees, shipping and returns — adding it erodes profit regardless of volume."
                : annualNet >= 0
                  ? `Year-1 net profit of ${formatCurrency(Math.round(annualNet))} after setup — this channel is worth adding.`
                  : `Year-1 still ${formatCurrency(Math.round(Math.abs(annualNet)))} underwater after setup — only add if you expect volume or margin to improve.`}
            </p>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Cannibalization discounts units that would have sold on an existing channel anyway, so only genuinely incremental volume counts toward this channel's ROI. Per-return loss assumes freight both ways plus unrecovered cost.</p>
        </>
      )}
    </div>
  );
}
