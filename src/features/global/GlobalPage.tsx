import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Globe, ArrowLeftRight, TrendingUp, FileText, ScrollText, Landmark,
  Ship, Send, GitCompareArrows, Calculator, Receipt, BadgePercent,
  Plus, CheckCircle2, AlertTriangle, Trash2,
  Layers, Smartphone, Wallet, PiggyBank, Scale, ClipboardList, Map, BadgeCheck, Percent,
  FileCode2, CalendarClock, CalendarCheck, Building2, ShieldAlert, Building, Boxes,
  Coins, HandCoins, Hourglass, Banknote,
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
  | "lc-tracker" | "customs" | "payment-fees" | "transfer-pricing" | "gst-export" | "rodtep"
  | "fx-forward" | "bank-consolidate" | "swift-upi" | "packing-credit" | "eefc-tracker"
  | "dtaa-lookup" | "advance-auth" | "country-sales" | "iec-adcode" | "tcs-lrs"
  | "softex" | "lut-renewal" | "fema-calendar" | "odi-fdi" | "country-risk" | "gift-city" | "incoterms"
  | "mc-pnl" | "wht-recovery" | "edpms-aging" | "bank-charge-recon";

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
            ["fx-forward", "FX Forward Cover", Calculator],
            ["bank-consolidate", "FCY Balances", Layers],
            ["swift-upi", "SWIFT vs UPI Intl", Smartphone],
            ["packing-credit", "Packing Credit", PiggyBank],
            ["eefc-tracker", "EEFC Account", Wallet],
            ["dtaa-lookup", "DTAA Withholding", Scale],
            ["advance-auth", "AA / EPCG", ClipboardList],
            ["country-sales", "Country Sales", Map],
            ["iec-adcode", "IEC / AD Code", BadgeCheck],
            ["tcs-lrs", "LRS / TCS", Percent],
            ["softex", "SOFTEX Tracker", FileCode2],
            ["lut-renewal", "LUT Renewal", CalendarCheck],
            ["fema-calendar", "FEMA Calendar", CalendarClock],
            ["odi-fdi", "ODI / FDI", Building2],
            ["country-risk", "Country Risk", ShieldAlert],
            ["gift-city", "GIFT City", Building],
            ["incoterms", "Incoterms Split", Boxes],
            ["mc-pnl", "Multi-Currency P&L", Coins],
            ["wht-recovery", "WHT Recovery", HandCoins],
            ["edpms-aging", "Realisation Aging", Hourglass],
            ["bank-charge-recon", "Bank Charge Recon", Banknote],
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
      {tab === "fx-forward" && <FxForwardCover />}
      {tab === "bank-consolidate" && <FcyBalanceConsolidator />}
      {tab === "swift-upi" && <SwiftVsUpiCompare />}
      {tab === "packing-credit" && <PackingCreditCalculator />}
      {tab === "eefc-tracker" && <EefcAccountTracker />}
      {tab === "dtaa-lookup" && <DtaaWithholdingLookup />}
      {tab === "advance-auth" && <AdvanceAuthEpcgTracker />}
      {tab === "country-sales" && <CountrySalesSummary />}
      {tab === "iec-adcode" && <IecAdCodeTracker />}
      {tab === "tcs-lrs" && <LrsTcsCalculator />}
      {tab === "softex" && <SoftexTracker />}
      {tab === "lut-renewal" && <LutRenewalTracker />}
      {tab === "fema-calendar" && <FemaComplianceCalendar />}
      {tab === "odi-fdi" && <OdiFdiTracker />}
      {tab === "country-risk" && <CountryRiskScorecard />}
      {tab === "gift-city" && <GiftCityEstimator />}
      {tab === "incoterms" && <IncotermsSplitter />}
      {tab === "mc-pnl" && <MultiCurrencyPnl />}
      {tab === "wht-recovery" && <WhtRecoveryTracker />}
      {tab === "edpms-aging" && <ExportRealisationAging />}
      {tab === "bank-charge-recon" && <ForeignBankChargeRecon />}
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
    { id: "fx-forward", title: "FX Forward Cover Calculator", desc: "Price a forward contract from spot + forward points and see your locked-in INR." },
    { id: "bank-consolidate", title: "FCY Balance Consolidator", desc: "Add foreign-currency balances across banks and see one INR-normalised total." },
    { id: "swift-upi", title: "SWIFT vs UPI-International", desc: "Compare cost of a SWIFT wire against UPI / fintech rails for small inbound sums." },
    { id: "packing-credit", title: "Packing Credit (PCFC) Interest", desc: "Pre-shipment interest cost over the credit period at your sanctioned rate." },
    { id: "eefc-tracker", title: "EEFC Account Tracker", desc: "Log FCY credits and INR conversions; watch the one-month retention window." },
    { id: "dtaa-lookup", title: "DTAA Withholding Lookup", desc: "Treaty withholding rate by country and income type, net of grossing-up." },
    { id: "advance-auth", title: "Advance Auth / EPCG Tracker", desc: "Track export obligation versus fulfilment under AA / EPCG with the deadline." },
    { id: "country-sales", title: "Country-wise Sales Summary", desc: "Group your invoices by destination country to see top export markets." },
    { id: "iec-adcode", title: "IEC / AD-Code Register", desc: "Keep your IEC, AD codes and port registrations in one place with renewals." },
    { id: "tcs-lrs", title: "LRS / TCS Calculator", desc: "Tax Collected at Source on outward LRS remittances above the threshold." },
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

// ── #11 FX Forward Cover (hedging) Calculator ───────────────────────────────────
function FxForwardCover() {
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [spot, setSpot] = useState(String(DEFAULT_RATES.USD));
  const [points, setPoints] = useState("0.45");
  const [months, setMonths] = useState("3");
  const [direction, setDirection] = useState<"sell" | "buy">("sell");

  const amt = parseFloat(amount) || 0;
  const sp = parseFloat(spot) || 0;
  const pts = parseFloat(points) || 0;
  const m = parseFloat(months) || 0;
  // Indian forwards usually trade at a premium for USD (INR depreciates) — exporter sells fwd, importer buys fwd.
  const forwardRate = sp + pts;
  const spotInr = amt * sp;
  const forwardInr = amt * forwardRate;
  const gainVsSpot = direction === "sell" ? forwardInr - spotInr : spotInr - forwardInr;
  const annualisedPct = sp > 0 && m > 0 ? (pts / sp) * (12 / m) * 100 : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> FX Forward Cover Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">Lock tomorrow&apos;s rate today. Booking a forward fixes your INR realisation so a quote can&apos;t be eaten by an adverse move.</p>
        <div className="flex gap-2">
          {(["sell", "buy"] as const).map(d => (
            <button key={d} onClick={() => setDirection(d)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${direction === d ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {d === "sell" ? "Sell forward (exporter — locking inflow)" : "Buy forward (importer — locking outflow)"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency</label>
            <select value={ccy} onChange={e => { setCcy(e.target.value); setSpot(String(DEFAULT_RATES[e.target.value] ?? sp)); }} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount ({ccy})</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Spot rate (₹)</label>
            <input type="number" value={spot} onChange={e => setSpot(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Forward points (₹)</label>
            <input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="0.45" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Tenor (months)</label>
            <input type="number" value={months} onChange={e => setMonths(e.target.value)} placeholder="3" className={INP} />
          </div>
        </div>
      </div>

      {amt > 0 && sp > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Forward rate (spot + points)</span><span className="tabular-nums font-semibold">₹{forwardRate.toFixed(4)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Value at spot</span><span className="tabular-nums">{formatCurrency(Math.round(spotInr))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Value locked at forward</span><span className="tabular-nums">{formatCurrency(Math.round(forwardInr))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Annualised forward premium</span><span className="tabular-nums">{annualisedPct.toFixed(2)}%</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">{gainVsSpot >= 0 ? "Pick-up vs spot today" : "Cost vs spot today"}</span>
              <span className={`font-bold tabular-nums ${gainVsSpot >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(gainVsSpot))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">A forward booked against an underlying export/import order needs no separate margin documentation. Cancel/roll if the order changes — premium is non-refundable on cancellation.</p>
        </div>
      )}
    </div>
  );
}

// ── #12 Multi-Currency Bank Balance Consolidator ────────────────────────────────
type FcyRow = { id: string; bank: string; ccy: string; balance: number };
function FcyBalanceConsolidator() {
  const [rows, setRows] = useFeatureState<FcyRow[]>("glb-fcy-balances", []);
  const [rates] = useFeatureState<Record<string, number>>("glb-fx-rates", DEFAULT_RATES);
  const [bank, setBank] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [balance, setBalance] = useState("");

  const rate = (code: string) => (code === "INR" ? 1 : rates[code] ?? DEFAULT_RATES[code] ?? 0);
  const add = () => {
    const bal = parseFloat(balance);
    if (!bank.trim() || isNaN(bal)) { toast.error("Enter a bank/account and a balance"); return; }
    setRows([...rows, { id: crypto.randomUUID(), bank: bank.trim(), ccy, balance: bal }]);
    setBank(""); setBalance("");
    toast.success("Balance added");
  };

  const totalInr = rows.reduce((s, r) => s + r.balance * rate(r.ccy), 0);
  const byCcy = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(r => { map[r.ccy] = (map[r.ccy] || 0) + r.balance; });
    return Object.entries(map).sort((a, b) => b[1] * rate(b[0]) - a[1] * rate(a[0]));
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Multi-Currency Bank Balance Consolidator</h2>
        <p className="text-xs text-[var(--color-muted)]">A Nostro-style view: add each foreign-currency bank balance once and see a single INR-normalised total using your converter&apos;s reference rates.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Bank / account</label>
            <input value={bank} onChange={e => setBank(e.target.value)} placeholder="HDFC EEFC USD" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>{["INR", ...CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Balance</label>
            <input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="25000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No balances added yet. Add each foreign-currency account to see your consolidated position.</p>
      ) : (
        <>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Bank / account", "Currency", "Balance", "Rate (₹)", "INR value", ""].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{r.bank}</td>
                      <td className="px-3 py-2.5">{r.ccy}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.balance.toLocaleString()}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{r.ccy === "INR" ? "1" : rate(r.ccy).toFixed(2)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatCurrency(Math.round(r.balance * rate(r.ccy)))}</td>
                      <td className="px-3 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`${CARD} p-4 md:col-span-1`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">Total consolidated balance</p>
              <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(totalInr))}</p>
            </div>
            <div className={`${CARD} p-4 md:col-span-2`}>
              <p className="text-xs text-[var(--color-muted)] mb-2">Net position by currency</p>
              <div className="flex flex-wrap gap-2">
                {byCcy.map(([c, v]) => (
                  <span key={c} className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1 tabular-nums">{c} {v.toLocaleString()}</span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">INR values use the reference rates set in the Currency Converter. Update those rates to re-value this view. Holdings in an EEFC account have a one-month conversion window.</p>
    </div>
  );
}

// ── #13 SWIFT vs UPI-International Fee Compare ───────────────────────────────────
function SwiftVsUpiCompare() {
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [mid, setMid] = useState(String(DEFAULT_RATES.USD));
  // SWIFT: flat correspondent fees + a wider FX spread; UPI-intl/fintech: small flat + tight spread, but caps apply.
  const [swiftFlat, setSwiftFlat] = useState("1200");
  const [swiftSpread, setSwiftSpread] = useState("2.0");
  const [upiFlat, setUpiFlat] = useState("0");
  const [upiSpread, setUpiSpread] = useState("0.6");

  const amt = parseFloat(amount) || 0;
  const midRate = parseFloat(mid) || 0;
  const calc = (flatStr: string, spreadStr: string) => {
    const flat = parseFloat(flatStr) || 0;
    const spread = parseFloat(spreadStr) || 0;
    const eff = midRate * (1 - spread / 100);
    const delivered = amt * eff - flat;
    return { delivered, fxCost: amt * midRate - amt * eff, flat, total: amt * midRate - delivered };
  };
  const swift = calc(swiftFlat, swiftSpread);
  const upi = calc(upiFlat, upiSpread);
  const valid = amt > 0 && midRate > 0;
  const saving = swift.total - upi.total;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Smartphone size={14} className="text-[var(--color-primary)]" /> SWIFT vs UPI-International Fee Compare</h2>
        <p className="text-xs text-[var(--color-muted)]">For smaller inbound payments, UPI-international / fintech rails often beat a SWIFT wire on both flat fee and FX spread. Compare the all-in cost.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency</label>
            <select value={ccy} onChange={e => { setCcy(e.target.value); setMid(String(DEFAULT_RATES[e.target.value] ?? midRate)); }} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount ({ccy})</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="2000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Mid-market rate (₹)</label>
            <input type="number" value={mid} onChange={e => setMid(e.target.value)} className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-2">
            <p className="text-xs font-semibold">SWIFT wire</p>
            <input type="number" value={swiftFlat} onChange={e => setSwiftFlat(e.target.value)} placeholder="Flat fee ₹" className={INP} />
            <input type="number" value={swiftSpread} onChange={e => setSwiftSpread(e.target.value)} placeholder="FX spread %" className={INP} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold">UPI-intl / fintech</p>
            <input type="number" value={upiFlat} onChange={e => setUpiFlat(e.target.value)} placeholder="Flat fee ₹" className={INP} />
            <input type="number" value={upiSpread} onChange={e => setUpiSpread(e.target.value)} placeholder="FX spread %" className={INP} />
          </div>
        </div>
      </div>

      {valid && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Rail", "FX cost", "Flat fee", "All-in cost", "You receive"].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {([["SWIFT wire", swift], ["UPI-intl / fintech", upi]] as const).map(([name, r]) => (
                  <tr key={name} className={`hover:bg-white/2 ${r.total <= Math.min(swift.total, upi.total) ? "bg-green-950/20" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">{name}{r.total <= Math.min(swift.total, upi.total) && <span className="ml-1.5 text-[9px] text-green-400 font-semibold">CHEAPEST</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(r.fxCost))}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatCurrency(Math.round(r.flat))}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-red-400">{formatCurrency(Math.round(r.total))}</td>
                    <td className="px-3 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.delivered))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Math.abs(saving) > 0 && (
            <div className="px-4 py-3 text-xs border-t border-[var(--color-border)]">
              {saving > 0
                ? <span className="text-green-400 font-semibold flex items-center gap-1.5"><CheckCircle2 size={13} /> UPI-intl / fintech saves {formatCurrency(Math.round(saving))} on this inbound payment.</span>
                : <span className="text-[var(--color-muted)]">SWIFT is cheaper here by {formatCurrency(Math.round(-saving))} — usually only at larger ticket sizes.</span>}
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">UPI-international / fintech rails carry per-transaction and annual caps and may not suit large export receipts. FIRC/eBRC must still be obtainable for the inbound credit.</p>
    </div>
  );
}

// ── #14 Packing Credit (PCFC) Interest Calculator ───────────────────────────────
function PackingCreditCalculator() {
  const [principal, setPrincipal] = useState("");
  const [ratePct, setRatePct] = useState("8.5");
  const [days, setDays] = useState("90");
  const [subventionPct, setSubventionPct] = useState("0");

  const p = parseFloat(principal) || 0;
  const r = parseFloat(ratePct) || 0;
  const d = parseFloat(days) || 0;
  const sub = parseFloat(subventionPct) || 0;
  const effRate = Math.max(0, r - sub);
  // Simple interest on a 365-day basis over the pre-shipment period.
  const grossInterest = p * r / 100 * d / 365;
  const netInterest = p * effRate / 100 * d / 365;
  const subAmount = grossInterest - netInterest;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Packing Credit (PCFC) Interest</h2>
        <p className="text-xs text-[var(--color-muted)]">Pre-shipment finance against a confirmed export order. Estimate the interest cost over the credit period, net of any interest-equalisation subvention.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Drawdown (₹)</label>
            <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="1000000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Interest rate % p.a.</label>
            <input type="number" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="8.5" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Credit period (days)</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} placeholder="90" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Subvention % (if any)</label>
            <input type="number" value={subventionPct} onChange={e => setSubventionPct(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {p > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Gross interest @ {r}% for {d}d</span><span className="tabular-nums">{formatCurrency(Math.round(grossInterest))}</span></div>
            {sub > 0 && <div className="flex justify-between"><span className="text-[var(--color-muted)]">Less interest-equalisation @ {sub}%</span><span className="tabular-nums text-green-400">- {formatCurrency(Math.round(subAmount))}</span></div>}
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Effective rate after subvention</span><span className="tabular-nums">{effRate.toFixed(2)}% p.a.</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">Net interest cost</span>
              <span className="font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(netInterest))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">Packing credit must be liquidated from export proceeds (or eligible substitution) within the sanctioned period, typically up to 180/270 days. Unliquidated PCFC attracts commercial-rate interest.</p>
        </div>
      )}
    </div>
  );
}

// ── #15 EEFC Account Tracker ─────────────────────────────────────────────────────
type EefcRow = { id: string; ref: string; ccy: string; amount: number; date: string; converted: boolean };
function EefcAccountTracker() {
  const [rows, setRows] = useFeatureState<EefcRow[]>("glb-eefc", []);
  const [ref, setRef] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    const amt = parseFloat(amount);
    if (!ref.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter a reference and a valid amount"); return; }
    setRows([...rows, { id: crypto.randomUUID(), ref: ref.trim(), ccy, amount: amt, date, converted: false }]);
    setRef(""); setAmount("");
    toast.success("Credit logged");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, converted: !r.converted } : r));

  // EEFC: balances should be converted to INR by the last day of the month following the month of credit.
  const convertBy = (credit: string) => { const dt = new Date(credit); dt.setMonth(dt.getMonth() + 2, 0); return dt; };
  const heldByCcy = useMemo(() => {
    const map: Record<string, number> = {};
    rows.filter(r => !r.converted).forEach(r => { map[r.ccy] = (map[r.ccy] || 0) + r.amount; });
    return Object.entries(map);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> EEFC Account Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">An Exchange Earners&apos; Foreign Currency account lets you hold export earnings in FCY and pay overseas without re-converting — but unconverted balances must be sold to INR by month-end of the next month.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ref</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="INV-021" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ccy</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Credit date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {heldByCcy.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {heldByCcy.map(([c, v]) => (
            <span key={c} className={`${CARD} px-3 py-1.5 text-xs tabular-nums`}>Held in {c}: <span className="font-semibold">{v.toLocaleString()}</span></span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No EEFC credits logged. Add a foreign-currency credit to track its conversion deadline.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Ref", "Amount", "Credited", "Convert by", "Days left", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const cb = convertBy(r.date);
                  const days = differenceInCalendarDays(cb, new Date());
                  const breach = !r.converted && days < 0;
                  return (
                    <tr key={r.id} className={`hover:bg-white/2 ${breach ? "bg-red-950/20" : ""}`}>
                      <td className="px-3 py-2.5 font-medium">{r.ref}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.amount.toLocaleString()} {r.ccy}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{format(new Date(r.date), "d MMM yyyy")}</td>
                      <td className="px-3 py-2.5 tabular-nums">{format(cb, "d MMM yyyy")}</td>
                      <td className={`px-3 py-2.5 tabular-nums font-semibold ${r.converted ? "text-green-400" : days < 0 ? "text-red-400" : days < 7 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>
                        {r.converted ? "—" : days < 0 ? `${Math.abs(days)}d over` : `${days}d`}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id)} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.converted ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.converted ? "Converted" : "Held in FCY"}</button>
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
      <p className="text-[10px] text-[var(--color-muted)]">Conversion rule: the sum total of accruals in a calendar month must be converted to INR on or before the last day of the succeeding month, net of utilisation. No interest is payable on EEFC balances. Confirm current rules with your AD bank.</p>
    </div>
  );
}

// ── #16 Withholding Tax by Treaty (DTAA) Lookup ─────────────────────────────────
const DTAA: Record<string, { royalty: number; fts: number; interest: number; dividend: number }> = {
  "USA": { royalty: 15, fts: 15, interest: 15, dividend: 25 },
  "UK": { royalty: 15, fts: 15, interest: 15, dividend: 15 },
  "Singapore": { royalty: 10, fts: 10, interest: 15, dividend: 15 },
  "UAE": { royalty: 10, fts: 10, interest: 12.5, dividend: 10 },
  "Germany": { royalty: 10, fts: 10, interest: 10, dividend: 10 },
  "Netherlands": { royalty: 10, fts: 10, interest: 10, dividend: 10 },
  "Japan": { royalty: 10, fts: 10, interest: 10, dividend: 10 },
  "Australia": { royalty: 10, fts: 10, interest: 15, dividend: 15 },
  "France": { royalty: 10, fts: 10, interest: 10, dividend: 10 },
};
function DtaaWithholdingLookup() {
  const [country, setCountry] = useState("USA");
  const [income, setIncome] = useState<"royalty" | "fts" | "interest" | "dividend">("fts");
  const [amount, setAmount] = useState("");
  const [grossUp, setGrossUp] = useState(false);

  const treaty = DTAA[country];
  const rate = treaty[income];
  const amt = parseFloat(amount) || 0;
  // Domestic non-treaty rate for FTS/royalty under s.115A is commonly higher; treaty is usually beneficial.
  const tax = amt * rate / 100;
  // If grossed-up (you bear the tax), the payment is grossed so the vendor receives `amt` net.
  const grossed = grossUp && rate < 100 ? amt / (1 - rate / 100) : amt;
  const grossedTax = grossed - (grossUp ? amt : amt - tax);

  const LABELS: Record<typeof income, string> = { royalty: "Royalty", fts: "Fees for technical services", interest: "Interest", dividend: "Dividend" };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> DTAA Withholding-Tax Lookup</h2>
        <p className="text-xs text-[var(--color-muted)]">Find the beneficial treaty rate for tax withheld on payments to a foreign party. Treaty benefit needs a valid TRC + Form 10F + No-PE declaration.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Counterparty country</label>
            <select value={country} onChange={e => setCountry(e.target.value)} className={INP}>
              {Object.keys(DTAA).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Nature of income</label>
            <select value={income} onChange={e => setIncome(e.target.value as typeof income)} className={INP}>
              {(["fts", "royalty", "interest", "dividend"] as const).map(k => <option key={k} value={k}>{LABELS[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Payment amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500000" className={INP} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={grossUp} onChange={e => setGrossUp(e.target.checked)} className="accent-[var(--color-primary)]" />
          Gross-up — you bear the tax so the vendor receives the full amount net
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
          {(Object.keys(treaty) as Array<keyof typeof treaty>).map(k => (
            <div key={k} className={`bg-[var(--color-bg)] border rounded-lg px-3 py-2 ${k === income ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
              <p className="text-[10px] text-[var(--color-muted)] capitalize">{k === "fts" ? "FTS" : k}</p>
              <p className="text-sm font-bold tabular-nums">{treaty[k]}%</p>
            </div>
          ))}
        </div>
      </div>

      {amt > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">{LABELS[income]} to {country}</span><span className="tabular-nums">{formatCurrency(Math.round(amt))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Treaty withholding rate</span><span className="tabular-nums font-semibold">{rate}%</span></div>
            {grossUp ? (
              <>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Grossed-up base</span><span className="tabular-nums">{formatCurrency(Math.round(grossed))}</span></div>
                <div className="flex justify-between pt-2 border-t border-[var(--color-border)]"><span className="font-semibold">TDS you deposit</span><span className="font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(grossedTax))}</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">TDS to withhold</span><span className="tabular-nums text-orange-400">{formatCurrency(Math.round(tax))}</span></div>
                <div className="flex justify-between pt-2 border-t border-[var(--color-border)]"><span className="font-semibold">Net remittance to vendor</span><span className="font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(amt - tax))}</span></div>
              </>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">Indicative treaty rates only — actual articles, surcharge/cess, MFN clauses and s.206AA (PAN absence → 20%) can change this. File Form 15CA/15CB before remitting.</p>
        </div>
      )}
    </div>
  );
}

// ── #17 Advance Authorisation / EPCG Tracker ────────────────────────────────────
type EoRow = { id: string; scheme: "AA" | "EPCG"; lic: string; obligation: number; fulfilled: number; ccy: string; expiry: string };
function AdvanceAuthEpcgTracker() {
  const [rows, setRows] = useFeatureState<EoRow[]>("glb-export-oblig", []);
  const [scheme, setScheme] = useState<"AA" | "EPCG">("EPCG");
  const [lic, setLic] = useState("");
  const [obligation, setObligation] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [expiry, setExpiry] = useState(() => new Date().toISOString().split("T")[0]);

  const add = () => {
    const ob = parseFloat(obligation);
    if (!lic.trim() || isNaN(ob) || ob <= 0) { toast.error("Enter a licence number and obligation value"); return; }
    setRows([...rows, { id: crypto.randomUUID(), scheme, lic: lic.trim(), obligation: ob, fulfilled: 0, ccy, expiry }]);
    setLic(""); setObligation("");
    toast.success("Authorisation tracked");
  };
  const addFulfil = (id: string, v: string) => {
    const n = parseFloat(v); if (isNaN(n)) return;
    setRows(rows.map(r => r.id === id ? { ...r, fulfilled: Math.max(0, n) } : r));
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} className="text-[var(--color-primary)]" /> Advance Authorisation / EPCG Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Duty-free import schemes carry a time-bound export obligation. Track fulfilment so you don&apos;t default and trigger duty + interest recovery.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Scheme</label>
            <select value={scheme} onChange={e => setScheme(e.target.value as "AA" | "EPCG")} className={INP}>
              <option value="EPCG">EPCG</option>
              <option value="AA">Advance Auth</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Licence no.</label>
            <input value={lic} onChange={e => setLic(e.target.value)} placeholder="EPCG/2026/01" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">EO value</label>
            <input type="number" value={obligation} onChange={e => setObligation(e.target.value)} placeholder="120000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ccy</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">EO period ends</label>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No authorisations tracked. Add an AA / EPCG licence to monitor its export obligation.</p>
      ) : rows.map(r => {
        const pct = r.obligation > 0 ? Math.min(100, (r.fulfilled / r.obligation) * 100) : 0;
        const days = differenceInCalendarDays(new Date(r.expiry), new Date());
        const met = r.fulfilled >= r.obligation;
        return (
          <div key={r.id} className={`${CARD} p-5`}>
            <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
              <div>
                <p className="text-sm font-semibold">{r.scheme === "AA" ? "Advance Authorisation" : "EPCG"} · {r.lic}</p>
                <p className="text-xs text-[var(--color-muted)]">EO {r.fulfilled.toLocaleString()} / {r.obligation.toLocaleString()} {r.ccy} · period ends {format(new Date(r.expiry), "d MMM yyyy")} ({days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`})</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${met ? "bg-green-900/30 text-green-400 border-green-800/40" : days < 0 ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{met ? "Fulfilled" : days < 0 ? "Defaulted" : `${pct.toFixed(0)}%`}</span>
                <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden mb-3">
              <div className={`h-full rounded-full ${met ? "bg-green-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--color-muted)]">Fulfilled to date ({r.ccy})</label>
              <input type="number" defaultValue={r.fulfilled || ""} onBlur={e => addFulfil(r.id, e.target.value)} placeholder="0" className={`${INP} max-w-[160px]`} />
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--color-muted)]">EPCG export obligation is typically 6× the duty saved over 6 years; AA obligation is set by the input-output norms. File EODC (Export Obligation Discharge Certificate) on DGFT once met. Verify exact terms on your licence.</p>
    </div>
  );
}

// ── #18 Country-wise Sales Summary ───────────────────────────────────────────────
function CountrySalesSummary() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  // Invoices don't carry a country, so the owner maps each customer to a market once.
  const [map, setMap] = useFeatureState<Record<string, string>>("glb-customer-country", {});

  const customers = useMemo(() => Array.from(new Set(invoices.map(i => i.customer).filter(Boolean))), [invoices]);

  const summary = useMemo(() => {
    const agg: Record<string, { count: number; total: number }> = {};
    invoices.forEach(inv => {
      const country = (map[inv.customer] || "").trim() || "Unmapped";
      const amt = typeof inv.amount === "number" ? inv.amount : 0;
      if (!agg[country]) agg[country] = { count: 0, total: 0 };
      agg[country].count += 1;
      agg[country].total += amt;
    });
    return Object.entries(agg).map(([country, v]) => ({ country, ...v })).sort((a, b) => b.total - a.total);
  }, [invoices, map]);

  const grand = summary.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Map size={14} className="text-[var(--color-primary)]" /> Country-wise Sales Summary</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">Your live invoices grouped by export market. Tag each customer with a country once below and the totals roll up automatically.</p>
      </div>

      {customers.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No invoice data yet. Once you raise invoices, tag each customer with a country to see market-wise sales.</p>
      ) : (
        <>
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-3">Tag customers to a country</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {customers.map(c => (
                <div key={c} className="flex items-center gap-2">
                  <span className="text-xs flex-1 truncate">{c}</span>
                  <input value={map[c] ?? ""} onChange={e => setMap({ ...map, [c]: e.target.value })} placeholder="Country" className={`${INP} max-w-[160px]`} />
                </div>
              ))}
            </div>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Country / market", "Invoices", "Revenue", "Share", ""].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {summary.map(r => {
                    const share = grand > 0 ? (r.total / grand) * 100 : 0;
                    return (
                      <tr key={r.country} className="hover:bg-white/2">
                        <td className="px-3 py-2.5 font-medium">{r.country}</td>
                        <td className="px-3 py-2.5 tabular-nums">{r.count}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatCurrency(Math.round(r.total))}</td>
                        <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{share.toFixed(1)}%</td>
                        <td className="px-3 py-2.5 w-32">
                          <div className="w-full h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${share}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-[var(--color-border)] font-semibold">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 tabular-nums">{summary.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(grand))}</td>
                    <td className="px-3 py-2.5" colSpan={2}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Untagged customers roll up under &quot;Unmapped&quot;. Amounts are the invoice value recorded in your books.</p>
    </div>
  );
}

// ── #19 IEC / AD-Code Tracker ────────────────────────────────────────────────────
type RegRow = { id: string; type: "IEC" | "AD Code" | "Port reg." | "RCMC" | "LUT"; code: string; issuer: string; renewal: string };
function IecAdCodeTracker() {
  const [rows, setRows] = useFeatureState<RegRow[]>("glb-iec-adcode", []);
  const [type, setType] = useState<RegRow["type"]>("IEC");
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [renewal, setRenewal] = useState("");

  const add = () => {
    if (!code.trim()) { toast.error("Enter the registration number / code"); return; }
    setRows([...rows, { id: crypto.randomUUID(), type, code: code.trim(), issuer: issuer.trim(), renewal }]);
    setCode(""); setIssuer(""); setRenewal("");
    toast.success("Registration saved");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><BadgeCheck size={14} className="text-[var(--color-primary)]" /> IEC / AD-Code Register</h2>
        <p className="text-xs text-[var(--color-muted)]">One home for the registrations every exporter needs: IEC, AD code (per bank), port registrations, RCMC and the annual LUT — with renewal reminders.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as RegRow["type"])} className={INP}>
              {(["IEC", "AD Code", "Port reg.", "RCMC", "LUT"] as const).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Number / code</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="IEC / AD code" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Issuer / bank / port</label>
            <input value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="DGFT / HDFC / INNSA1" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Renewal / valid till</label>
            <input type="date" value={renewal} onChange={e => setRenewal(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No registrations saved. Add your IEC and AD codes so they&apos;re handy at filing time.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Type", "Number / code", "Issuer", "Renewal", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const days = r.renewal ? differenceInCalendarDays(new Date(r.renewal), new Date()) : null;
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] font-medium">{r.type}</span></td>
                      <td className="px-3 py-2.5 font-medium tabular-nums">{r.code}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.issuer || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{r.renewal ? format(new Date(r.renewal), "d MMM yyyy") : "—"}</td>
                      <td className="px-3 py-2.5">
                        {days === null ? <span className="text-[var(--color-muted)] text-xs">No date</span>
                          : days < 0 ? <span className="text-red-400 text-xs font-semibold">Expired</span>
                          : days < 30 ? <span className="text-yellow-400 text-xs font-semibold">{days}d to renew</span>
                          : <span className="text-green-400 text-xs">{days}d valid</span>}
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
      <p className="text-[10px] text-[var(--color-muted)]">IEC must be updated/confirmed on DGFT every financial year even if unchanged, or it is de-activated. AD code is registered per bank at each port of export before the first shipping bill.</p>
    </div>
  );
}

// ── #20 LRS / TCS on Foreign Remittance Calculator ──────────────────────────────
function LrsTcsCalculator() {
  const [purpose, setPurpose] = useState<"general" | "education_loan" | "education_other" | "medical">("general");
  const [amount, setAmount] = useState("");
  const [already, setAlready] = useState("");

  const amt = parseFloat(amount) || 0;
  const prior = parseFloat(already) || 0;
  const THRESHOLD = 1000000; // ₹10 lakh per financial year (FY24-25 onwards) for most purposes.
  // Education funded by loan: 0.5% above threshold. Medical & education (other): 5% above threshold. General/other: 20% above threshold.
  const ratePct = purpose === "education_loan" ? 0.5 : purpose === "education_other" || purpose === "medical" ? 5 : 20;
  const cumulativeBefore = prior;
  const cumulativeAfter = prior + amt;
  // TCS applies only on the portion of this remittance that exceeds the ₹10L cumulative threshold.
  const taxablePortion = Math.max(0, cumulativeAfter - Math.max(THRESHOLD, cumulativeBefore));
  const tcs = taxablePortion * ratePct / 100;

  const LABELS = {
    general: "Other purposes (travel, investment, gifts)",
    education_loan: "Education — funded by a loan",
    education_other: "Education — self-funded",
    medical: "Medical treatment",
  } as const;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> LRS / TCS on Outward Remittance</h2>
        <p className="text-xs text-[var(--color-muted)]">Tax Collected at Source applies on outward remittances under the Liberalised Remittance Scheme beyond ₹10 lakh in a financial year. TCS is creditable against your income tax.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Purpose</label>
            <select value={purpose} onChange={e => setPurpose(e.target.value as typeof purpose)} className={INP}>
              {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map(k => <option key={k} value={k}>{LABELS[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">This remittance (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1500000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Already remitted this FY (₹)</label>
            <input type="number" value={already} onChange={e => setAlready(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
      </div>

      {amt > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Cumulative LRS this FY</span><span className="tabular-nums">{formatCurrency(Math.round(cumulativeAfter))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Threshold (per FY)</span><span className="tabular-nums">{formatCurrency(THRESHOLD)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Amount above threshold (taxable)</span><span className="tabular-nums">{formatCurrency(Math.round(taxablePortion))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">TCS rate</span><span className="tabular-nums font-semibold">{ratePct}%</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">TCS collected</span>
              <span className="font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(tcs))}</span>
            </div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Total debited from you</span><span className="tabular-nums">{formatCurrency(Math.round(amt + tcs))}</span></div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">TCS is not an extra tax — claim it as credit against your income-tax liability (or refund) when filing your return. Education-loan remittances enjoy the concessional 0.5% rate above the threshold.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rates and the ₹10L threshold reflect the post-Oct-2023 LRS framework; overseas tour packages follow separate slabs. Confirm the current Finance-Act rates with your CA before remitting.</p>
    </div>
  );
}

// ── #22 SOFTEX Filing Tracker (software / service exports) ──────────────────────
type SoftexRow = { id: string; invoice: string; client: string; ccy: string; amount: number; invoiceDate: string; filed: boolean };
function SoftexTracker() {
  const [rows, setRows] = useFeatureState<SoftexRow[]>("glb-softex", []);
  const [invoice, setInvoice] = useState("");
  const [client, setClient] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const today = new Date();

  const add = () => {
    const amt = parseFloat(amount);
    if (!invoice.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter an invoice ref and a valid amount"); return; }
    setRows([...rows, { id: crypto.randomUUID(), invoice: invoice.trim(), client: client.trim(), ccy, amount: amt, invoiceDate, filed: false }]);
    setInvoice(""); setClient(""); setAmount("");
    toast.success("Software export logged");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, filed: !r.filed } : r));
  // SOFTEX is to be filed within 30 days of the invoice / last day of the month of the invoice.
  const dueBy = (d: string) => { const x = new Date(d); x.setDate(x.getDate() + 30); return x; };
  const pending = rows.filter(r => !r.filed).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileCode2 size={14} className="text-[var(--color-primary)]" /> SOFTEX Filing Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Software and IT/ITeS exporters must file a SOFTEX form for each export invoice (via STPI / RBI EDPMS), generally within 30 days of invoicing.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Invoice ref</label>
            <input value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="EXP-001" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Client</label>
            <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ccy</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No software exports logged. Add invoices to track their SOFTEX filing deadlines.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Invoice", "Client", "Amount", "File by", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const due = dueBy(r.invoiceDate);
                  const days = differenceInCalendarDays(due, today);
                  const overdue = !r.filed && days < 0;
                  return (
                    <tr key={r.id} className={`hover:bg-white/2 ${overdue ? "bg-red-950/20" : ""}`}>
                      <td className="px-3 py-2.5 font-medium">{r.invoice}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.client || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.amount.toLocaleString()} {r.ccy}</td>
                      <td className="px-3 py-2.5 tabular-nums">{format(due, "d MMM yyyy")}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id)} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.filed ? "bg-green-900/30 text-green-400 border-green-800/40" : overdue ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                          {r.filed ? "Filed" : overdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                        </button>
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
      <p className="text-[10px] text-[var(--color-muted)]">{pending} filing(s) pending. SOFTEX certifies the value of software/service exports for FEMA realisation and is needed to close EDPMS entries. Verify the current STPI / RBI timeline with your CA.</p>
    </div>
  );
}

// ── #23 LUT Renewal Tracker ─────────────────────────────────────────────────────
function LutRenewalTracker() {
  const [lutNo, setLutNo] = useFeatureState<string>("glb-lut-no", "");
  const [filedFor, setFiledFor] = useFeatureState<string>("glb-lut-fy", "");
  const today = new Date();

  // Indian FY runs 1 Apr – 31 Mar. LUT (RFD-11) is filed per FY and expires 31 Mar of that FY.
  const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const currentFy = `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
  const fyEnd = new Date(fyStartYear + 1, 2, 31);
  const daysToExpiry = differenceInCalendarDays(fyEnd, today);
  const covered = filedFor === currentFy;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarCheck size={14} className="text-[var(--color-primary)]" /> LUT Renewal Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">A Letter of Undertaking (Form GST RFD-11) lets you export without paying IGST. It must be filed afresh for each financial year — a lapsed LUT can trigger an IGST demand on your exports.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">LUT / ARN reference</label>
            <input value={lutNo} onChange={e => setLutNo(e.target.value)} placeholder="AD0712..." className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Filed for FY</label>
            <input value={filedFor} onChange={e => setFiledFor(e.target.value)} placeholder={currentFy} className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Current financial year</span><span className="tabular-nums font-semibold">FY {currentFy}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">LUT on record</span><span className="tabular-nums">{lutNo || "—"}{filedFor ? ` (FY ${filedFor})` : ""}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Validity ends</span><span className="tabular-nums">{format(fyEnd, "d MMM yyyy")} ({daysToExpiry < 0 ? `${Math.abs(daysToExpiry)}d ago` : `${daysToExpiry}d left`})</span></div>
        </div>
        <div className={`mt-3 rounded-lg px-3 py-2.5 text-xs flex items-start gap-2 border ${covered ? "border-green-800/40 bg-green-950/20 text-green-400" : "border-yellow-800/40 bg-yellow-950/20 text-yellow-400"}`}>
          {covered ? <CheckCircle2 size={13} className="shrink-0 mt-px" /> : <AlertTriangle size={13} className="shrink-0 mt-px" />}
          {covered
            ? `LUT is current for FY ${currentFy}. File the next one at the start of FY ${fyStartYear + 1}-${String((fyStartYear + 2) % 100).padStart(2, "0")}.`
            : `No LUT recorded for FY ${currentFy}. File Form GST RFD-11 on the GST portal before your next export to keep it zero-rated without IGST.`}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">File RFD-11 online (no physical submission). Eligibility excludes those prosecuted for tax evasion above ₹2.5 crore. Confirm with your CA.</p>
    </div>
  );
}

// ── #24 FEMA Compliance Calendar ────────────────────────────────────────────────
type FemaTaskRow = { id: string; form: string; about: string; dueDate: string; done: boolean };
const FEMA_TEMPLATES = [
  { form: "FLA Return", about: "Foreign Liabilities & Assets — annual, by 15 Jul" },
  { form: "APR (ODI)", about: "Annual Performance Report for overseas JV/WOS, by 31 Dec" },
  { form: "FC-GPR", about: "Allotment of shares to a non-resident, within 30 days" },
  { form: "FC-TRS", about: "Transfer of shares resident↔non-resident, within 60 days" },
  { form: "Form ODI", about: "Overseas direct investment reporting" },
  { form: "ECB-2 Return", about: "Monthly external commercial borrowing return, by 7th" },
];
function FemaComplianceCalendar() {
  const [rows, setRows] = useFeatureState<FemaTaskRow[]>("glb-fema-cal", []);
  const [form, setForm] = useState(FEMA_TEMPLATES[0].form);
  const [about, setAbout] = useState(FEMA_TEMPLATES[0].about);
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const today = new Date();

  const pickTemplate = (f: string) => {
    setForm(f);
    const t = FEMA_TEMPLATES.find(x => x.form === f);
    if (t) setAbout(t.about);
  };
  const add = () => {
    if (!form.trim()) { toast.error("Pick or name a form"); return; }
    setRows([...rows, { id: crypto.randomUUID(), form: form.trim(), about: about.trim(), dueDate, done: false }]);
    toast.success("Deadline added");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, done: !r.done } : r));
  const sorted = useMemo(() => [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [rows]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> FEMA Compliance Calendar</h2>
        <p className="text-xs text-[var(--color-muted)]">Track recurring RBI / FEMA filing deadlines — FLA, APR, FC-GPR, FC-TRS, ODI and ECB returns — so none slip past their due date.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Form</label>
            <select value={form} onChange={e => pickTemplate(e.target.value)} className={INP}>
              {FEMA_TEMPLATES.map(t => <option key={t.form} value={t.form}>{t.form}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Note</label>
            <input value={about} onChange={e => setAbout(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Due</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No deadlines added. Pick a form above to start your FEMA calendar.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(r => {
            const days = differenceInCalendarDays(new Date(r.dueDate), today);
            const overdue = !r.done && days < 0;
            return (
              <div key={r.id} className={`${CARD} p-4 flex items-center justify-between gap-3 ${overdue ? "border-red-800/40" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <input type="checkbox" checked={r.done} onChange={() => toggle(r.id)} className="accent-[var(--color-primary)] shrink-0" />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${r.done ? "line-through text-[var(--color-muted)]" : ""}`}>{r.form}</p>
                    <p className="text-[11px] text-[var(--color-muted)] truncate">{r.about}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs tabular-nums">{format(new Date(r.dueDate), "d MMM yyyy")}</p>
                    <p className={`text-[10px] tabular-nums font-semibold ${r.done ? "text-green-400" : overdue ? "text-red-400" : days < 15 ? "text-yellow-400" : "text-[var(--color-muted)]"}`}>
                      {r.done ? "Done" : overdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                    </p>
                  </div>
                  <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Templated due-dates are typical statutory deadlines — adjust per your facts. Late FEMA filing can attract compounding penalties; confirm dates with your CA.</p>
    </div>
  );
}

// ── #25 ODI / FDI Reporting Tracker ─────────────────────────────────────────────
type FlowRow = { id: string; kind: "odi" | "fdi"; entity: string; ccy: string; amount: number; eventDate: string; reported: boolean };
function OdiFdiTracker() {
  const [rows, setRows] = useFeatureState<FlowRow[]>("glb-odi-fdi", []);
  const [kind, setKind] = useState<"odi" | "fdi">("odi");
  const [entity, setEntity] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().split("T")[0]);
  const today = new Date();

  const add = () => {
    const amt = parseFloat(amount);
    if (!entity.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter an entity and a valid amount"); return; }
    setRows([...rows, { id: crypto.randomUUID(), kind, entity: entity.trim(), ccy, amount: amt, eventDate, reported: false }]);
    setEntity(""); setAmount("");
    toast.success("Investment flow logged");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, reported: !r.reported } : r));
  // FDI (FC-GPR) reporting within 30 days of allotment; ODI reporting at the time of remittance/Form ODI.
  const dueBy = (k: "odi" | "fdi", d: string) => { const x = new Date(d); x.setDate(x.getDate() + (k === "fdi" ? 30 : 30)); return x; };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> ODI / FDI Reporting Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Log outbound investments (ODI — into overseas JV/WOS) and inbound foreign investment (FDI — FC-GPR on share allotment), and track the RBI reporting deadline for each.</p>
        <div className="flex gap-2 mb-1">
          {([["odi", "ODI (money out)"], ["fdi", "FDI (money in)"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setKind(id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${kind === id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div className="col-span-2">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Entity / investee</label>
            <input value={entity} onChange={e => setEntity(e.target.value)} placeholder="Overseas Co." className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ccy</label>
            <select value={ccy} onChange={e => setCcy(e.target.value)} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" className={INP} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-[var(--color-muted)] mb-1">Event date</label>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={INP} />
            </div>
          </div>
          <button onClick={add} className="md:col-span-5 flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add flow</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No flows logged. Add an ODI or FDI event to track its reporting deadline.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Type", "Entity", "Amount", "Report by", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const due = dueBy(r.kind, r.eventDate);
                  const days = differenceInCalendarDays(due, today);
                  const overdue = !r.reported && days < 0;
                  return (
                    <tr key={r.id} className={`hover:bg-white/2 ${overdue ? "bg-red-950/20" : ""}`}>
                      <td className="px-3 py-2.5 font-medium uppercase text-xs">{r.kind}</td>
                      <td className="px-3 py-2.5">{r.entity}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.amount.toLocaleString()} {r.ccy}</td>
                      <td className="px-3 py-2.5 tabular-nums">{format(due, "d MMM yyyy")}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id)} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.reported ? "bg-green-900/30 text-green-400 border-green-800/40" : overdue ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                          {r.reported ? "Reported" : overdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                        </button>
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
      <p className="text-[10px] text-[var(--color-muted)]">FDI share allotment is reported on Form FC-GPR within 30 days; ODI is reported via Form ODI at remittance, with an annual APR thereafter. Timelines are indicative — confirm with your AD bank / CA.</p>
    </div>
  );
}

// ── #26 Country Risk Scorecard ──────────────────────────────────────────────────
type RiskRow = { id: string; country: string; payment: number; political: number; fx: number; legal: number };
function CountryRiskScorecard() {
  const [rows, setRows] = useFeatureState<RiskRow[]>("glb-country-risk", []);
  const [country, setCountry] = useState("");

  const add = () => {
    if (!country.trim()) { toast.error("Enter a country"); return; }
    setRows([...rows, { id: crypto.randomUUID(), country: country.trim(), payment: 3, political: 3, fx: 3, legal: 3 }]);
    setCountry("");
  };
  const setScore = (id: string, k: "payment" | "political" | "fx" | "legal", v: number) =>
    setRows(rows.map(r => r.id === id ? { ...r, [k]: v } : r));

  // Lower score = lower risk. Weighted composite out of 10.
  const composite = (r: RiskRow) => +(r.payment * 0.4 + r.political * 0.2 + r.fx * 0.25 + r.legal * 0.15).toFixed(1);
  const band = (c: number) => c <= 2 ? { label: "Low", cls: "text-green-400" } : c <= 3.5 ? { label: "Medium", cls: "text-yellow-400" } : { label: "High", cls: "text-red-400" };
  const FACTORS: { k: "payment" | "political" | "fx" | "legal"; label: string }[] = [
    { k: "payment", label: "Buyer payment risk" }, { k: "political", label: "Political / sanctions" },
    { k: "fx", label: "FX / convertibility" }, { k: "legal", label: "Legal enforceability" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Country Risk Scorecard</h2>
        <p className="text-xs text-[var(--color-muted)]">Score each export destination 1 (best) to 5 (worst) across four factors to get a weighted risk band before extending open-account terms. Payment risk is weighted heaviest.</p>
        <div className="flex gap-2 items-end max-w-md">
          <div className="flex-1">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Country</label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Nigeria" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No countries scored yet. Add a destination to assess its risk band.</p>
      ) : rows.map(r => {
        const c = composite(r);
        const b = band(c);
        return (
          <div key={r.id} className={`${CARD} p-5`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold">{r.country}</p>
                <p className="text-xs">Composite risk <span className={`font-bold tabular-nums ${b.cls}`}>{c} / 5 · {b.label}</span></p>
              </div>
              <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FACTORS.map(f => (
                <div key={f.k} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--color-muted)]">{f.label}</span>
                    <span className="text-xs font-semibold tabular-nums">{r[f.k]}</span>
                  </div>
                  <input type="range" min={1} max={5} step={1} value={r[f.k]} onChange={e => setScore(r.id, f.k, parseInt(e.target.value))} className="w-full accent-[var(--color-primary)]" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--color-muted)]">A subjective scorecard for your own due diligence — not a credit rating. For high-risk destinations consider ECGC cover, an LC, or advance payment.</p>
    </div>
  );
}

// ── #27 GIFT-City Unit Benefit Estimator ────────────────────────────────────────
function GiftCityEstimator() {
  const [profit, setProfit] = useState("");
  const [taxRate, setTaxRate] = useState("25");
  const [holidayYears, setHolidayYears] = useState("10");
  const [outOf, setOutOf] = useState("15");

  const p = parseFloat(profit) || 0;
  const rate = parseFloat(taxRate) || 0;
  const hy = Math.max(0, Math.min(parseFloat(holidayYears) || 0, parseFloat(outOf) || 0));
  const window = parseFloat(outOf) || 0;
  // IFSC units get 100% profit deduction for 10 consecutive years out of a 15-year block (Sec 80LA).
  const annualTaxOnMainland = p * rate / 100;
  const totalSaved = annualTaxOnMainland * hy;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Building size={14} className="text-[var(--color-primary)]" /> GIFT-City Unit Benefit Estimator</h2>
        <p className="text-xs text-[var(--color-muted)]">An IFSC unit in GIFT City can claim a 100% deduction on business profits for 10 consecutive years out of a 15-year block (Sec 80LA). Estimate the headline income-tax saved versus operating on the mainland.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Annual profit (₹)</label>
            <input type="number" value={profit} onChange={e => setProfit(e.target.value)} placeholder="10000000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Mainland tax %</label>
            <input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="25" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Holiday years</label>
            <input type="number" value={holidayYears} onChange={e => setHolidayYears(e.target.value)} placeholder="10" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Out of block</label>
            <input type="number" value={outOf} onChange={e => setOutOf(e.target.value)} placeholder="15" className={INP} />
          </div>
        </div>
      </div>

      {p > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Tax if on mainland (per year)</span><span className="tabular-nums text-orange-400">{formatCurrency(Math.round(annualTaxOnMainland))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Tax in IFSC during holiday (per year)</span><span className="tabular-nums text-green-400">₹0</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Holiday claimed</span><span className="tabular-nums">{hy} of {window} year block</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">Headline income-tax saved over holiday</span>
              <span className="font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(totalSaved))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">Indicative only. IFSC units also enjoy GST and stamp-duty concessions, but MAT/AMT, surcharge, cess and conditions apply. GIFT City suits IT/ITeS, fund management, fintech and aircraft/ship leasing. Confirm eligibility with your CA.</p>
        </div>
      )}
    </div>
  );
}

// ── #28 Freight / Incoterms Cost Splitter ───────────────────────────────────────
const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;
type Incoterm = typeof INCOTERMS[number];
// Which cost legs the SELLER bears under each Incoterm (true = seller pays).
const SELLER_BEARS: Record<Incoterm, { origin: boolean; mainFreight: boolean; insurance: boolean; destination: boolean; importDuty: boolean }> = {
  EXW: { origin: false, mainFreight: false, insurance: false, destination: false, importDuty: false },
  FCA: { origin: true, mainFreight: false, insurance: false, destination: false, importDuty: false },
  FOB: { origin: true, mainFreight: false, insurance: false, destination: false, importDuty: false },
  CFR: { origin: true, mainFreight: true, insurance: false, destination: false, importDuty: false },
  CIF: { origin: true, mainFreight: true, insurance: true, destination: false, importDuty: false },
  CPT: { origin: true, mainFreight: true, insurance: false, destination: false, importDuty: false },
  CIP: { origin: true, mainFreight: true, insurance: true, destination: false, importDuty: false },
  DAP: { origin: true, mainFreight: true, insurance: true, destination: true, importDuty: false },
  DPU: { origin: true, mainFreight: true, insurance: true, destination: true, importDuty: false },
  DDP: { origin: true, mainFreight: true, insurance: true, destination: true, importDuty: true },
};
function IncotermsSplitter() {
  const [term, setTerm] = useState<Incoterm>("FOB");
  const [origin, setOrigin] = useState("");
  const [mainFreight, setMainFreight] = useState("");
  const [insurance, setInsurance] = useState("");
  const [destination, setDestination] = useState("");
  const [importDuty, setImportDuty] = useState("");

  const legs = [
    { k: "origin" as const, label: "Origin charges (haulage, export clearance, THC)", val: parseFloat(origin) || 0, set: setOrigin, raw: origin },
    { k: "mainFreight" as const, label: "Main carriage / ocean-air freight", val: parseFloat(mainFreight) || 0, set: setMainFreight, raw: mainFreight },
    { k: "insurance" as const, label: "Cargo insurance", val: parseFloat(insurance) || 0, set: setInsurance, raw: insurance },
    { k: "destination" as const, label: "Destination charges (THC, delivery, import clearance)", val: parseFloat(destination) || 0, set: setDestination, raw: destination },
    { k: "importDuty" as const, label: "Import duty / taxes at destination", val: parseFloat(importDuty) || 0, set: setImportDuty, raw: importDuty },
  ];
  const bears = SELLER_BEARS[term];
  const sellerCost = legs.reduce((s, l) => s + (bears[l.k] ? l.val : 0), 0);
  const buyerCost = legs.reduce((s, l) => s + (bears[l.k] ? 0 : l.val), 0);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Freight / Incoterms Cost Splitter</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter each shipping cost leg (₹), pick the Incoterm, and see who bears what. Higher terms (CIF, DDP) push more cost onto the seller — price them into your quote.</p>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Incoterm 2020</label>
          <select value={term} onChange={e => setTerm(e.target.value as Incoterm)} className={INP}>
            {INCOTERMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          {legs.map(l => (
            <div key={l.k} className="flex items-center gap-3">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 w-14 text-center ${bears[l.k] ? "bg-orange-900/30 text-orange-400 border-orange-800/40" : "bg-blue-900/30 text-blue-400 border-blue-800/40"}`}>{bears[l.k] ? "Seller" : "Buyer"}</span>
              <label className="text-xs flex-1 text-[var(--color-muted)]">{l.label}</label>
              <input type="number" value={l.raw} onChange={e => l.set(e.target.value)} placeholder="0" className={`${INP} w-32`} />
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[var(--color-muted)] mb-1">Seller bears ({term})</p>
            <p className="text-2xl font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(sellerCost))}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)] mb-1">Buyer bears</p>
            <p className="text-2xl font-bold tabular-nums text-blue-400">{formatCurrency(Math.round(buyerCost))}</p>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mt-3">Risk transfers to the buyer at the named point for each term (e.g. on board the vessel under FOB/CFR/CIF). Cost allocation here follows Incoterms 2020 norms — your contract terms prevail. Insurance is mandatory only under CIF and CIP.</p>
      </div>
    </div>
  );
}

// ── Multi-Currency P&L (INR-normalised) ─────────────────────────────────────────
type McLine = { id: string; label: string; kind: "revenue" | "cost"; ccy: string; amount: string };
function MultiCurrencyPnl() {
  const [lines, setLines] = useFeatureState<McLine[]>("glb-mc-pnl", [
    { id: "r1", label: "US client retainer", kind: "revenue", ccy: "USD", amount: "" },
    { id: "c1", label: "EU cloud hosting", kind: "cost", ccy: "EUR", amount: "" },
  ]);
  const [rates] = useFeatureState<Record<string, number>>("glb-fx-rates", DEFAULT_RATES);

  const rate = (code: string) => (code === "INR" ? 1 : rates[code] ?? DEFAULT_RATES[code] ?? 0);
  const ALL = ["INR", ...CURRENCIES];

  const evaluated = lines.map(l => {
    const amt = parseFloat(l.amount) || 0;
    return { ...l, inr: amt * rate(l.ccy) };
  });
  const revenue = evaluated.filter(l => l.kind === "revenue").reduce((s, l) => s + l.inr, 0);
  const cost = evaluated.filter(l => l.kind === "cost").reduce((s, l) => s + l.inr, 0);
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const setLine = (id: string, k: "label" | "kind" | "ccy" | "amount", v: string) =>
    setLines(lines.map(l => l.id === id ? { ...l, [k]: v } : l));
  const addLine = () => setLines([...lines, { id: crypto.randomUUID(), label: "", kind: "revenue", ccy: "USD", amount: "" }]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Multi-Currency P&amp;L</h2>
        <p className="text-xs text-[var(--color-muted)]">Mix revenue and costs across currencies and see a single INR-normalised profit. Uses your reference rates from the converter.</p>
        <div className="space-y-2">
          {lines.map(l => (
            <div key={l.id} className="grid grid-cols-12 gap-2 items-center">
              <input value={l.label} onChange={e => setLine(l.id, "label", e.target.value)} placeholder="Line item" className={`${INP} col-span-4`} />
              <select value={l.kind} onChange={e => setLine(l.id, "kind", e.target.value)} className={`${INP} col-span-3`}>
                <option value="revenue">Revenue</option>
                <option value="cost">Cost</option>
              </select>
              <select value={l.ccy} onChange={e => setLine(l.id, "ccy", e.target.value)} className={`${INP} col-span-2`}>
                {ALL.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" value={l.amount} onChange={e => setLine(l.id, "amount", e.target.value)} placeholder="Amount" className={`${INP} col-span-2`} />
              <button onClick={() => setLines(lines.filter(x => x.id !== l.id))} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 flex justify-center"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addLine} className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1 mt-1"><Plus size={12} /> Add line</button>
        </div>
      </div>

      {revenue + cost > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Total revenue (INR)</span><span className="tabular-nums text-green-400">{formatCurrency(Math.round(revenue))}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Total cost (INR)</span><span className="tabular-nums text-orange-400">{formatCurrency(Math.round(cost))}</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">Net profit</span>
              <span className={`font-bold tabular-nums ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(profit))} <span className="text-[var(--color-muted)] font-normal">({margin.toFixed(1)}%)</span></span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">INR figures are translated at your manual reference rates — actual booked values depend on the rate on each transaction date (AS 11 / Ind-AS 21).</p>
        </div>
      )}
    </div>
  );
}

// ── Foreign Withholding Tax / FTC Recovery Tracker ───────────────────────────────
type WhtRow = { id: string; payer: string; country: string; ccy: string; gross: number; whtPct: number; fxRate: number; claimed: boolean };
function WhtRecoveryTracker() {
  const [rows, setRows] = useFeatureState<WhtRow[]>("glb-wht-recovery", []);
  const [payer, setPayer] = useState("");
  const [country, setCountry] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [gross, setGross] = useState("");
  const [whtPct, setWhtPct] = useState("10");
  const [fxRate, setFxRate] = useState(String(DEFAULT_RATES.USD));

  const add = () => {
    const g = parseFloat(gross), w = parseFloat(whtPct), fx = parseFloat(fxRate);
    if (!payer.trim() || isNaN(g) || g <= 0 || isNaN(fx) || fx <= 0) { toast.error("Enter a payer, gross amount and FX rate"); return; }
    setRows([...rows, { id: crypto.randomUUID(), payer: payer.trim(), country: country.trim(), ccy, gross: g, whtPct: isNaN(w) ? 0 : w, fxRate: fx, claimed: false }]);
    setPayer(""); setCountry(""); setGross("");
    toast.success("Withholding entry added");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, claimed: !r.claimed } : r));

  const totals = rows.reduce((a, r) => {
    const whtInr = r.gross * (r.whtPct / 100) * r.fxRate;
    a.wht += whtInr;
    if (!r.claimed) a.unclaimed += whtInr;
    return a;
  }, { wht: 0, unclaimed: 0 });

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><HandCoins size={14} className="text-[var(--color-primary)]" /> Foreign Withholding Tax Recovery</h2>
        <p className="text-xs text-[var(--color-muted)]">When an overseas client deducts tax at source, you can usually claim it as a Foreign Tax Credit (Form 67) against Indian tax. Track what is still to be claimed.</p>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Payer</label>
            <input value={payer} onChange={e => setPayer(e.target.value)} placeholder="Client" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Country</label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="USA" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Ccy</label>
            <select value={ccy} onChange={e => { setCcy(e.target.value); setFxRate(String(DEFAULT_RATES[e.target.value] ?? fxRate)); }} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Gross ({ccy})</label>
            <input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">WHT %</label>
            <input type="number" value={whtPct} onChange={e => setWhtPct(e.target.value)} placeholder="10" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">FX rate (₹)</label>
            <input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">Total tax withheld abroad</p><p className="text-xl font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(totals.wht))}</p></div>
          <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">FTC yet to be claimed</p><p className="text-xl font-bold tabular-nums text-yellow-400">{formatCurrency(Math.round(totals.unclaimed))}</p></div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No withholding entries yet. Add a foreign receipt where tax was deducted at source.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Payer", "Country", "Gross", "WHT", "Credit (₹)", "FTC", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const whtInr = r.gross * (r.whtPct / 100) * r.fxRate;
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 font-medium">{r.payer}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.country || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.gross.toLocaleString()} {r.ccy}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.whtPct}%</td>
                      <td className="px-3 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(whtInr))}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id)} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.claimed ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.claimed ? "Claimed" : "Pending"}</button>
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
      <p className="text-[10px] text-[var(--color-muted)]">Foreign Tax Credit is claimed via Form 67 before filing your return, subject to the relevant DTAA. Keep the foreign withholding certificate / Form 1042-S equivalent as proof.</p>
    </div>
  );
}

// ── Export Realisation Aging (EDPMS buckets) ─────────────────────────────────────
type ShipRow = { id: string; ref: string; ccy: string; amount: number; exportDate: string; realised: boolean };
function ExportRealisationAging() {
  const [rows, setRows] = useFeatureState<ShipRow[]>("glb-edpms-aging", []);
  const [ref, setRef] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [amount, setAmount] = useState("");
  const [exportDate, setExportDate] = useState(() => new Date().toISOString().split("T")[0]);
  const today = new Date();

  const add = () => {
    const amt = parseFloat(amount);
    if (!ref.trim() || isNaN(amt) || amt <= 0) { toast.error("Enter a shipping-bill ref and amount"); return; }
    setRows([...rows, { id: crypto.randomUUID(), ref: ref.trim(), ccy, amount: amt, exportDate, realised: false }]);
    setRef(""); setAmount("");
    toast.success("Shipment added");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, realised: !r.realised } : r));

  const open = rows.filter(r => !r.realised);
  const buckets = [
    { label: "0–90 days", test: (d: number) => d <= 90 },
    { label: "91–180 days", test: (d: number) => d > 90 && d <= 180 },
    { label: "181–270 days", test: (d: number) => d > 180 && d <= 270 },
    { label: "Over 270 days (FEMA breach)", test: (d: number) => d > 270 },
  ].map(b => ({
    ...b,
    count: open.filter(r => b.test(differenceInCalendarDays(today, new Date(r.exportDate)))).length,
  }));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Hourglass size={14} className="text-[var(--color-primary)]" /> Export Realisation Aging</h2>
        <p className="text-xs text-[var(--color-muted)]">Age your unrealised shipping bills into buckets against the 9-month (270-day) FEMA window — the same way EDPMS flags overdue exports.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Shipping bill ref</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="SB-001" className={INP} />
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
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {buckets.map(b => (
            <div key={b.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{b.label}</p>
              <p className={`text-xl font-bold tabular-nums ${b.label.includes("breach") && b.count > 0 ? "text-red-400" : "text-[var(--color-text)]"}`}>{b.count}</p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No shipments tracked. Add a shipping bill to monitor its realisation age.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Ref", "Amount", "Export date", "Age", "Status", ""].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const age = differenceInCalendarDays(today, new Date(r.exportDate));
                  const breach = !r.realised && age > 270;
                  return (
                    <tr key={r.id} className={`hover:bg-white/2 ${breach ? "bg-red-950/20" : ""}`}>
                      <td className="px-3 py-2.5 font-medium">{r.ref}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.amount.toLocaleString()} {r.ccy}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{format(new Date(r.exportDate), "d MMM yyyy")}</td>
                      <td className={`px-3 py-2.5 tabular-nums font-semibold ${r.realised ? "text-green-400" : breach ? "text-red-400" : age > 180 ? "text-yellow-400" : "text-[var(--color-text)]"}`}>{r.realised ? "—" : `${age}d`}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id)} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${r.realised ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.realised ? "Realised" : "Open"}</button>
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
      <p className="text-[10px] text-[var(--color-muted)]">Exports unrealised beyond 270 days appear as overdue in EDPMS and may need AD-bank extension or RBI write-off approval. Mark realised once full proceeds are received.</p>
    </div>
  );
}

// ── Foreign Bank Charge Reconciliation ──────────────────────────────────────────
function ForeignBankChargeRecon() {
  const [ccy, setCcy] = useState("USD");
  const [invoiced, setInvoiced] = useState("");
  const [received, setReceived] = useState("");
  const [fxRate, setFxRate] = useState(String(DEFAULT_RATES.USD));

  const inv = parseFloat(invoiced) || 0;
  const rec = parseFloat(received) || 0;
  const rate = parseFloat(fxRate) || 0;
  const valid = inv > 0 && rec > 0 && rate > 0;

  const shortfall = inv - rec;
  const pct = inv > 0 ? (shortfall / inv) * 100 : 0;
  const shortfallInr = shortfall * rate;
  const flagged = pct > 3;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> Foreign Bank Charge Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)]">Intermediary and correspondent banks deduct charges en route. Compare what you invoiced against what actually landed to see the bite.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currency</label>
            <select value={ccy} onChange={e => { setCcy(e.target.value); setFxRate(String(DEFAULT_RATES[e.target.value] ?? rate)); }} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Invoiced ({ccy})</label>
            <input type="number" value={invoiced} onChange={e => setInvoiced(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Received ({ccy})</label>
            <input type="number" value={received} onChange={e => setReceived(e.target.value)} placeholder="9955" className={INP} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">FX rate (₹)</label>
            <input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      {valid && (
        <div className={`${CARD} p-5`}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Charges deducted</span><span className="tabular-nums">{shortfall.toLocaleString("en-US", { maximumFractionDigits: 2 })} {ccy} ({pct.toFixed(2)}%)</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
              <span className="font-semibold">INR value of charges</span>
              <span className={`font-bold tabular-nums ${flagged ? "text-red-400" : "text-orange-400"}`}>{formatCurrency(Math.round(shortfallInr))}</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3 flex items-start gap-1.5">
            {flagged ? <AlertTriangle size={12} className="shrink-0 mt-px text-red-400" /> : <CheckCircle2 size={12} className="shrink-0 mt-px text-green-400" />}
            {flagged
              ? `${pct.toFixed(2)}% deducted is high — ask your buyer to remit under "OUR" charges (sender bears all fees) and check for intermediary-bank deductions.`
              : `${pct.toFixed(2)}% deducted is within a normal correspondent-bank range. For FIRC/realisation, the gross invoice value still applies.`}
          </p>
        </div>
      )}
    </div>
  );
}
