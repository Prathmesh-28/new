import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Globe, ArrowLeftRight, TrendingUp, FileText, ScrollText, Landmark,
  Ship, Send, GitCompareArrows, Calculator, Receipt, BadgePercent,
  Plus, CheckCircle2, AlertTriangle, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";

// shared styles — reused TaxPage/DebtPage input class string
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

// Manual reference rates (INR per 1 unit) — owner edits these to today's rate.
const DEFAULT_RATES: Record<string, number> = { USD: 86.5, EUR: 93.2, GBP: 109.4, AED: 23.5, SGD: 64.1, AUD: 56.8, JPY: 0.57 };
const CURRENCIES = Object.keys(DEFAULT_RATES);
const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

type TabId =
  | "overview" | "fx-convert" | "fx-gainloss" | "export-invoice" | "firc-brc"
  | "lc-tracker" | "customs" | "payment-fees" | "transfer-pricing" | "gst-export" | "rodtep";

export default function GlobalPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Globe size={18} className="text-[var(--color-primary)]" /> Global &amp; Cross-Border
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            FX, exports &amp; FEMA toolkit — multi-currency maths, LUT invoicing, FIRC/BRC tracking, customs &amp; export-incentive estimators.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", Globe],
            ["fx-convert", "Currency Converter", ArrowLeftRight],
            ["fx-gainloss", "FX Gain / Loss", TrendingUp],
            ["export-invoice", "Export Invoice (LUT)", FileText],
            ["firc-brc", "FIRC / BRC Tracker", ScrollText],
            ["lc-tracker", "Letter of Credit", Landmark],
            ["customs", "Customs Duty", Ship],
            ["payment-fees", "Payment Fee Compare", Send],
            ["transfer-pricing", "Transfer Pricing", GitCompareArrows],
            ["gst-export", "GST Export Refund", Receipt],
            ["rodtep", "RoDTEP / Drawback", BadgePercent],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview onJump={setTab} />}
      {tab === "fx-convert" && <CurrencyConverter />}
      {tab === "fx-gainloss" && <FxGainLoss />}
      {tab === "export-invoice" && <ExportInvoiceBuilder />}
      {tab === "firc-brc" && <FircBrcTracker />}
      {tab === "lc-tracker" && <LetterOfCreditTracker />}
      {tab === "customs" && <CustomsDutyEstimator />}
      {tab === "payment-fees" && <PaymentFeeComparator />}
      {tab === "transfer-pricing" && <TransferPricingCalculator />}
      {tab === "gst-export" && <GstExportRefund />}
      {tab === "rodtep" && <RodtepDrawbackEstimator />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ onJump }: { onJump: (t: TabId) => void }) {
  const { store } = useApp();
  const fircs = (store.featureData?.["glb-firc-brc"] as FircRow[] | undefined) ?? [];
  const lcs = (store.featureData?.["glb-lc"] as LcRow[] | undefined) ?? [];
  const pendingBrc = fircs.filter(f => !f.brcReceived).length;
  const openLcValue = lcs.reduce((s, l) => s + (l.amount || 0), 0);

  const cards = [
    { label: "Reference USD rate", value: `₹${DEFAULT_RATES.USD}`, color: "text-[var(--color-text)]", sub: "Manual — set in converter" },
    { label: "FIRCs awaiting BRC", value: String(pendingBrc), color: pendingBrc > 0 ? "text-yellow-400" : "text-green-400", sub: `${fircs.length} remittance(s) tracked` },
    { label: "Open LC value", value: openLcValue > 0 ? fmtUSD(openLcValue) : "—", color: "text-blue-400", sub: `${lcs.length} letter(s) of credit` },
    { label: "FEMA realisation window", value: "9 months", color: "text-orange-400", sub: "From export date — track per shipment" },
  ];

  const tools: { id: TabId; title: string; desc: string }[] = [
    { id: "fx-convert", title: "Multi-Currency Converter", desc: "Convert with your own manual reference rates — no stale hardcoded numbers." },
    { id: "fx-gainloss", title: "FX Gain / Loss Calculator", desc: "Realised forex gain/loss between invoice rate and settlement rate." },
    { id: "export-invoice", title: "Export Invoice Builder", desc: "Zero-rated invoice with or without LUT, INR equivalent and FEMA notes." },
    { id: "firc-brc", title: "FIRC / BRC Tracker", desc: "Track inward remittances and realisation against the 9-month FEMA window." },
    { id: "lc-tracker", title: "Letter of Credit Checklist", desc: "UCP 600 document checklist and status tracker per LC." },
    { id: "customs", title: "Customs Duty Estimator", desc: "BCD + Social Welfare Surcharge + IGST landed-cost on imports." },
    { id: "payment-fees", title: "Payment Fee Comparator", desc: "Compare SWIFT wire vs fintech rails on fee + FX markup per corridor." },
    { id: "transfer-pricing", title: "Transfer Pricing Markup", desc: "Cost-plus / resale-minus arm's-length price for related-party deals." },
    { id: "gst-export", title: "GST Export Refund", desc: "Refund under LUT (unutilised ITC) or with IGST paid — estimate either route." },
    { id: "rodtep", title: "RoDTEP / Duty Drawback", desc: "Estimate remission scrip value and drawback on exported goods." },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1">Built for the Indian exporter / importer</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Everything here runs on your inputs — no live bank feed required. Designed around India&apos;s export framework:
          LUT zero-rating, FIRC/eBRC realisation, customs landed cost, and the RoDTEP / drawback incentive schemes.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        Estimates only. FX rates are manual; verify FEMA purpose codes, customs HSN duties and export-incentive rates with your AD bank, CHA and CA.
      </div>
    </div>
  );
}

// ── #1 Multi-Currency Converter (manual rates) ─────────────────────────────────
function CurrencyConverter() {
  const [rates, setRates] = useFeatureState<Record<string, number>>("glb-fx-rates", DEFAULT_RATES);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");
  const [amount, setAmount] = useState("1000");

  const rate = (code: string) => (code === "INR" ? 1 : rates[code] ?? DEFAULT_RATES[code] ?? 0);
  const amt = parseFloat(amount) || 0;
  const inInr = amt * rate(from);
  const converted = rate(to) > 0 ? inInr / rate(to) : 0;
  const crossRate = rate(to) > 0 ? rate(from) / rate(to) : 0;

  const updateRate = (code: string, v: string) => {
    const n = parseFloat(v);
    setRates({ ...rates, [code]: isNaN(n) ? 0 : n });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /> Multi-Currency Converter</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Set your own reference rate (INR per 1 unit of currency) — usually the RBI reference or your bank&apos;s card rate for the day.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">From</label>
            <select value={from} onChange={e => setFrom(e.target.value)} className={INP}>
              {["INR", ...CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">To</label>
            <select value={to} onChange={e => setTo(e.target.value)} className={INP}>
              {["INR", ...CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={() => { setFrom(to); setTo(from); }}
            className="flex items-center justify-center gap-1.5 bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm hover:border-[var(--color-primary)]/40">
            <ArrowLeftRight size={12} /> Swap
          </button>
        </div>
      </div>

      {amt > 0 && (
        <div className={`${CARD} p-5`}>
          <p className="text-xs text-[var(--color-muted)]">{amt.toLocaleString("en-IN")} {from} =</p>
          <p className="text-3xl font-bold tabular-nums text-[var(--color-primary)] mt-1">
            {converted.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {to}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-2">Cross rate: 1 {from} = {crossRate.toLocaleString("en-IN", { maximumFractionDigits: 4 })} {to} · INR equivalent {formatCurrency(Math.round(inInr))}</p>
        </div>
      )}

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Reference rates (₹ per 1 unit)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CURRENCIES.map(c => (
            <div key={c}>
              <label className="block text-xs text-[var(--color-muted)] mb-1">{c}</label>
              <input type="number" value={rates[c] ?? ""} onChange={e => updateRate(c, e.target.value)} placeholder={String(DEFAULT_RATES[c])} className={INP} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── #2 FX Gain / Loss Calculator ───────────────────────────────────────────────
function FxGainLoss() {
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [invoiceRate, setInvoiceRate] = useState("");
  const [settleRate, setSettleRate] = useState("");
  const [direction, setDirection] = useState<"receivable" | "payable">("receivable");

  const fAmt = parseFloat(amount) || 0;
  const iRate = parseFloat(invoiceRate) || 0;
  const sRate = parseFloat(settleRate) || 0;
  const valid = fAmt > 0 && iRate > 0 && sRate > 0;

  const invoiceInr = fAmt * iRate;
  const settleInr = fAmt * sRate;
  // Receivable: more INR received than booked = gain. Payable: more INR paid = loss.
  const rawDiff = settleInr - invoiceInr;
  const gain = direction === "receivable" ? rawDiff : -rawDiff;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Realised FX Gain / Loss</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">When the rate moves between invoice date and settlement date, you book a forex gain or loss (AS 11 / Ind-AS 21).</p>
        <div className="flex gap-2 mb-4">
          {(["receivable", "payable"] as const).map(d => (
            <button key={d} onClick={() => setDirection(d)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border capitalize transition-all ${direction === d ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {d === "receivable" ? "Export receivable (money in)" : "Import payable (money out)"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Foreign amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Rate at invoice (₹)</label>
            <input type="number" value={invoiceRate} onChange={e => setInvoiceRate(e.target.value)} placeholder="85.0" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Rate at settlement (₹)</label>
            <input type="number" value={settleRate} onChange={e => setSettleRate(e.target.value)} placeholder="86.5" className={INP} />
          </div>
        </div>
      </div>

      {valid && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Booked at invoice ({ccy} {fAmt.toLocaleString()} @ ₹{iRate})</span><span className="tabular-nums">{formatCurrency(Math.round(invoiceInr))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Settled value (@ ₹{sRate})</span><span className="tabular-nums">{formatCurrency(Math.round(settleInr))}</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">{gain >= 0 ? "Forex gain" : "Forex loss"}</span>
              <span className={`font-bold tabular-nums ${gain >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(gain))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">
            {gain >= 0
              ? `The ${direction} settled in your favour — book a forex gain to P&L.`
              : `The rate moved against you — book a forex loss to P&L.`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── #3 Export Invoice Builder (with / without LUT) ──────────────────────────────
function ExportInvoiceBuilder() {
  const { store } = useApp();
  const [buyer, setBuyer] = useState("");
  const [country, setCountry] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [fxRate, setFxRate] = useState(String(DEFAULT_RATES.USD));
  const [items, setItems] = useState<{ desc: string; qty: string; unit: string }[]>([{ desc: "", qty: "1", unit: "" }]);
  const [withLut, setWithLut] = useState(true);
  const [gstRate, setGstRate] = useState("18");

  const rate = parseFloat(fxRate) || 0;
  const gst = parseFloat(gstRate) || 0;
  const fcTotal = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unit) || 0), 0);
  const inrTotal = fcTotal * rate;
  // Under LUT: zero-rated, no IGST charged. Without LUT: pay IGST, claim refund later.
  const igst = withLut ? 0 : Math.round(inrTotal * gst / 100);

  const setItem = (i: number, k: "desc" | "qty" | "unit", v: string) =>
    setItems(items.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems([...items, { desc: "", qty: "1", unit: "" }]);
  const removeItem = (i: number) => setItems(items.length > 1 ? items.filter((_, idx) => idx !== i) : items);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Export Invoice Builder</h2>
        <p className="text-xs text-[var(--color-muted)]">Exports are zero-rated under GST. With an LUT you bill without IGST; without one you charge IGST and claim it back.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Buyer</label>
            <input value={buyer} onChange={e => setBuyer(e.target.value)} placeholder="Overseas client" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Destination country</label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="USA" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency</label>
            <select value={ccy} onChange={e => { setCcy(e.target.value); setFxRate(String(DEFAULT_RATES[e.target.value] ?? rate)); }} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">FX rate (₹ per 1 {ccy})</label>
            <input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">IGST rate % (if no LUT)</label>
            <input type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} className={INP} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={withLut} onChange={e => setWithLut(e.target.checked)} className="accent-[var(--color-primary)]" />
          Supplying under LUT (zero-rated, no IGST charged) — uncheck to pay IGST and claim refund
        </label>
      </div>

      <div className={`${CARD} p-5 space-y-2`}>
        <p className="text-sm font-semibold mb-1">Line items ({ccy})</p>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input value={it.desc} onChange={e => setItem(i, "desc", e.target.value)} placeholder="Description" className={`${INP} col-span-6`} />
            <input type="number" value={it.qty} onChange={e => setItem(i, "qty", e.target.value)} placeholder="Qty" className={`${INP} col-span-2`} />
            <input type="number" value={it.unit} onChange={e => setItem(i, "unit", e.target.value)} placeholder="Unit price" className={`${INP} col-span-3`} />
            <button onClick={() => removeItem(i)} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 flex justify-center"><Trash2 size={14} /></button>
          </div>
        ))}
        <button onClick={addItem} className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1 mt-1"><Plus size={12} /> Add line</button>
      </div>

      {fcTotal > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Invoice value</span><span className="tabular-nums font-semibold">{fcTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })} {ccy}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">INR equivalent (@ ₹{rate})</span><span className="tabular-nums">{formatCurrency(Math.round(inrTotal))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">IGST {withLut ? "(under LUT — zero-rated)" : `@ ${gst}%`}</span><span className={`tabular-nums ${withLut ? "text-green-400" : "text-orange-400"}`}>{withLut ? "₹0" : formatCurrency(igst)}</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">Total payable by buyer</span>
              <span className="font-bold tabular-nums">{withLut ? `${fcTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${ccy}` : `${fcTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${ccy} + ${formatCurrency(igst)} IGST`}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">
            {withLut
              ? `Add to invoice: "Supply meant for export under LUT — Bond No. ___, without payment of IGST (Sec 16, IGST Act)."${buyer ? ` Bill to ${buyer}${country ? `, ${country}` : ""}.` : ""}`
              : `IGST of ${formatCurrency(igst)} is paid now and refundable on furnishing shipping bill + FIRC/BRC.`}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">{store.firm?.gstRegistered === false ? "Your firm is marked GST-unregistered — LUT/zero-rating needs an active GSTIN. " : ""}A valid LUT must be filed each financial year (Form GST RFD-11).</p>
    </div>
  );
}

// ── #4 FIRC / BRC Tracker ──────────────────────────────────────────────────────
type FircRow = { id: string; ref: string; ccy: string; amount: number; remitDate: string; exportDate: string; firc: boolean; brcReceived: boolean };
function FircBrcTracker() {
  const [rows, setRows] = useFeatureState<FircRow[]>("glb-firc-brc", []);
  const [ref, setRef] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [remitDate, setRemitDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [exportDate, setExportDate] = useState(() => new Date().toISOString().split("T")[0]);
  const today = new Date();

  const add = () => {
    const amt = parseFloat(amount);
    if (!ref.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter a reference and a valid amount"); return; }
    setRows([...rows, { id: crypto.randomUUID(), ref: ref.trim(), ccy, amount: amt, remitDate, exportDate, firc: true, brcReceived: false }]);
    setRef(""); setAmount("");
    toast.success("Remittance tracked");
  };
  const toggle = (id: string, k: "firc" | "brcReceived") => setRows(rows.map(r => r.id === id ? { ...r, [k]: !r[k] } : r));

  // 9-month FEMA realisation window from export date.
  const deadline = (exp: string) => { const d = new Date(exp); d.setMonth(d.getMonth() + 9); return d; };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ScrollText size={14} className="text-[var(--color-primary)]" /> FIRC / BRC Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Track inward remittances, the FIRC from your AD bank, and eBRC realisation against the 9-month FEMA window.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Invoice / ref</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="INV-001" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ccy</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Export date</label>
            <input type="date" value={exportDate} onChange={e => setExportDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Remit date</label>
            <input type="date" value={remitDate} onChange={e => setRemitDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No remittances tracked yet. Add an export to monitor its realisation deadline.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Ref", "Amount", "Export date", "Realise by", "Days left", "FIRC", "eBRC", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const dl = deadline(r.exportDate);
                  const days = differenceInCalendarDays(dl, today);
                  const breached = !r.brcReceived && days < 0;
                  return (
                    <tr key={r.id} className={`hover:bg-white/2 ${breached ? "bg-red-950/20" : ""}`}>
                      <td className="px-3 py-2.5 font-medium">{r.ref}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.amount.toLocaleString()} {r.ccy}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{format(new Date(r.exportDate), "d MMM yyyy")}</td>
                      <td className="px-3 py-2.5 tabular-nums">{format(dl, "d MMM yyyy")}</td>
                      <td className={`px-3 py-2.5 tabular-nums font-semibold ${r.brcReceived ? "text-green-400" : days < 0 ? "text-red-400" : days < 30 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>
                        {r.brcReceived ? "Realised" : days < 0 ? `${Math.abs(days)}d over` : `${days}d`}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id, "firc")} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.firc ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.firc ? "Received" : "Pending"}</button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id, "brcReceived")} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.brcReceived ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.brcReceived ? "Issued" : "Pending"}</button>
                      </td>
                      <td className="px-3 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Export proceeds must be realised within 9 months of export (FEMA). Late realisation can attract RBI scrutiny and EDPMS caution-listing. eBRC is needed for export-incentive claims.</p>
    </div>
  );
}

// ── #5 Letter of Credit Checklist / Tracker ─────────────────────────────────────
type LcRow = { id: string; lcNo: string; bank: string; amount: number; ccy: string; expiry: string; docs: Record<string, boolean> };
const LC_DOCS = ["Commercial Invoice", "Bill of Lading / AWB", "Packing List", "Certificate of Origin", "Insurance Certificate", "Inspection Certificate", "Bill of Exchange / Draft"];
function LetterOfCreditTracker() {
  const [rows, setRows] = useFeatureState<LcRow[]>("glb-lc", []);
  const [lcNo, setLcNo] = useState("");
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [expiry, setExpiry] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    const amt = parseFloat(amount);
    if (!lcNo.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter an LC number and a valid amount"); return; }
    setRows([...rows, { id: crypto.randomUUID(), lcNo: lcNo.trim(), bank: bank.trim(), amount: amt, ccy, expiry, docs: {} }]);
    setLcNo(""); setBank(""); setAmount("");
    toast.success("LC added");
  };
  const toggleDoc = (id: string, doc: string) =>
    setRows(rows.map(r => r.id === id ? { ...r, docs: { ...r.docs, [doc]: !r.docs[doc] } } : r));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Letter of Credit Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Track each LC and tick off the UCP 600 document set — missing or discrepant docs are the #1 cause of payment delay.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">LC number</label>
            <input value={lcNo} onChange={e => setLcNo(e.target.value)} placeholder="LC-2026-01" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Issuing bank</label>
            <input value={bank} onChange={e => setBank(e.target.value)} placeholder="Bank" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ccy</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Expiry</label>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No LCs tracked. Add one to work through its document checklist.</p>
      ) : rows.map(r => {
        const done = LC_DOCS.filter(d => r.docs[d]).length;
        const ready = done === LC_DOCS.length;
        const days = differenceInCalendarDays(new Date(r.expiry), new Date());
        return (
          <div key={r.id} className={`${CARD} p-5`}>
            <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
              <div>
                <p className="text-sm font-semibold">{r.lcNo} <span className="text-[var(--color-muted)] font-normal">· {r.bank || "—"}</span></p>
                <p className="text-xs text-[var(--color-muted)]">{r.amount.toLocaleString()} {r.ccy} · expires {format(new Date(r.expiry), "d MMM yyyy")} ({days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`})</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ready ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{done}/{LC_DOCS.length} docs</span>
                <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {LC_DOCS.map(d => (
                <label key={d} className="flex items-center gap-2 text-xs cursor-pointer bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                  <input type="checkbox" checked={!!r.docs[d]} onChange={() => toggleDoc(r.id, d)} className="accent-[var(--color-primary)]" />
                  <span className={r.docs[d] ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}>{d}</span>
                </label>
              ))}
            </div>
            {ready && <p className="text-xs text-green-400 mt-3 flex items-center gap-1.5"><CheckCircle2 size={13} /> All documents ready — present to your negotiating bank before LC expiry.</p>}
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--color-muted)]">Generic UCP 600 checklist — your specific LC may require additional or different documents. Present documents within the LC&apos;s stipulated period (typically 21 days of shipment).</p>
    </div>
  );
}

// ── #6 Customs Duty Estimator ───────────────────────────────────────────────────
function CustomsDutyEstimator() {
  const [ccy, setCcy] = useState("USD");
  const [value, setValue] = useState("");
  const [fxRate, setFxRate] = useState(String(DEFAULT_RATES.USD));
  const [freight, setFreight] = useState("");
  const [insurance, setInsurance] = useState("");
  const [bcd, setBcd] = useState("10");
  const [igst, setIgst] = useState("18");

  const fcValue = parseFloat(value) || 0;
  const rate = parseFloat(fxRate) || 0;
  const fcFreight = parseFloat(freight) || 0;
  const fcInsurance = parseFloat(insurance) || 0;
  const bcdRate = parseFloat(bcd) || 0;
  const igstRate = parseFloat(igst) || 0;

  // CIF assessable value in INR.
  const assessable = (fcValue + fcFreight + fcInsurance) * rate;
  const bcdAmt = assessable * bcdRate / 100;
  // Social Welfare Surcharge: 10% of BCD.
  const swsAmt = bcdAmt * 0.10;
  // IGST is charged on assessable value + BCD + SWS.
  const igstBase = assessable + bcdAmt + swsAmt;
  const igstAmt = igstBase * igstRate / 100;
  const totalDuty = bcdAmt + swsAmt + igstAmt;
  const landed = assessable + totalDuty;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Ship size={14} className="text-[var(--color-primary)]" /> Customs Duty / Landed Cost Estimator</h2>
        <p className="text-xs text-[var(--color-muted)]">Estimate import duty on the CIF value: Basic Customs Duty + 10% Social Welfare Surcharge + IGST.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency</label>
            <select value={ccy} onChange={e => { setCcy(e.target.value); setFxRate(String(DEFAULT_RATES[e.target.value] ?? rate)); }} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Goods value (FOB)</label>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">FX rate (₹ per 1 {ccy})</label>
            <input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Freight ({ccy})</label>
            <input type="number" value={freight} onChange={e => setFreight(e.target.value)} placeholder="800" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Insurance ({ccy})</label>
            <input type="number" value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="100" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">BCD %</label>
            <input type="number" value={bcd} onChange={e => setBcd(e.target.value)} placeholder="10" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">IGST %</label>
            <input type="number" value={igst} onChange={e => setIgst(e.target.value)} placeholder="18" className={INP} />
          </div>
        </div>
      </div>

      {assessable > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            {[
              { label: "CIF assessable value (₹)", value: formatCurrency(Math.round(assessable)), color: "text-[var(--color-text)]" },
              { label: `Basic Customs Duty @ ${bcdRate}%`, value: formatCurrency(Math.round(bcdAmt)), color: "text-orange-400" },
              { label: "Social Welfare Surcharge (10% of BCD)", value: formatCurrency(Math.round(swsAmt)), color: "text-orange-400" },
              { label: `IGST @ ${igstRate}% (creditable as ITC)`, value: formatCurrency(Math.round(igstAmt)), color: "text-blue-400" },
              { label: "Total duty payable", value: formatCurrency(Math.round(totalDuty)), color: "text-red-400 font-bold" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">Total landed cost</span>
              <span className="font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(landed))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">IGST paid at import is generally available as input tax credit. Some HSNs attract additional duties (AIDC, anti-dumping, compensation cess) not modelled here.</p>
        </div>
      )}
    </div>
  );
}

// ── #7 Cross-Border Payment Fee Comparator ──────────────────────────────────────
type RailRow = { id: string; name: string; flatFee: string; markupPct: string };
function PaymentFeeComparator() {
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [mid, setMid] = useState(String(DEFAULT_RATES.USD));
  const [rails, setRails] = useFeatureState<RailRow[]>("glb-pay-rails", [
    { id: "swift", name: "Bank SWIFT wire", flatFee: "1500", markupPct: "2.5" },
    { id: "fintech", name: "Fintech / Wise-style", flatFee: "400", markupPct: "0.5" },
  ]);

  const fAmt = parseFloat(amount) || 0;
  const midRate = parseFloat(mid) || 0;

  const evaluated = useMemo(() => rails.map(r => {
    const markup = parseFloat(r.markupPct) || 0;
    const flat = parseFloat(r.flatFee) || 0;
    // Customer/you receive money converted at a worse rate; cost = mid-value minus delivered + flat fee.
    const effRate = midRate * (1 - markup / 100);
    const deliveredInr = fAmt * effRate;
    const midInr = fAmt * midRate;
    const fxCost = midInr - deliveredInr;
    const totalCost = fxCost + flat;
    return { ...r, effRate, deliveredInr: deliveredInr - flat, totalCost, fxCost, flat };
  }).sort((a, b) => a.totalCost - b.totalCost), [rails, fAmt, midRate]);

  const best = evaluated[0];
  const setRail = (id: string, k: "flatFee" | "markupPct" | "name", v: string) =>
    setRails(rails.map(r => r.id === id ? { ...r, [k]: v } : r));
  const addRail = () => setRails([...rails, { id: crypto.randomUUID(), name: "New provider", flatFee: "0", markupPct: "1" }]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Send size={14} className="text-[var(--color-primary)]" /> Cross-Border Payment Fee Comparator</h2>
        <p className="text-xs text-[var(--color-muted)]">Banks hide most of the cost in the FX markup, not the flat fee. Compare the true all-in cost per rail.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency received</label>
            <select value={ccy} onChange={e => { setCcy(e.target.value); setMid(String(DEFAULT_RATES[e.target.value] ?? midRate)); }} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount ({ccy})</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Mid-market rate (₹)</label>
            <input type="number" value={mid} onChange={e => setMid(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-2`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Providers</p>
          <button onClick={addRail} className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"><Plus size={12} /> Add provider</button>
        </div>
        {rails.map(r => (
          <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
            <input value={r.name} onChange={e => setRail(r.id, "name", e.target.value)} className={`${INP} col-span-6`} />
            <input type="number" value={r.flatFee} onChange={e => setRail(r.id, "flatFee", e.target.value)} placeholder="Flat fee ₹" className={`${INP} col-span-2`} />
            <input type="number" value={r.markupPct} onChange={e => setRail(r.id, "markupPct", e.target.value)} placeholder="FX markup %" className={`${INP} col-span-3`} />
            <button onClick={() => setRails(rails.filter(x => x.id !== r.id))} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 flex justify-center"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {fAmt > 0 && midRate > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Provider", "Eff. rate", "FX cost", "Flat fee", "All-in cost", "You receive"].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {evaluated.map(r => (
                  <tr key={r.id} className={`hover:bg-white/2 ${best && r.id === best.id ? "bg-green-950/20" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">{r.name}{best && r.id === best.id && <span className="ml-1.5 text-[9px] text-green-400 font-semibold">CHEAPEST</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums">₹{r.effRate.toFixed(3)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(r.fxCost))}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatCurrency(Math.round(r.flat))}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-red-400">{formatCurrency(Math.round(r.totalCost))}</td>
                    <td className="px-3 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.deliveredInr))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {best && fAmt > 0 && evaluated.length > 1 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400 flex items-center gap-2">
            <CheckCircle2 size={14} /> {best.name} is cheapest — saving {formatCurrency(Math.round(evaluated[evaluated.length - 1].totalCost - best.totalCost))} vs the most expensive option on this transfer.
          </p>
        </div>
      )}
    </div>
  );
}

// ── #8 Transfer-Pricing Markup Calculator ───────────────────────────────────────
function TransferPricingCalculator() {
  const [method, setMethod] = useState<"costplus" | "resaleminus">("costplus");
  const [base, setBase] = useState("");
  const [markup, setMarkup] = useState("15");

  const b = parseFloat(base) || 0;
  const m = parseFloat(markup) || 0;
  // Cost-plus: arm's-length price = cost × (1 + markup). Resale-minus: arm's-length cost = price × (1 − margin).
  const result = method === "costplus" ? b * (1 + m / 100) : b * (1 - m / 100);
  const profit = method === "costplus" ? result - b : b - result;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><GitCompareArrows size={14} className="text-[var(--color-primary)]" /> Transfer-Pricing Markup</h2>
        <p className="text-xs text-[var(--color-muted)]">Compute the arm&apos;s-length price for a related-party (associated enterprise) transaction under the cost-plus or resale-price method.</p>
        <div className="flex gap-2">
          {([["costplus", "Cost Plus (CPM)"], ["resaleminus", "Resale Price (RPM)"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setMethod(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${method === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">{method === "costplus" ? "Cost of production / service (₹)" : "Resale price to third party (₹)"}</label>
            <input type="number" value={base} onChange={e => setBase(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">{method === "costplus" ? "Arm's-length markup %" : "Arm's-length gross margin %"}</label>
            <input type="number" value={markup} onChange={e => setMarkup(e.target.value)} placeholder="15" className={INP} />
          </div>
        </div>
      </div>

      {b > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">{method === "costplus" ? "Cost base" : "Resale price"}</span><span className="tabular-nums">{formatCurrency(Math.round(b))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">{method === "costplus" ? `Markup @ ${m}%` : `Margin @ ${m}%`}</span><span className="tabular-nums text-blue-400">{formatCurrency(Math.round(profit))}</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">{method === "costplus" ? "Arm's-length transfer price" : "Arm's-length cost to associated enterprise"}</span>
              <span className="font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(result))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">If your actual related-party price differs from this band, a TP adjustment may apply. Document the markup with comparable-company benchmarking (Rule 10B/10C) and consult your CA for the Form 3CEB.</p>
        </div>
      )}
    </div>
  );
}

// ── #9 GST on Exports / Refund Estimator ────────────────────────────────────────
function GstExportRefund() {
  const [route, setRoute] = useState<"lut" | "igst">("lut");
  const [exportTurnover, setExportTurnover] = useState("");
  const [totalTurnover, setTotalTurnover] = useState("");
  const [netItc, setNetItc] = useState("");
  const [igstPaid, setIgstPaid] = useState("");

  const expT = parseFloat(exportTurnover) || 0;
  const totT = parseFloat(totalTurnover) || expT;
  const itc = parseFloat(netItc) || 0;
  const igst = parseFloat(igstPaid) || 0;

  // Rule 89(4) formula for refund of unutilised ITC under LUT.
  const lutRefund = totT > 0 ? Math.round((expT / totT) * itc) : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> GST Export Refund Estimator</h2>
        <p className="text-xs text-[var(--color-muted)]">Exports are zero-rated. Recover GST either as a refund of unutilised ITC (under LUT) or as a refund of the IGST you paid.</p>
        <div className="flex gap-2">
          {([["lut", "Under LUT (refund unutilised ITC)"], ["igst", "With IGST paid (refund IGST)"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setRoute(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${route === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        {route === "lut" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Zero-rated (export) turnover ₹</label>
              <input type="number" value={exportTurnover} onChange={e => setExportTurnover(e.target.value)} placeholder="3000000" className={INP} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Total turnover ₹</label>
              <input type="number" value={totalTurnover} onChange={e => setTotalTurnover(e.target.value)} placeholder="4000000" className={INP} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Net ITC for the period ₹</label>
              <input type="number" value={netItc} onChange={e => setNetItc(e.target.value)} placeholder="250000" className={INP} />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">IGST paid on export invoices ₹</label>
            <input type="number" value={igstPaid} onChange={e => setIgstPaid(e.target.value)} placeholder="200000" className={`${INP} max-w-xs`} />
          </div>
        )}
      </div>

      {((route === "lut" && expT > 0 && itc > 0) || (route === "igst" && igst > 0)) && (
        <div className={`${CARD} p-5`}>
          {route === "lut" ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Export / total turnover ratio</span><span className="tabular-nums">{totT > 0 ? `${((expT / totT) * 100).toFixed(1)}%` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted)]">Net ITC</span><span className="tabular-nums">{formatCurrency(Math.round(itc))}</span></div>
              <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
                <span className="font-semibold">Refund of unutilised ITC (Rule 89(4))</span>
                <span className="font-bold tabular-nums text-green-400">{formatCurrency(lutRefund)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between pt-2">
                <span className="font-semibold">IGST refund claimable</span>
                <span className="font-bold tabular-nums text-green-400">{formatCurrency(Math.round(igst))}</span>
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">Refunded automatically once the shipping bill and GSTR-3B/GSTR-1 match on the ICEGATE–GSTN system — no separate RFD-01 needed.</p>
            </div>
          )}
          <p className="text-[11px] text-[var(--color-muted)] mt-3">File via RFD-01 (LUT route) with realisation proof (FIRC/BRC). The Rule 89(4) formula caps the ITC refund by the export-turnover ratio.</p>
        </div>
      )}
    </div>
  );
}

// ── #10 RoDTEP / Duty Drawback Estimator ────────────────────────────────────────
function RodtepDrawbackEstimator() {
  const [scheme, setScheme] = useState<"rodtep" | "drawback">("rodtep");
  const [fobInr, setFobInr] = useState("");
  const [ratePct, setRatePct] = useState("1.5");
  const [cap, setCap] = useState("");

  const fob = parseFloat(fobInr) || 0;
  const r = parseFloat(ratePct) || 0;
  const capVal = parseFloat(cap) || 0;
  const raw = fob * r / 100;
  const benefit = capVal > 0 ? Math.min(raw, capVal) : raw;
  const capped = capVal > 0 && raw > capVal;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><BadgePercent size={14} className="text-[var(--color-primary)]" /> RoDTEP / Duty Drawback Estimator</h2>
        <p className="text-xs text-[var(--color-muted)]">Estimate export-incentive remission. RoDTEP rebates embedded taxes as transferable scrips; Duty Drawback refunds customs duty on inputs.</p>
        <div className="flex gap-2">
          {([["rodtep", "RoDTEP (scrip)"], ["drawback", "Duty Drawback"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setScheme(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${scheme === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">FOB value of exports (₹)</label>
            <input type="number" value={fobInr} onChange={e => setFobInr(e.target.value)} placeholder="5000000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">{scheme === "rodtep" ? "RoDTEP rate %" : "Drawback rate %"} (per HSN)</label>
            <input type="number" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="1.5" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Per-unit / value cap ₹ (optional)</label>
            <input type="number" value={cap} onChange={e => setCap(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {fob > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">FOB value</span><span className="tabular-nums">{formatCurrency(Math.round(fob))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">{scheme === "rodtep" ? "RoDTEP" : "Drawback"} @ {r}%</span><span className="tabular-nums">{formatCurrency(Math.round(raw))}</span></div>
            {capped && <div className="flex justify-between"><span className="text-[var(--color-muted)]">Capped at</span><span className="tabular-nums text-yellow-400">{formatCurrency(Math.round(capVal))}</span></div>}
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">{scheme === "rodtep" ? "Estimated scrip value" : "Estimated drawback"}</span>
              <span className="font-bold tabular-nums text-green-400">{formatCurrency(Math.round(benefit))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">
            {scheme === "rodtep"
              ? "RoDTEP is credited as a transferable duty-credit scrip in your ICEGATE ledger — usable for BCD or sellable. Rates are notified per HSN (Appendix 4R)."
              : "Drawback is credited to your bank account against the shipping bill. You cannot claim both RoDTEP and drawback on the same export item where overlapping."}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rates vary by HSN and change with each notification — verify the current rate against the official RoDTEP / All-Industry Drawback schedule for your product.</p>
    </div>
  );
}
