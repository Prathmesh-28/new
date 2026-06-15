import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  QrCode, Link2, CalendarClock, Percent, Wallet, RotateCcw, Split,
  Activity, MessageCircle, PieChart, Smartphone, Copy, Plus, CheckCircle2,
  AlertTriangle, IndianRupee, TrendingUp,
  Repeat, FileSpreadsheet, BellRing, Grid3x3, ShieldAlert,
  CalendarRange, Coins, Calculator, FileSearch,
  Download, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, differenceInCalendarDays } from "date-fns";

// shared styles (reused from TaxPage/DebtPage convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "qr" | "links" | "mandates" | "mdr" | "settlement"
  | "refunds" | "split" | "success" | "collect" | "mix"
  | "autopay" | "bulk" | "reminders" | "qrbatch" | "disputes"
  | "emi" | "convfee" | "forecast" | "tip" | "utr";

async function copy(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Could not copy — copy manually");
  }
}

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <IndianRupee size={18} className="text-[var(--color-primary)]" /> Payments &amp; UPI
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Collect over UPI &amp; cards, build payment links, track autopay mandates, reconcile settlements and watch success rate — India-first money movement.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", IndianRupee],
            ["qr", "UPI QR / Intent", QrCode],
            ["links", "Payment Links", Link2],
            ["mandates", "AutoPay Mandates", CalendarClock],
            ["mdr", "MDR / Surcharge", Percent],
            ["settlement", "Settlement Recon", Wallet],
            ["refunds", "Refund Tracker", RotateCcw],
            ["split", "Split Payment", Split],
            ["success", "Success Rate", Activity],
            ["collect", "Collect Request", MessageCircle],
            ["mix", "Method Mix", PieChart],
            ["autopay", "AutoPay Calc", Repeat],
            ["bulk", "Bulk Payout", FileSpreadsheet],
            ["reminders", "Reminder Plan", BellRing],
            ["qrbatch", "QR Batch", Grid3x3],
            ["disputes", "Dispute Tracker", ShieldAlert],
            ["emi", "EMI on Invoice", CalendarRange],
            ["convfee", "Convenience Fee", Coins],
            ["forecast", "Settle Forecast", Calculator],
            ["tip", "Tip & Rounding", IndianRupee],
            ["utr", "UTR Recon", FileSearch],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview onJump={setTab} />}
      {tab === "qr" && <UpiQrGenerator />}
      {tab === "links" && <PaymentLinkBuilder />}
      {tab === "mandates" && <MandateTracker />}
      {tab === "mdr" && <MdrCalculator />}
      {tab === "settlement" && <SettlementRecon />}
      {tab === "refunds" && <RefundTracker />}
      {tab === "split" && <SplitCalculator />}
      {tab === "success" && <SuccessRateDashboard />}
      {tab === "collect" && <CollectComposer />}
      {tab === "mix" && <MethodMix />}
      {tab === "autopay" && <AutoPayCalculator />}
      {tab === "bulk" && <BulkPayoutBuilder />}
      {tab === "reminders" && <ReminderScheduler />}
      {tab === "qrbatch" && <QrBatchGenerator />}
      {tab === "disputes" && <DisputeTracker />}
      {tab === "emi" && <EmiOnInvoiceBuilder />}
      {tab === "convfee" && <ConvenienceFeeCalculator />}
      {tab === "forecast" && <SettlementForecaster />}
      {tab === "tip" && <TipRoundingConfig />}
      {tab === "utr" && <UtrReconciliation />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────────
function Overview({ onJump }: { onJump: (t: Tab) => void }) {
  const { store } = useApp();
  const [mandates] = useFeatureState<MandateRow[]>("pay-mandates", []);
  const [refunds] = useFeatureState<RefundRow[]>("pay-refunds", []);

  // Inbound payments this month, proxied from revenue transactions.
  const thisM = format(new Date(), "yyyy-MM");
  const inbound = store.transactions.filter(t => t.amount > 0 && t.date.startsWith(thisM));
  const collected = inbound.reduce((s, t) => s + t.amount, 0);
  const activeMandates = mandates.filter(m => m.status === "active");
  const monthlyMandateValue = activeMandates
    .filter(m => m.frequency === "monthly")
    .reduce((s, m) => s + m.cap, 0);
  const pendingRefunds = refunds.filter(r => r.status === "pending");
  const pendingRefundValue = pendingRefunds.reduce((s, r) => s + r.amount, 0);

  const cards = [
    { label: "Collected this month", value: formatAmount(collected), color: "text-green-400", sub: `${inbound.length} inbound payment(s)`, tab: "mix" as Tab },
    { label: "Active AutoPay mandates", value: String(activeMandates.length), color: "text-blue-400", sub: `${formatAmount(monthlyMandateValue)}/mo capped`, tab: "mandates" as Tab },
    { label: "Refunds pending", value: String(pendingRefunds.length), color: pendingRefunds.length ? "text-orange-400" : "text-green-400", sub: formatAmount(pendingRefundValue), tab: "refunds" as Tab },
    { label: "Avg blended MDR", value: "~0.9%", color: "text-yellow-400", sub: "UPI 0% · cards ~2% — tune in MDR tool", tab: "mdr" as Tab },
  ];

  const quick: { id: Tab; label: string; desc: string; Icon: typeof QrCode }[] = [
    { id: "qr", label: "Generate a UPI QR / intent link", desc: "Embed amount + reference for one-scan collection", Icon: QrCode },
    { id: "links", label: "Build a branded payment link", desc: "Share over WhatsApp / SMS with a copyable URL", Icon: Link2 },
    { id: "collect", label: "Send a collect request", desc: "Push a pay-request to a customer via WhatsApp", Icon: MessageCircle },
    { id: "settlement", label: "Reconcile a settlement batch", desc: "Match gateway payouts to gross sales net of MDR", Icon: Wallet },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <button key={c.label} onClick={() => onJump(c.tab)}
            className={`${CARD} p-4 text-left hover:border-[var(--color-primary)]/40 transition-colors`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </button>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1">What you can do here</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Everything below runs on your device — UPI links and QRs use the open NPCI <code className="text-[var(--color-primary)]">upi://pay</code> spec, so they work with any UPI app without a gateway account. Trackers persist to your synced store.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {quick.map(q => (
            <button key={q.id} onClick={() => onJump(q.id)}
              className="flex items-start gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3.5 text-left hover:border-[var(--color-primary)]/40 transition-colors">
              <q.Icon size={16} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{q.label}</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{q.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-px" />
        UPI is zero-MDR for merchants on P2M up to ₹2,000 and broadly subsidised; RuPay debit is also zero-MDR. Steer customers to UPI/RuPay to cut processing cost. Card MDR figures here are indicative — confirm with your acquirer.
      </div>
    </>
  );
}

// ── UPI QR / Intent link generator ─────────────────────────────────────────────────
function buildUpiUri(p: { pa: string; pn: string; am: string; tn: string; tr: string; cu: string }): string {
  const params: [string, string][] = [
    ["pa", p.pa.trim()],
    ["pn", p.pn.trim()],
    ["cu", p.cu],
  ];
  if (p.am.trim() && Number(p.am) > 0) params.push(["am", String(Number(p.am).toFixed(2))]);
  if (p.tn.trim()) params.push(["tn", p.tn.trim()]);
  if (p.tr.trim()) params.push(["tr", p.tr.trim()]);
  const query = params
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `upi://pay?${query}`;
}

function UpiQrGenerator() {
  const { store } = useApp();
  const [pa, setPa] = useState("");
  const [pn, setPn] = useState(store.firm?.name ?? "");
  const [am, setAm] = useState("");
  const [tn, setTn] = useState("");
  const [tr, setTr] = useState("");

  const vpaValid = /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(pa.trim());
  const uri = useMemo(
    () => buildUpiUri({ pa, pn, am, tn, tr, cu: "INR" }),
    [pa, pn, am, tn, tr],
  );
  // Use a public QR image endpoint (no SDK) for a scannable code.
  const qrSrc = vpaValid
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(uri)}`
    : null;

  const fillRef = () => setTr(`HDM${Date.now().toString().slice(-8)}`);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><QrCode size={14} className="text-[var(--color-primary)]" /> UPI QR &amp; Intent Link</h2>
        <p className="text-xs text-[var(--color-muted)]">Builds a standard <code className="text-[var(--color-primary)]">upi://pay</code> intent so any UPI app can scan or tap to pay you — amount and reference pre-filled.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Payee VPA (pa) *</label>
          <input value={pa} onChange={e => setPa(e.target.value)} placeholder="yourbusiness@okhdfcbank" className={INP} />
          {pa.trim() !== "" && !vpaValid && <p className="text-[10px] text-red-400 mt-1">Enter a valid UPI ID like name@bank</p>}
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Payee name (pn)</label>
          <input value={pn} onChange={e => setPn(e.target.value)} placeholder="Acme Traders" className={INP} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹ (am) — blank = payer enters</label>
            <input type="number" min={0} value={am} onChange={e => setAm(e.target.value)} placeholder="1500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Ref / order ID (tr)</label>
            <div className="flex gap-1">
              <input value={tr} onChange={e => setTr(e.target.value)} placeholder="INV-1042" className={INP} />
              <button onClick={fillRef} className="text-[10px] px-2 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] whitespace-nowrap">Auto</button>
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Note shown to payer (tn)</label>
          <input value={tn} onChange={e => setTn(e.target.value)} placeholder="Payment for Invoice 1042" className={INP} />
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-4`}>
        <h3 className="text-sm font-semibold">Result</h3>
        {!vpaValid ? (
          <p className="text-xs text-[var(--color-muted)]">Enter a valid payee VPA to generate the QR and link.</p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              {qrSrc && (
                <img src={qrSrc} alt="UPI payment QR" width={200} height={200}
                  className="rounded-lg border border-[var(--color-border)] bg-white p-2" />
              )}
              {am.trim() && Number(am) > 0
                ? <p className="text-lg font-bold tabular-nums">{formatCurrency(Number(am))}</p>
                : <p className="text-xs text-[var(--color-muted)]">Open amount — payer enters the value</p>}
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">UPI intent link</label>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-[11px] break-all font-mono">{uri}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => copy(uri, "UPI link copied")}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
                <Copy size={12} /> Copy link
              </button>
              <a href={uri}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
                <Smartphone size={12} /> Open in UPI app
              </a>
              <button onClick={() => copy(`Pay ${pn || "us"}${am.trim() ? ` ${formatCurrency(Number(am))}` : ""} via UPI: ${uri}`, "Share text copied")}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
                <MessageCircle size={12} /> Copy share text
              </button>
            </div>
            <p className="text-[10px] text-[var(--color-muted)]">The link opens GPay / PhonePe / Paytm / any UPI app. Tapping on desktop won't work — share it to a phone, or let the customer scan the QR.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Payment-link builder ───────────────────────────────────────────────────────────
function PaymentLinkBuilder() {
  const { store } = useApp();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [gstPct, setGstPct] = useState(String(store.firm?.gstRate ?? 18));
  const [includeGst, setIncludeGst] = useState(true);
  const [allowPartial, setAllowPartial] = useState(false);
  const [expiryDays, setExpiryDays] = useState("7");
  const [vpa, setVpa] = useState("");

  const base = parseFloat(amount) || 0;
  const gst = includeGst ? Math.round(base * (parseFloat(gstPct) || 0) / 100) : 0;
  const total = base + gst;
  const expiryDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (parseInt(expiryDays) || 0));
    return d;
  }, [expiryDays]);

  const vpaValid = /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(vpa.trim());
  const upiLink = vpaValid
    ? buildUpiUri({ pa: vpa, pn: store.firm?.name ?? "", am: String(total), tn: title || "Payment", tr: "", cu: "INR" })
    : "";

  const shareText = useMemo(() => {
    const lines = [
      `${store.firm?.name ?? "We"} — payment request${title ? `: ${title}` : ""}`,
      total > 0 ? `Amount: ${formatCurrency(total)}${gst > 0 ? ` (incl. ${formatCurrency(gst)} GST)` : ""}` : "",
      allowPartial ? "Partial payment allowed." : "",
      `Pay by: ${format(expiryDate, "d MMM yyyy")}`,
      vpaValid ? `UPI: ${upiLink}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }, [store.firm, title, total, gst, allowPartial, expiryDate, upiLink, vpaValid]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Link2 size={14} className="text-[var(--color-primary)]" /> Branded Payment Link</h2>
        <p className="text-xs text-[var(--color-muted)]">Compose a shareable pay-request with GST, expiry and partial-pay terms, backed by a UPI intent link.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Title / what it's for</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Invoice 1042 — design retainer" className={INP} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base amount ₹</label>
            <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GST %</label>
            <input type="number" min={0} value={gstPct} onChange={e => setGstPct(e.target.value)} placeholder="18" className={INP} disabled={!includeGst} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Payee VPA</label>
          <input value={vpa} onChange={e => setVpa(e.target.value)} placeholder="yourbusiness@okhdfcbank" className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Expires in (days)</label>
          <input type="number" min={1} value={expiryDays} onChange={e => setExpiryDays(e.target.value)} placeholder="7" className={`${INP} max-w-[120px]`} />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={includeGst} onChange={e => setIncludeGst(e.target.checked)} className="accent-[var(--color-primary)]" />
            Add GST on top of the base amount
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={allowPartial} onChange={e => setAllowPartial(e.target.checked)} className="accent-[var(--color-primary)]" />
            Allow partial payment
          </label>
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold">Preview</h3>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold">{store.firm?.name ?? "Your business"}</p>
          {title && <p className="text-xs text-[var(--color-muted)]">{title}</p>}
          <div className="flex items-end justify-between pt-1">
            <span className="text-xs text-[var(--color-muted)]">Amount due</span>
            <span className="text-2xl font-bold tabular-nums">{total > 0 ? formatCurrency(total) : "—"}</span>
          </div>
          {gst > 0 && <p className="text-[10px] text-[var(--color-muted)] text-right">Includes {formatCurrency(gst)} GST @ {gstPct}%</p>}
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)] pt-2 border-t border-[var(--color-border)]">
            <span>Pay by {format(expiryDate, "d MMM yyyy")}</span>
            {allowPartial && <span className="text-[var(--color-primary)]">Partial pay allowed</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => copy(shareText, "Payment request copied")}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
            <Copy size={12} /> Copy request text
          </button>
          {vpaValid && (
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
              <MessageCircle size={12} /> Share on WhatsApp
            </a>
          )}
        </div>
        {!vpaValid && <p className="text-[10px] text-orange-400">Add a valid VPA to embed a tappable UPI link in the request.</p>}
      </div>
    </div>
  );
}

// ── AutoPay / e-mandate tracker ──────────────────────────────────────────────────
type MandateRow = {
  id: string; customer: string; cap: number;
  frequency: "monthly" | "quarterly" | "yearly" | "as-presented";
  nextDebit: string; rail: "upi-autopay" | "enach" | "card-si"; status: "active" | "paused" | "revoked";
};
function MandateTracker() {
  const [mandates, setMandates] = useFeatureState<MandateRow[]>("pay-mandates", []);
  const [customer, setCustomer] = useState("");
  const [cap, setCap] = useState("");
  const [frequency, setFrequency] = useState<MandateRow["frequency"]>("monthly");
  const [rail, setRail] = useState<MandateRow["rail"]>("upi-autopay");
  const [nextDebit, setNextDebit] = useState(() => format(addMonths(new Date(), 1), "yyyy-MM-dd"));

  const today = new Date();
  const add = () => {
    const capN = parseFloat(cap);
    if (!customer.trim() || isNaN(capN) || capN <= 0) { toast.error("Enter customer and a valid cap amount"); return; }
    setMandates([...mandates, { id: crypto.randomUUID(), customer: customer.trim(), cap: capN, frequency, rail, nextDebit, status: "active" }]);
    setCustomer(""); setCap("");
    toast.success("Mandate added");
  };
  const cycle = (id: string) =>
    setMandates(mandates.map(m => m.id === id ? { ...m, status: m.status === "active" ? "paused" : m.status === "paused" ? "revoked" : "active" } : m));

  const active = mandates.filter(m => m.status === "active");
  const monthlyEquiv = active.reduce((s, m) => {
    const factor = m.frequency === "monthly" ? 1 : m.frequency === "quarterly" ? 1 / 3 : m.frequency === "yearly" ? 1 / 12 : 1;
    return s + m.cap * factor;
  }, 0);

  const RAIL_LABEL: Record<MandateRow["rail"], string> = { "upi-autopay": "UPI AutoPay", enach: "e-NACH", "card-si": "Card SI" };
  const STATUS_STYLE: Record<MandateRow["status"], string> = {
    active: "bg-green-900/30 text-green-400 border-green-800/40",
    paused: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    revoked: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> AutoPay / e-Mandate Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Track recurring debit mandates across UPI AutoPay, e-NACH and card standing instructions — caps, frequency and next debit date.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Acme Pvt Ltd" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cap ₹</label>
            <input type="number" value={cap} onChange={e => setCap(e.target.value)} placeholder="2999" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Frequency</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as MandateRow["frequency"])} className={INP}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="as-presented">As presented</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rail</label>
            <select value={rail} onChange={e => setRail(e.target.value as MandateRow["rail"])} className={INP}>
              <option value="upi-autopay">UPI AutoPay</option>
              <option value="enach">e-NACH</option>
              <option value="card-si">Card SI</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Next debit</label>
            <input type="date" value={nextDebit} onChange={e => setNextDebit(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Active mandates", value: String(active.length), color: "text-green-400" },
          { label: "Monthly-equivalent value", value: formatAmount(Math.round(monthlyEquiv)), color: "text-blue-400" },
          { label: "Total tracked", value: String(mandates.length), color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {mandates.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No mandates tracked yet. Add your recurring AutoPay / e-NACH subscriptions to see the next debit schedule.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Cap", "Frequency", "Rail", "Next debit", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...mandates].sort((a, b) => a.nextDebit.localeCompare(b.nextDebit)).map(m => {
                  const days = differenceInCalendarDays(new Date(m.nextDebit), today);
                  return (
                    <tr key={m.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{m.customer}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(m.cap)}</td>
                      <td className="px-4 py-2.5 capitalize text-[var(--color-muted)]">{m.frequency.replace("-", " ")}</td>
                      <td className="px-4 py-2.5">{RAIL_LABEL[m.rail]}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {format(new Date(m.nextDebit), "d MMM yyyy")}
                        {m.status === "active" && <span className={`ml-2 text-[10px] ${days <= 3 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{days < 0 ? "overdue" : `${days}d`}</span>}
                      </td>
                      <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[m.status]}`}>{m.status}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => cycle(m.id)} className="text-[10px] text-[var(--color-primary)] hover:underline mr-3">Cycle status</button>
                        <button onClick={() => setMandates(mandates.filter(x => x.id !== m.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">UPI AutoPay requires a pre-debit notification 24h before each charge. Mandates above ₹15,000 per debit need additional authentication. Cycle status toggles active → paused → revoked.</p>
    </div>
  );
}

// ── MDR / surcharge calculator ───────────────────────────────────────────────────
function MdrCalculator() {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"upi" | "rupay-debit" | "debit" | "credit" | "amex" | "netbanking" | "wallet">("credit");
  const [passOn, setPassOn] = useState(false);

  // Indicative MDR rates (%) + GST 18% applies on the fee.
  const RATES: Record<string, { label: string; pct: number; note: string }> = {
    upi: { label: "UPI (P2M)", pct: 0, note: "Zero-MDR by NPCI policy" },
    "rupay-debit": { label: "RuPay debit", pct: 0, note: "Zero-MDR by mandate" },
    debit: { label: "Visa/MC debit", pct: 0.9, note: "Capped ~0.9% (≤₹2,000 lower)" },
    credit: { label: "Credit card", pct: 2.0, note: "Typically 1.8–2.5%" },
    amex: { label: "Amex / Diners", pct: 3.0, note: "Premium network ~3%+" },
    netbanking: { label: "Net banking", pct: 1.0, note: "Flat fee or ~1%" },
    wallet: { label: "Wallets", pct: 1.5, note: "Varies by wallet" },
  };
  const base = parseFloat(amount) || 0;
  const r = RATES[method];
  const fee = base * r.pct / 100;
  const gstOnFee = fee * 0.18;
  const totalCost = fee + gstOnFee;
  const netReceived = base - totalCost;
  const customerPays = passOn ? base + totalCost : base;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> MDR &amp; Surcharge Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">See exactly what each instrument costs you in merchant discount rate (MDR) plus 18% GST, and what you net.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Transaction amount ₹</label>
            <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payment method</label>
            <select value={method} onChange={e => setMethod(e.target.value as typeof method)} className={INP}>
              {Object.entries(RATES).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.pct}%)</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={passOn} onChange={e => setPassOn(e.target.checked)} className="accent-[var(--color-primary)]" />
          Pass the fee on to the customer as a convenience charge
        </label>
        <p className="text-[10px] text-[var(--color-muted)]">{r.label}: {r.note}</p>
      </div>

      {base > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "MDR fee", value: formatCurrency(Math.round(fee)), color: r.pct === 0 ? "text-green-400" : "text-orange-400" },
              { label: "GST on fee (18%)", value: formatCurrency(Math.round(gstOnFee)), color: "text-orange-400" },
              { label: "Total cost to you", value: formatCurrency(Math.round(totalCost)), color: totalCost > 0 ? "text-red-400" : "text-green-400" },
              { label: passOn ? "Customer pays" : "You net", value: formatCurrency(Math.round(passOn ? customerPays : netReceived)), color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          {r.pct > 0 && (
            <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
              <p className="text-sm font-bold text-green-400 flex items-center gap-2">
                <TrendingUp size={14} /> Steering this {formatCurrency(base)} sale to UPI/RuPay saves the full {formatCurrency(Math.round(totalCost))} in fees — your effective margin uplift on every such transaction.
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Rates are indicative market figures, not your contracted MDR. RBI prohibits surcharging on debit cards; convenience fees on credit are allowed only where disclosed. Confirm exact slabs with your acquirer.</p>
    </div>
  );
}

// ── Settlement / payout reconciliation ─────────────────────────────────────────────
type BatchRow = { id: string; date: string; gross: number; mdrPct: number; payoutReceived: number };
function SettlementRecon() {
  const [batches, setBatches] = useFeatureState<BatchRow[]>("pay-settlements", []);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [gross, setGross] = useState("");
  const [mdrPct, setMdrPct] = useState("1.8");
  const [payout, setPayout] = useState("");

  const add = () => {
    const g = parseFloat(gross), p = parseFloat(payout), m = parseFloat(mdrPct);
    if (isNaN(g) || g <= 0 || isNaN(p)) { toast.error("Enter gross sales and the payout actually received"); return; }
    setBatches([...batches, { id: crypto.randomUUID(), date, gross: g, mdrPct: isNaN(m) ? 0 : m, payoutReceived: p }]);
    setGross(""); setPayout("");
    toast.success("Batch added");
  };

  const evaluated = batches.map(b => {
    const fee = b.gross * b.mdrPct / 100;
    const gstOnFee = fee * 0.18;
    const expectedPayout = b.gross - fee - gstOnFee;
    const variance = b.payoutReceived - expectedPayout;
    return { ...b, fee, gstOnFee, expectedPayout, variance, matched: Math.abs(variance) < 1 };
  });
  const totalVariance = evaluated.reduce((s, b) => s + b.variance, 0);
  const unmatched = evaluated.filter(b => !b.matched).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Settlement / Payout Reconciliation</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter each gateway settlement batch — we compute the expected payout (gross less MDR &amp; GST) and flag any variance to chase.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Settlement date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross sales ₹</label>
            <input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">MDR %</label>
            <input type="number" value={mdrPct} onChange={e => setMdrPct(e.target.value)} placeholder="1.8" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payout received ₹</label>
            <input type="number" value={payout} onChange={e => setPayout(e.target.value)} placeholder="97876" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {evaluated.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Batches", value: String(evaluated.length), color: "text-[var(--color-text)]" },
            { label: "Unmatched", value: String(unmatched), color: unmatched ? "text-red-400" : "text-green-400" },
            { label: "Net variance", value: formatCurrency(Math.round(totalVariance)), color: Math.abs(totalVariance) < 1 ? "text-green-400" : totalVariance < 0 ? "text-red-400" : "text-yellow-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add a settlement batch to reconcile gateway payouts against your gross sales.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Date", "Gross", "MDR", "Fee+GST", "Expected payout", "Received", "Variance", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...evaluated].sort((a, b) => b.date.localeCompare(a.date)).map(b => (
                  <tr key={b.id} className={`hover:bg-white/2 ${!b.matched ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-2.5 tabular-nums">{format(new Date(b.date), "d MMM")}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(b.gross)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{b.mdrPct}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(b.fee + b.gstOnFee))}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(b.expectedPayout))}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(b.payoutReceived)}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${b.matched ? "text-green-400" : "text-red-400"}`}>
                      {b.matched ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> ₹0</span> : formatCurrency(Math.round(b.variance))}
                    </td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setBatches(batches.filter(x => x.id !== b.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Expected payout = gross − MDR fee − 18% GST on the fee. A negative variance means the gateway withheld more than expected (TDS, rolling reserve or extra charges) — reconcile against the settlement report.</p>
    </div>
  );
}

// ── Refund tracker ─────────────────────────────────────────────────────────────────
type RefundRow = { id: string; customer: string; orderRef: string; amount: number; reason: string; requested: string; status: "pending" | "processed" | "rejected" };
function RefundTracker() {
  const [refunds, setRefunds] = useFeatureState<RefundRow[]>("pay-refunds", []);
  const [customer, setCustomer] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const add = () => {
    const a = parseFloat(amount);
    if (!customer.trim() || isNaN(a) || a <= 0) { toast.error("Enter customer and a valid refund amount"); return; }
    setRefunds([{ id: crypto.randomUUID(), customer: customer.trim(), orderRef: orderRef.trim(), amount: a, reason: reason.trim(), requested: new Date().toISOString().split("T")[0], status: "pending" }, ...refunds]);
    setCustomer(""); setOrderRef(""); setAmount(""); setReason("");
    toast.success("Refund logged");
  };
  const setStatus = (id: string, status: RefundRow["status"]) =>
    setRefunds(refunds.map(r => r.id === id ? { ...r, status } : r));

  const pending = refunds.filter(r => r.status === "pending");
  const processed = refunds.filter(r => r.status === "processed");
  const STATUS_STYLE: Record<RefundRow["status"], string> = {
    pending: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    processed: "bg-green-900/30 text-green-400 border-green-800/40",
    rejected: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><RotateCcw size={14} className="text-[var(--color-primary)]" /> Refund Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Log every refund request, track ageing and mark it processed. Pending refunds left too long hurt reviews and risk chargebacks.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Ravi Kumar" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Order / ref</label>
            <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="INV-1042" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="2500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Cancelled order" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Log
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending", value: formatAmount(pending.reduce((s, r) => s + r.amount, 0)), sub: `${pending.length} request(s)`, color: pending.length ? "text-orange-400" : "text-green-400" },
          { label: "Processed", value: formatAmount(processed.reduce((s, r) => s + r.amount, 0)), sub: `${processed.length} refunded`, color: "text-green-400" },
          { label: "Total logged", value: String(refunds.length), sub: "all-time", color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {refunds.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No refunds logged yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Ref", "Amount", "Reason", "Age", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {refunds.map(r => {
                  const age = differenceInCalendarDays(new Date(), new Date(r.requested));
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.orderRef || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[160px] truncate">{r.reason || "—"}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${r.status === "pending" && age > 5 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{age}d</td>
                      <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {r.status === "pending" && (
                          <>
                            <button onClick={() => setStatus(r.id, "processed")} className="text-[10px] text-green-400 hover:underline mr-2">Mark refunded</button>
                            <button onClick={() => setStatus(r.id, "rejected")} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 mr-2">Reject</button>
                          </>
                        )}
                        <button onClick={() => setRefunds(refunds.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Refunds to the original instrument typically settle in 5–7 working days for cards and instantly for UPI. Pair every refund with a GST credit note where the original sale was taxed.</p>
    </div>
  );
}

// ── Split-payment calculator ───────────────────────────────────────────────────────
type SplitPart = { id: string; name: string; mode: "percent" | "fixed"; value: number };
function SplitCalculator() {
  const [amount, setAmount] = useState("");
  const [parts, setParts] = useState<SplitPart[]>([
    { id: crypto.randomUUID(), name: "Platform commission", mode: "percent", value: 10 },
    { id: crypto.randomUUID(), name: "Seller payout", mode: "percent", value: 90 },
  ]);

  const total = parseFloat(amount) || 0;
  const computed = parts.map(p => ({ ...p, share: p.mode === "percent" ? total * p.value / 100 : Math.min(p.value, total) }));
  const allocated = computed.reduce((s, p) => s + p.share, 0);
  const unallocated = total - allocated;

  const update = (id: string, patch: Partial<SplitPart>) => setParts(parts.map(p => p.id === id ? { ...p, ...patch } : p));
  const remove = (id: string) => setParts(parts.filter(p => p.id !== id));
  const addPart = () => setParts([...parts, { id: crypto.randomUUID(), name: `Party ${parts.length + 1}`, mode: "percent", value: 0 }]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Split size={14} className="text-[var(--color-primary)]" /> Split-Payment Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">Model a marketplace / partner split — divide one captured payment across several parties by % or fixed amount.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Total payment captured ₹</label>
          <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" className={`${INP} max-w-xs`} />
        </div>
        <div className="space-y-2">
          {parts.map(p => (
            <div key={p.id} className="grid grid-cols-12 gap-2 items-center">
              <input value={p.name} onChange={e => update(p.id, { name: e.target.value })} className={`${INP} col-span-5`} />
              <select value={p.mode} onChange={e => update(p.id, { mode: e.target.value as SplitPart["mode"] })} className={`${INP} col-span-3`}>
                <option value="percent">Percent %</option>
                <option value="fixed">Fixed ₹</option>
              </select>
              <input type="number" value={p.value} onChange={e => update(p.id, { value: parseFloat(e.target.value) || 0 })} className={`${INP} col-span-3`} />
              <button onClick={() => remove(p.id)} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 text-sm">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addPart} className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline"><Plus size={12} /> Add party</button>
      </div>

      {total > 0 && (
        <div className={`${CARD} p-5 space-y-2`}>
          <p className="text-sm font-semibold mb-1">Split breakdown</p>
          {computed.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
              <span className="text-xs text-[var(--color-muted)]">{p.name} <span className="opacity-60">({p.mode === "percent" ? `${p.value}%` : "fixed"})</span></span>
              <span className="tabular-nums font-semibold">{formatCurrency(Math.round(p.share))}</span>
            </div>
          ))}
          <div className={`flex items-center justify-between text-sm pt-2 ${Math.abs(unallocated) < 1 ? "text-green-400" : "text-orange-400"}`}>
            <span className="font-semibold">Unallocated</span>
            <span className="tabular-nums font-bold">{formatCurrency(Math.round(unallocated))}</span>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Split settlement routes one customer payment to multiple bank accounts at capture. Ensure percentages plus fixed amounts don't exceed the captured total — any unallocated balance stays in your account.</p>
    </div>
  );
}

// ── Payment success-rate dashboard ─────────────────────────────────────────────────
type AttemptRow = { id: string; method: string; status: "success" | "failed"; amount: number; declineReason?: string; ts: string };
const DECLINE_REASONS = ["Insufficient funds", "Bank/issuer down", "Limit exceeded", "OTP / 3DS failed", "VPA not found", "Timeout"];
function SuccessRateDashboard() {
  const [attempts, setAttempts] = useFeatureState<AttemptRow[]>("pay-attempts", []);
  const [method, setMethod] = useState("UPI");
  const [status, setStatus] = useState<AttemptRow["status"]>("success");
  const [amount, setAmount] = useState("");
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);

  const add = () => {
    const a = parseFloat(amount);
    if (isNaN(a) || a <= 0) { toast.error("Enter the attempt amount"); return; }
    setAttempts([{ id: crypto.randomUUID(), method, status, amount: a, declineReason: status === "failed" ? declineReason : undefined, ts: new Date().toISOString() }, ...attempts]);
    setAmount("");
    toast.success("Attempt recorded");
  };

  const success = attempts.filter(a => a.status === "success");
  const failed = attempts.filter(a => a.status === "failed");
  const rate = attempts.length ? (success.length / attempts.length) * 100 : 0;
  const recovered = success.reduce((s, a) => s + a.amount, 0);
  const lost = failed.reduce((s, a) => s + a.amount, 0);

  const byMethod = useMemo(() => {
    const map = new Map<string, { total: number; ok: number }>();
    attempts.forEach(a => {
      const m = map.get(a.method) ?? { total: 0, ok: 0 };
      m.total++; if (a.status === "success") m.ok++;
      map.set(a.method, m);
    });
    return [...map.entries()].map(([m, v]) => ({ method: m, total: v.total, rate: v.total ? (v.ok / v.total) * 100 : 0 }));
  }, [attempts]);

  const topDecline = useMemo(() => {
    const map = new Map<string, number>();
    failed.forEach(a => { if (a.declineReason) map.set(a.declineReason, (map.get(a.declineReason) ?? 0) + 1); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [failed]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Payment Success-Rate Dashboard</h2>
        <p className="text-xs text-[var(--color-muted)]">Log payment attempts to track success rate by method and decode why payments fail. Recover lost revenue with the right retry.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={INP}>
              {["UPI", "Credit card", "Debit card", "Net banking", "Wallet"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Outcome</label>
            <select value={status} onChange={e => setStatus(e.target.value as AttemptRow["status"])} className={INP}>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Decline reason</label>
            <select value={declineReason} onChange={e => setDeclineReason(e.target.value)} className={INP} disabled={status !== "failed"}>
              {DECLINE_REASONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Record
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Success rate", value: attempts.length ? `${rate.toFixed(1)}%` : "—", color: rate >= 90 ? "text-green-400" : rate >= 75 ? "text-yellow-400" : "text-red-400" },
          { label: "Attempts", value: String(attempts.length), color: "text-[var(--color-text)]" },
          { label: "Revenue captured", value: formatAmount(recovered), color: "text-green-400" },
          { label: "Revenue at risk", value: formatAmount(lost), color: lost ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {attempts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-3">Success rate by method</p>
            <div className="space-y-3">
              {byMethod.map(m => (
                <div key={m.method}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{m.method} <span className="text-[var(--color-muted)]">· {m.total} attempt(s)</span></span>
                    <span className="tabular-nums">{m.rate.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${m.rate}%`, background: m.rate >= 90 ? "#22c55e" : m.rate >= 75 ? "#eab308" : "#ef4444" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-3">Top decline reasons</p>
            {topDecline.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">No failures logged — nice.</p>
            ) : (
              <div className="space-y-2">
                {topDecline.map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-1.5 last:border-0">
                    <span className="text-xs">{reason}</span>
                    <span className="tabular-nums text-red-400 font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A healthy UPI success rate is 90%+. Bank-down and timeout failures are usually recoverable with a retry after a few minutes; OTP/3DS failures benefit from a fresh link.</p>
    </div>
  );
}

// ── Collect-request composer (WhatsApp) ────────────────────────────────────────────
function CollectComposer() {
  const { store } = useApp();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [dueDays, setDueDays] = useState("3");
  const [vpa, setVpa] = useState("");

  const cleanedPhone = phone.replace(/\D/g, "");
  const waPhone = cleanedPhone.length === 10 ? `91${cleanedPhone}` : cleanedPhone;
  const phoneValid = waPhone.length >= 11 && waPhone.length <= 13;
  const amt = parseFloat(amount) || 0;
  const vpaValid = /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(vpa.trim());
  const due = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + (parseInt(dueDays) || 0)); return d;
  }, [dueDays]);
  const upiLink = vpaValid ? buildUpiUri({ pa: vpa, pn: store.firm?.name ?? "", am: amt > 0 ? String(amt) : "", tn: ref || "Payment", tr: ref, cu: "INR" }) : "";

  const message = useMemo(() => [
    `Hi ${name || "there"},`,
    "",
    `${store.firm?.name ?? "We"} ${amt > 0 ? `have a payment of ${formatCurrency(amt)} due` : "have a payment due"}${ref ? ` for ${ref}` : ""}.`,
    `Kindly clear it by ${format(due, "d MMM yyyy")}.`,
    vpaValid ? `\nPay instantly via UPI: ${upiLink}` : "",
    "\nThank you!",
  ].filter(l => l !== undefined).join("\n"), [name, store.firm, amt, ref, due, vpaValid, upiLink]);

  const waUrl = `https://wa.me/${phoneValid ? waPhone : ""}?text=${encodeURIComponent(message)}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><MessageCircle size={14} className="text-[var(--color-primary)]" /> Collect-Request Composer</h2>
        <p className="text-xs text-[var(--color-muted)]">Compose a payment reminder with an embedded UPI link and send it over WhatsApp (wa.me) in one tap.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ravi" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Mobile (10-digit)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" className={INP} />
            {phone.trim() !== "" && !phoneValid && <p className="text-[10px] text-red-400 mt-1">Enter a valid 10-digit Indian mobile</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="3500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Due in (days)</label>
            <input type="number" value={dueDays} onChange={e => setDueDays(e.target.value)} placeholder="3" className={INP} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Reference / what it's for</label>
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Invoice 1042" className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Your VPA (for the embedded link)</label>
          <input value={vpa} onChange={e => setVpa(e.target.value)} placeholder="yourbusiness@okhdfcbank" className={INP} />
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold">Message preview</h3>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-xs whitespace-pre-wrap leading-relaxed">{message}</div>
        <div className="flex gap-2 flex-wrap">
          <a href={phoneValid ? waUrl : undefined}
            target="_blank" rel="noreferrer"
            onClick={e => { if (!phoneValid) { e.preventDefault(); toast.error("Enter a valid 10-digit mobile first"); } }}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium ${phoneValid ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "bg-[var(--color-accent)] text-[var(--color-muted)] cursor-not-allowed"}`}>
            <MessageCircle size={12} /> Send on WhatsApp
          </a>
          <button onClick={() => copy(message, "Message copied")}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
            <Copy size={12} /> Copy message
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Opens WhatsApp with the message pre-filled to the customer — you still tap send, so it stays personal and within WhatsApp's policy.</p>
      </div>
    </div>
  );
}

// ── Payment-method mix analytics ───────────────────────────────────────────────────
function MethodMix() {
  const { store } = useApp();
  const [attempts] = useFeatureState<AttemptRow[]>("pay-attempts", []);

  // Prefer logged attempts; otherwise infer a mix from inbound revenue transactions.
  const fromAttempts = attempts.filter(a => a.status === "success");
  const usingAttempts = fromAttempts.length > 0;

  const mix = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    if (usingAttempts) {
      fromAttempts.forEach(a => {
        const m = map.get(a.method) ?? { count: 0, value: 0 };
        m.count++; m.value += a.amount; map.set(a.method, m);
      });
    } else {
      // Heuristic inference: bucket inbound revenue by amount band as a stand-in for instrument.
      store.transactions.filter(t => t.amount > 0).forEach(t => {
        const band = t.amount <= 2000 ? "UPI (≤₹2k)" : t.amount <= 50000 ? "Cards / UPI" : "Bank transfer / NEFT";
        const m = map.get(band) ?? { count: 0, value: 0 };
        m.count++; m.value += t.amount; map.set(band, m);
      });
    }
    const total = [...map.values()].reduce((s, v) => s + v.value, 0);
    return { rows: [...map.entries()].map(([method, v]) => ({ method, ...v, pct: total ? (v.value / total) * 100 : 0 })).sort((a, b) => b.value - a.value), total };
  }, [usingAttempts, fromAttempts, store.transactions]);

  const COLORS = ["#22c55e", "#3b82f6", "#eab308", "#a855f7", "#ef4444", "#14b8a6"];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Payment-Method Mix</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          {usingAttempts
            ? "Share of collections by instrument, from your logged successful attempts."
            : "No attempts logged yet — showing an inferred mix from inbound revenue by amount band. Log attempts in the Success Rate tab for exact instrument data."}
        </p>
      </div>

      {mix.rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No inbound payments to analyse yet.</p>
      ) : (
        <>
          <div className={`${CARD} p-5`}>
            <div className="flex h-4 rounded-full overflow-hidden mb-4">
              {mix.rows.map((r, i) => (
                <div key={r.method} style={{ width: `${r.pct}%`, background: COLORS[i % COLORS.length] }} title={`${r.method} ${r.pct.toFixed(0)}%`} />
              ))}
            </div>
            <div className="space-y-3">
              {mix.rows.map((r, i) => (
                <div key={r.method}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      {r.method} <span className="text-[var(--color-muted)]">· {r.count} txn(s)</span>
                    </span>
                    <span className="tabular-nums">{formatAmount(Math.round(r.value))} <span className="text-[var(--color-muted)]">({r.pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`${CARD} p-4 flex items-center justify-between`}>
            <span className="text-xs text-[var(--color-muted)]">Total {usingAttempts ? "collected (logged)" : "inbound revenue"}</span>
            <span className="text-lg font-bold tabular-nums">{formatCurrency(Math.round(mix.total))}</span>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A high UPI share keeps blended MDR near zero. If cards dominate small-ticket sales, nudging customers to UPI directly improves margin.</p>
    </div>
  );
}

// ── UPI AutoPay mandate calculator ─────────────────────────────────────────────────
function AutoPayCalculator() {
  const [plan, setPlan] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly" | "yearly" | "weekly">("monthly");
  const [buffer, setBuffer] = useState("20");

  const amt = parseFloat(plan) || 0;
  const bufferPct = parseFloat(buffer) || 0;
  // The mandate cap should cover the charge plus headroom for taxes / price revisions.
  const cap = amt > 0 ? Math.ceil((amt * (1 + bufferPct / 100)) / 10) * 10 : 0;
  const perYear = { monthly: 12, quarterly: 4, yearly: 1, weekly: 52 }[frequency];
  const annual = amt * perYear;
  // NPCI UPI AutoPay: debits up to ₹15,000 are PIN-less; above needs additional auth each time.
  const pinless = cap <= 15000;
  const debitDates = useMemo(() => {
    const out: Date[] = [];
    const stepM = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "yearly" ? 12 : 0;
    for (let i = 1; i <= 4; i++) {
      out.push(frequency === "weekly" ? new Date(Date.now() + i * 7 * 864e5) : addMonths(new Date(), i * stepM));
    }
    return out;
  }, [frequency]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> UPI AutoPay Mandate Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">Size the right mandate cap for a recurring plan — we add headroom for taxes and price revisions, and flag the ₹15,000 PIN-less threshold and pre-debit notification.</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Charge per cycle ₹</label>
            <input type="number" min={0} value={plan} onChange={e => setPlan(e.target.value)} placeholder="999" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Frequency</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)} className={INP}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cap headroom %</label>
            <input type="number" min={0} value={buffer} onChange={e => setBuffer(e.target.value)} placeholder="20" className={INP} />
          </div>
        </div>
      </div>

      {amt > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Recommended cap", value: formatCurrency(cap), color: "text-blue-400" },
              { label: "Annual value", value: formatAmount(Math.round(annual)), color: "text-green-400" },
              { label: "Debits / year", value: String(perYear), color: "text-[var(--color-text)]" },
              { label: "Auth mode", value: pinless ? "PIN-less" : "Step-up", color: pinless ? "text-green-400" : "text-orange-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-3">Next 4 debit dates &amp; pre-debit notice</p>
            <div className="space-y-2">
              {debitDates.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <span className="text-xs">Debit {i + 1} — <span className="font-medium">{format(d, "d MMM yyyy")}</span></span>
                  <span className="text-[11px] text-[var(--color-muted)]">Notify by {format(new Date(d.getTime() - 864e5), "d MMM")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">UPI AutoPay requires a mandatory pre-debit notification 24h before each charge. Debits at or below ₹15,000 execute without the payer re-entering UPI PIN; larger debits need additional authentication every cycle, so keep the cap under ₹15,000 where you can.</p>
    </div>
  );
}

// ── Bulk-payout file builder (CSV) ─────────────────────────────────────────────────
type PayeeRow = { id: string; name: string; account: string; ifsc: string; amount: number };
function BulkPayoutBuilder() {
  const [rows, setRows] = useFeatureState<PayeeRow[]>("pay-bulk-payees", []);
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [amount, setAmount] = useState("");

  const ifscValid = (v: string) => /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v.trim());
  const add = () => {
    const a = parseFloat(amount);
    if (!name.trim() || !account.trim() || isNaN(a) || a <= 0) { toast.error("Enter payee name, account and a valid amount"); return; }
    if (ifsc.trim() && !ifscValid(ifsc)) { toast.error("IFSC looks invalid (e.g. HDFC0001234)"); return; }
    setRows([...rows, { id: crypto.randomUUID(), name: name.trim(), account: account.trim(), ifsc: ifsc.trim().toUpperCase(), amount: a }]);
    setName(""); setAccount(""); setIfsc(""); setAmount("");
    toast.success("Payee added");
  };

  // Detect duplicate account numbers — a classic bulk-transfer error.
  const dupAccounts = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach(r => seen.set(r.account, (seen.get(r.account) ?? 0) + 1));
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([acc]) => acc));
  }, [rows]);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const exportCsv = () => {
    if (rows.length === 0) { toast.error("Add at least one payee first"); return; }
    const header = "beneficiary_name,account_number,ifsc,amount,narration";
    const body = rows.map(r => [r.name, r.account, r.ifsc, r.amount.toFixed(2), "Payout"].map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bulk-payout-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded — upload to your bank/PG portal");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet size={14} className="text-[var(--color-primary)]" /> Bulk-Payout File Builder</h2>
        <p className="text-xs text-[var(--color-muted)]">Build a validated payee sheet for IMPS/NEFT/UPI bulk disbursal — dedupe accounts, check IFSC format, then export a bank-ready CSV.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Beneficiary</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ravi Traders" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account no.</label>
            <input value={account} onChange={e => setAccount(e.target.value)} placeholder="50100123456789" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IFSC</label>
            <input value={ifsc} onChange={e => setIfsc(e.target.value)} placeholder="HDFC0001234" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="15000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Payees", value: String(rows.length), color: "text-[var(--color-text)]" },
          { label: "Total to disburse", value: formatAmount(Math.round(total)), color: "text-blue-400" },
          { label: "Duplicate accounts", value: String(dupAccounts.size), color: dupAccounts.size ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No payees yet. Add beneficiaries to build a bulk-transfer file.</p>
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
              <Download size={12} /> Export CSV
            </button>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Beneficiary", "Account", "IFSC", "Amount", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className={`hover:bg-white/2 ${dupAccounts.has(r.account) ? "bg-red-950/10" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.account}{dupAccounts.has(r.account) && <span className="ml-2 text-[9px] text-red-400">DUP</span>}</td>
                      <td className="px-4 py-2.5">{r.ifsc || <span className="text-[var(--color-muted)]">—</span>}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">CSV columns match most bank/PG bulk-upload templates (name, account, IFSC, amount, narration). Always run a penny-drop verification before disbursing — a wrong account number is rarely recoverable.</p>
    </div>
  );
}

// ── Payment reminder scheduler ─────────────────────────────────────────────────────
type ReminderRow = { id: string; customer: string; amount: number; dueDate: string; channel: "whatsapp" | "sms" | "email"; cadence: "once" | "3-day" | "weekly"; done: boolean };
function ReminderScheduler() {
  const [reminders, setReminders] = useFeatureState<ReminderRow[]>("pay-reminders", []);
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [channel, setChannel] = useState<ReminderRow["channel"]>("whatsapp");
  const [cadence, setCadence] = useState<ReminderRow["cadence"]>("3-day");

  const add = () => {
    const a = parseFloat(amount);
    if (!customer.trim() || isNaN(a) || a <= 0) { toast.error("Enter customer and a valid amount"); return; }
    setReminders([...reminders, { id: crypto.randomUUID(), customer: customer.trim(), amount: a, dueDate, channel, cadence, done: false }]);
    setCustomer(""); setAmount("");
    toast.success("Reminder scheduled");
  };
  const toggle = (id: string) => setReminders(reminders.map(r => r.id === id ? { ...r, done: !r.done } : r));

  const today = new Date();
  const open = reminders.filter(r => !r.done);
  const overdue = open.filter(r => differenceInCalendarDays(new Date(r.dueDate), today) < 0);
  const outstanding = open.reduce((s, r) => s + r.amount, 0);
  const CADENCE_LABEL: Record<ReminderRow["cadence"], string> = { once: "One-off", "3-day": "Every 3 days", weekly: "Weekly" };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><BellRing size={14} className="text-[var(--color-primary)]" /> Payment Reminder Scheduler</h2>
        <p className="text-xs text-[var(--color-muted)]">Plan a follow-up cadence for each outstanding payment so nothing slips. Mark done once collected. Pair with the Collect-Request composer to actually send.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Acme Pvt Ltd" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="12000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as ReminderRow["channel"])} className={INP}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cadence</label>
            <select value={cadence} onChange={e => setCadence(e.target.value as ReminderRow["cadence"])} className={INP}>
              <option value="once">One-off</option>
              <option value="3-day">Every 3 days</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Schedule
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open reminders", value: String(open.length), color: "text-blue-400" },
          { label: "Overdue", value: String(overdue.length), color: overdue.length ? "text-red-400" : "text-green-400" },
          { label: "Outstanding", value: formatAmount(Math.round(outstanding)), color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {reminders.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No reminders scheduled yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Amount", "Due", "Channel", "Cadence", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...reminders].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(r => {
                  const days = differenceInCalendarDays(new Date(r.dueDate), today);
                  return (
                    <tr key={r.id} className={`hover:bg-white/2 ${r.done ? "opacity-50" : ""}`}>
                      <td className={`px-4 py-2.5 font-medium ${r.done ? "line-through" : ""}`}>{r.customer}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {format(new Date(r.dueDate), "d MMM")}
                        {!r.done && <span className={`ml-2 text-[10px] ${days < 0 ? "text-red-400" : days <= 2 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{days < 0 ? `${-days}d overdue` : `${days}d`}</span>}
                      </td>
                      <td className="px-4 py-2.5 capitalize text-[var(--color-muted)]">{r.channel}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{CADENCE_LABEL[r.cadence]}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => toggle(r.id)} className="text-[10px] text-[var(--color-primary)] hover:underline mr-3">{r.done ? "Reopen" : "Mark paid"}</button>
                        <button onClick={() => setReminders(reminders.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A polite 3-day cadence collects materially faster than a single reminder. Keep WhatsApp messages personal and within policy — you tap send from the Collect-Request composer.</p>
    </div>
  );
}

// ── QR-batch generator (per-table / per-counter) ───────────────────────────────────
function QrBatchGenerator() {
  const { store } = useApp();
  const [vpa, setVpa] = useState("");
  const [prefix, setPrefix] = useState("Table");
  const [count, setCount] = useState("8");
  const [amount, setAmount] = useState("");

  const vpaValid = /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(vpa.trim());
  const n = Math.min(Math.max(parseInt(count) || 0, 0), 50);
  const labels = useMemo(() => Array.from({ length: n }, (_, i) => `${prefix.trim() || "Counter"} ${i + 1}`), [n, prefix]);

  const uriFor = (label: string) =>
    buildUpiUri({ pa: vpa, pn: store.firm?.name ?? "", am: amount.trim() && Number(amount) > 0 ? amount : "", tn: label, tr: label.replace(/\s+/g, "-").toUpperCase(), cu: "INR" });

  const copyAll = () => {
    const text = labels.map(l => `${l}: ${uriFor(l)}`).join("\n");
    copy(text, `${labels.length} QR link(s) copied`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Grid3x3 size={14} className="text-[var(--color-primary)]" /> QR-Batch Generator</h2>
        <p className="text-xs text-[var(--color-muted)]">Print a unique UPI QR per table / counter / room. Each carries its own reference tag (tr) so inbound payments self-identify where they came from.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payee VPA *</label>
            <input value={vpa} onChange={e => setVpa(e.target.value)} placeholder="cafe@okhdfcbank" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Label prefix</label>
            <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Table" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">How many (max 50)</label>
            <input type="number" min={1} max={50} value={count} onChange={e => setCount(e.target.value)} placeholder="8" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Fixed amount ₹ (optional)</label>
            <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="blank = open" className={INP} />
          </div>
        </div>
        {vpa.trim() !== "" && !vpaValid && <p className="text-[10px] text-red-400">Enter a valid UPI ID like cafe@bank</p>}
      </div>

      {!vpaValid ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Enter a valid payee VPA to generate the QR batch.</p>
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={copyAll} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
              <Copy size={12} /> Copy all links
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {labels.map(label => {
              const uri = uriFor(label);
              return (
                <div key={label} className={`${CARD} p-3 flex flex-col items-center gap-2`}>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=6&data=${encodeURIComponent(uri)}`}
                    alt={`UPI QR ${label}`} width={140} height={140}
                    className="rounded-md border border-[var(--color-border)] bg-white p-1.5" />
                  <p className="text-xs font-semibold">{label}</p>
                  <button onClick={() => copy(uri, `${label} link copied`)} className="text-[10px] text-[var(--color-primary)] hover:underline">Copy link</button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Each QR embeds its label as the transaction reference (tr), so your settlement report shows which table/counter collected what — invaluable for tip splitting and per-station reconciliation.</p>
    </div>
  );
}

// ── Chargeback / dispute tracker ───────────────────────────────────────────────────
type DisputeRow = { id: string; customer: string; orderRef: string; amount: number; raised: string; deadline: string; stage: "received" | "evidence-sent" | "won" | "lost" };
function DisputeTracker() {
  const [disputes, setDisputes] = useFeatureState<DisputeRow[]>("pay-disputes", []);
  const [customer, setCustomer] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [amount, setAmount] = useState("");
  const [evidenceDays, setEvidenceDays] = useState("7");

  const add = () => {
    const a = parseFloat(amount);
    if (!customer.trim() || isNaN(a) || a <= 0) { toast.error("Enter customer and the disputed amount"); return; }
    const raised = new Date();
    const deadline = new Date(raised.getTime() + (parseInt(evidenceDays) || 7) * 864e5);
    setDisputes([{ id: crypto.randomUUID(), customer: customer.trim(), orderRef: orderRef.trim(), amount: a, raised: raised.toISOString().split("T")[0], deadline: deadline.toISOString().split("T")[0], stage: "received" }, ...disputes]);
    setCustomer(""); setOrderRef(""); setAmount("");
    toast.success("Dispute logged");
  };
  const setStage = (id: string, stage: DisputeRow["stage"]) => setDisputes(disputes.map(d => d.id === id ? { ...d, stage } : d));

  const today = new Date();
  const openD = disputes.filter(d => d.stage === "received" || d.stage === "evidence-sent");
  const atRisk = openD.reduce((s, d) => s + d.amount, 0);
  const won = disputes.filter(d => d.stage === "won");
  const decided = disputes.filter(d => d.stage === "won" || d.stage === "lost");
  const winRate = decided.length ? (won.length / decided.length) * 100 : 0;
  const STAGE_STYLE: Record<DisputeRow["stage"], string> = {
    received: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    "evidence-sent": "bg-blue-900/30 text-blue-400 border-blue-800/40",
    won: "bg-green-900/30 text-green-400 border-green-800/40",
    lost: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Chargeback / Dispute Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Log every card chargeback with its evidence deadline so you never miss the window — undefended disputes are auto-lost. Track your win rate over time.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Ravi Kumar" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Order / ref</label>
            <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="ORD-5521" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="4999" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Evidence window (days)</label>
            <input type="number" value={evidenceDays} onChange={e => setEvidenceDays(e.target.value)} placeholder="7" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Log
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open disputes", value: String(openD.length), color: openD.length ? "text-orange-400" : "text-green-400" },
          { label: "Amount at risk", value: formatAmount(Math.round(atRisk)), color: "text-red-400" },
          { label: "Win rate", value: decided.length ? `${winRate.toFixed(0)}%` : "—", color: winRate >= 50 ? "text-green-400" : "text-yellow-400" },
          { label: "Total logged", value: String(disputes.length), color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {disputes.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No disputes logged. Add a chargeback the moment your acquirer notifies you.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Ref", "Amount", "Deadline", "Stage", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {disputes.map(d => {
                  const daysLeft = differenceInCalendarDays(new Date(d.deadline), today);
                  const open = d.stage === "received" || d.stage === "evidence-sent";
                  return (
                    <tr key={d.id} className={`hover:bg-white/2 ${open && daysLeft < 0 ? "bg-red-950/10" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{d.customer}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{d.orderRef || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(d.amount)}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {format(new Date(d.deadline), "d MMM")}
                        {open && <span className={`ml-2 text-[10px] ${daysLeft < 0 ? "text-red-400" : daysLeft <= 2 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{daysLeft < 0 ? "lapsed" : `${daysLeft}d left`}</span>}
                      </td>
                      <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STAGE_STYLE[d.stage]}`}>{d.stage.replace("-", " ")}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {d.stage === "received" && <button onClick={() => setStage(d.id, "evidence-sent")} className="text-[10px] text-blue-400 hover:underline mr-2">Evidence sent</button>}
                        {open && (
                          <>
                            <button onClick={() => setStage(d.id, "won")} className="text-[10px] text-green-400 hover:underline mr-2">Won</button>
                            <button onClick={() => setStage(d.id, "lost")} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 mr-2">Lost</button>
                          </>
                        )}
                        <button onClick={() => setDisputes(disputes.filter(x => x.id !== d.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Compile a strong evidence packet — order confirmation, delivery proof, customer comms, and your refund/return policy — before the acquirer's deadline. A clear bank-statement descriptor prevents many disputes in the first place.</p>
    </div>
  );
}

// ── EMI-on-invoice / payment-plan builder ──────────────────────────────────────────
function EmiOnInvoiceBuilder() {
  const [principal, setPrincipal] = useState("");
  const [months, setMonths] = useState("6");
  const [rate, setRate] = useState("0");
  const [start, setStart] = useState(() => format(addMonths(new Date(), 1), "yyyy-MM-dd"));

  const P = parseFloat(principal) || 0;
  const nMonths = Math.max(parseInt(months) || 0, 0);
  const annualRate = parseFloat(rate) || 0;
  const r = annualRate / 12 / 100;
  // Standard reducing-balance EMI; r=0 falls back to a simple equal split.
  const emi = nMonths > 0 ? (r > 0 ? (P * r * Math.pow(1 + r, nMonths)) / (Math.pow(1 + r, nMonths) - 1) : P / nMonths) : 0;
  const totalPayable = emi * nMonths;
  const totalInterest = totalPayable - P;

  const schedule = useMemo(() => {
    if (P <= 0 || nMonths <= 0) return [] as { n: number; date: Date; principal: number; interest: number; balance: number }[];
    let balance = P;
    const out: { n: number; date: Date; principal: number; interest: number; balance: number }[] = [];
    const startDate = new Date(start);
    for (let i = 1; i <= nMonths; i++) {
      const interest = balance * r;
      const principalPart = Math.min(emi - interest, balance);
      balance = Math.max(balance - principalPart, 0);
      out.push({ n: i, date: addMonths(startDate, i - 1), principal: principalPart, interest, balance });
    }
    return out;
  }, [P, nMonths, r, emi, start]);

  const shareText = useMemo(() =>
    schedule.length === 0 ? "" :
      [`Payment plan: ${formatCurrency(Math.round(P))} over ${nMonths} months`,
      `EMI: ${formatCurrency(Math.round(emi))}/month${annualRate > 0 ? ` @ ${annualRate}% p.a.` : " (0% — no interest)"}`,
      ...schedule.map(s => `${format(s.date, "d MMM yyyy")}: ${formatCurrency(Math.round(s.principal + s.interest))}`)].join("\n"),
    [schedule, P, nMonths, emi, annualRate]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarRange size={14} className="text-[var(--color-primary)]" /> EMI-on-Invoice / Payment-Plan Builder</h2>
        <p className="text-xs text-[var(--color-muted)]">Split a large invoice into instalments — set interest (or 0% for a no-cost plan) and generate a dated schedule you can share with the customer.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice amount ₹</label>
            <input type="number" min={0} value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="60000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tenure (months)</label>
            <input type="number" min={1} value={months} onChange={e => setMonths(e.target.value)} placeholder="6" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Interest % p.a.</label>
            <input type="number" min={0} value={rate} onChange={e => setRate(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">First instalment</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      {schedule.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Monthly EMI", value: formatCurrency(Math.round(emi)), color: "text-blue-400" },
              { label: "Total payable", value: formatAmount(Math.round(totalPayable)), color: "text-[var(--color-text)]" },
              { label: "Total interest", value: formatCurrency(Math.round(totalInterest)), color: totalInterest > 0 ? "text-orange-400" : "text-green-400" },
              { label: "Instalments", value: String(nMonths), color: "text-[var(--color-text)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={() => copy(shareText, "Payment plan copied")} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
              <Copy size={12} /> Copy plan
            </button>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["#", "Due date", "Principal", "Interest", "EMI", "Balance"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {schedule.map(s => (
                    <tr key={s.n} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.n}</td>
                      <td className="px-4 py-2.5 tabular-nums">{format(s.date, "d MMM yyyy")}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(s.principal))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(s.interest))}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(s.principal + s.interest))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(s.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A 0% plan is a no-cost EMI — you absorb financing in exchange for a closed sale. Pair each instalment with a UPI AutoPay mandate (see the AutoPay calculator) so collections are automatic.</p>
    </div>
  );
}

// ── Convenience-fee calculator (gross-up to a target net) ───────────────────────────
function ConvenienceFeeCalculator() {
  const [target, setTarget] = useState("");
  const [feePct, setFeePct] = useState("2");
  const [flatFee, setFlatFee] = useState("0");
  const [addGst, setAddGst] = useState(true);

  const net = parseFloat(target) || 0;
  const pct = (parseFloat(feePct) || 0) / 100;
  const flat = parseFloat(flatFee) || 0;
  const gstMult = addGst ? 1.18 : 1; // 18% GST applies on the convenience fee itself
  // Solve for gross G such that G - (G*pct + flat)*gstMult = net.
  const denom = 1 - pct * gstMult;
  const gross = denom > 0 ? (net + flat * gstMult) / denom : 0;
  const feeBase = gross * pct + flat;
  const feeWithGst = feeBase * gstMult;
  const customerPays = gross;
  const effPct = net > 0 ? ((customerPays - net) / net) * 100 : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Convenience-Fee Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">Work backwards from the amount you want to net. We gross-up the charge so the customer's convenience fee (plus GST on it) exactly covers your processing cost.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount you want to net ₹</label>
            <input type="number" min={0} value={target} onChange={e => setTarget(e.target.value)} placeholder="5000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Fee %</label>
            <input type="number" min={0} value={feePct} onChange={e => setFeePct(e.target.value)} placeholder="2" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Flat fee ₹</label>
            <input type="number" min={0} value={flatFee} onChange={e => setFlatFee(e.target.value)} placeholder="0" className={INP} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={addGst} onChange={e => setAddGst(e.target.checked)} className="accent-[var(--color-primary)]" />
          Add 18% GST on the convenience fee
        </label>
      </div>

      {net > 0 && (
        <>
          {denom <= 0 ? (
            <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20 text-xs text-red-400">Fee % is too high to gross-up — reduce it below {(100 / gstMult).toFixed(0)}%.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Customer pays", value: formatCurrency(Math.round(customerPays)), color: "text-[var(--color-text)]" },
                { label: "Convenience fee", value: formatCurrency(Math.round(feeBase)), color: "text-orange-400" },
                { label: "Fee incl. GST", value: formatCurrency(Math.round(feeWithGst)), color: "text-orange-400" },
                { label: "Effective add-on", value: `${effPct.toFixed(2)}%`, color: "text-yellow-400" },
              ].map(k => (
                <div key={k.label} className={`${CARD} p-4`}>
                  <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                  <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">RBI prohibits surcharging on debit cards and UPI. Convenience fees on credit cards / other rails are allowed only where transparently disclosed before payment. This tool sizes the fee so your net equals the target after the fee and its GST.</p>
    </div>
  );
}

// ── Settlement T+1 / T+2 forecaster ────────────────────────────────────────────────
type SaleRow = { id: string; date: string; gross: number; instrument: "upi" | "card" | "netbanking" };
function SettlementForecaster() {
  const [sales, setSales] = useFeatureState<SaleRow[]>("pay-forecast-sales", []);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [gross, setGross] = useState("");
  const [instrument, setInstrument] = useState<SaleRow["instrument"]>("upi");

  // Indicative settlement cycle + blended cost per instrument.
  const PROFILE: Record<SaleRow["instrument"], { label: string; days: number; mdr: number }> = {
    upi: { label: "UPI", days: 1, mdr: 0 },
    card: { label: "Cards", days: 2, mdr: 0.018 },
    netbanking: { label: "Net banking", days: 1, mdr: 0.01 },
  };
  const add = () => {
    const g = parseFloat(gross);
    if (isNaN(g) || g <= 0) { toast.error("Enter the captured amount"); return; }
    setSales([...sales, { id: crypto.randomUUID(), date, gross: g, instrument }]);
    setGross("");
    toast.success("Sale added");
  };

  const forecast = useMemo(() => {
    const map = new Map<string, { gross: number; payout: number }>();
    sales.forEach(s => {
      const p = PROFILE[s.instrument];
      const settleDate = format(new Date(new Date(s.date).getTime() + p.days * 864e5), "yyyy-MM-dd");
      const fee = s.gross * p.mdr;
      const payout = s.gross - fee - fee * 0.18;
      const cur = map.get(settleDate) ?? { gross: 0, payout: 0 };
      cur.gross += s.gross; cur.payout += payout; map.set(settleDate, cur);
    });
    return [...map.entries()].map(([d, v]) => ({ date: d, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  const incoming = forecast.filter(f => f.date >= new Date().toISOString().split("T")[0]).reduce((s, f) => s + f.payout, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Settlement T+1 / T+2 Forecaster</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter captured sales by instrument — we project when each settles (UPI T+1, cards T+2) net of MDR, so you know exactly what lands in your bank and when.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Capture date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross captured ₹</label>
            <input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="25000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Instrument</label>
            <select value={instrument} onChange={e => setInstrument(e.target.value as SaleRow["instrument"])} className={INP}>
              <option value="upi">UPI (T+1, 0%)</option>
              <option value="card">Cards (T+2, ~1.8%)</option>
              <option value="netbanking">Net banking (T+1, ~1%)</option>
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {forecast.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Captured (count)", value: String(sales.length), color: "text-[var(--color-text)]" },
            { label: "Upcoming payouts", value: formatAmount(Math.round(incoming)), color: "text-green-400" },
            { label: "Settlement days", value: String(forecast.length), color: "text-blue-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {forecast.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add captured sales to forecast your settlement calendar.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Settles on", "Gross", "Net payout"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {forecast.map(f => (
                  <tr key={f.date} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums font-medium">{format(new Date(f.date), "EEE, d MMM")}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatAmount(Math.round(f.gross))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400 font-semibold">{formatCurrency(Math.round(f.payout))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Cycles are indicative — most gateways settle UPI/net-banking at T+1 and cards at T+2, excluding bank holidays. Same-day/instant settlement is usually available for a transparent extra fee. Confirm your exact cycle with your acquirer.</p>
    </div>
  );
}

// ── Tip & rounding config ──────────────────────────────────────────────────────────
function TipRoundingConfig() {
  const [bill, setBill] = useState("");
  const [tipMode, setTipMode] = useState<"percent" | "fixed" | "none">("percent");
  const [tipValue, setTipValue] = useState("10");
  const [rounding, setRounding] = useState<"none" | "1" | "5" | "10">("none");

  const base = parseFloat(bill) || 0;
  const tip = tipMode === "percent" ? base * (parseFloat(tipValue) || 0) / 100 : tipMode === "fixed" ? (parseFloat(tipValue) || 0) : 0;
  const subtotal = base + tip;
  const step = rounding === "none" ? 0 : parseInt(rounding);
  const rounded = step > 0 ? Math.ceil(subtotal / step) * step : subtotal;
  const roundDelta = rounded - subtotal;

  const presets = [5, 10, 15, 18];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><IndianRupee size={14} className="text-[var(--color-primary)]" /> Tip &amp; Rounding Config</h2>
        <p className="text-xs text-[var(--color-muted)]">Add an optional tip line and round the payable to a clean figure — the rounding goes to staff/charity as a transparent extra. Useful for cafes, salons and delivery.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Bill amount ₹</label>
          <input type="number" min={0} value={bill} onChange={e => setBill(e.target.value)} placeholder="850" className={`${INP} max-w-xs`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tip mode</label>
            <select value={tipMode} onChange={e => setTipMode(e.target.value as typeof tipMode)} className={INP}>
              <option value="percent">Percent %</option>
              <option value="fixed">Fixed ₹</option>
              <option value="none">No tip</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tip value</label>
            <input type="number" min={0} value={tipValue} onChange={e => setTipValue(e.target.value)} className={INP} disabled={tipMode === "none"} />
          </div>
        </div>
        {tipMode === "percent" && (
          <div className="flex gap-2 flex-wrap">
            {presets.map(p => (
              <button key={p} onClick={() => setTipValue(String(p))}
                className={`text-xs px-3 py-1.5 rounded-lg border ${String(p) === tipValue ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                {p}%
              </button>
            ))}
          </div>
        )}
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Round payable up to nearest ₹</label>
          <select value={rounding} onChange={e => setRounding(e.target.value as typeof rounding)} className={`${INP} max-w-xs`}>
            <option value="none">No rounding</option>
            <option value="1">₹1</option>
            <option value="5">₹5</option>
            <option value="10">₹10</option>
          </select>
        </div>
      </div>

      {base > 0 && (
        <div className={`${CARD} p-5 space-y-2`}>
          <div className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2">
            <span className="text-xs text-[var(--color-muted)]">Bill</span>
            <span className="tabular-nums">{formatCurrency(Math.round(base))}</span>
          </div>
          <div className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2">
            <span className="text-xs text-[var(--color-muted)]">Tip {tipMode === "percent" ? `(${tipValue || 0}%)` : ""}</span>
            <span className="tabular-nums text-green-400">{formatCurrency(Math.round(tip))}</span>
          </div>
          {step > 0 && (
            <div className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2">
              <span className="text-xs text-[var(--color-muted)]">Round-up to ₹{step}</span>
              <span className="tabular-nums text-blue-400">{formatCurrency(roundDelta)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold">Customer pays</span>
            <span className="text-2xl font-bold tabular-nums">{formatCurrency(Math.round(rounded))}</span>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Tips and round-ups should be optional and clearly itemised — never auto-added without consent. The tip line can be routed to a staff payout pool in your bulk-payout file.</p>
    </div>
  );
}

// ── Payout reconciliation by UTR ───────────────────────────────────────────────────
type UtrRow = { id: string; utr: string; amount: number; expected: boolean; note: string };
function UtrReconciliation() {
  const [rows, setRows] = useFeatureState<UtrRow[]>("pay-utr", []);
  const [utr, setUtr] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [side, setSide] = useState<"expected" | "received">("expected");

  const utrValid = (v: string) => /^[A-Za-z0-9]{12,22}$/.test(v.trim());
  const add = () => {
    const a = parseFloat(amount);
    if (!utr.trim() || isNaN(a) || a <= 0) { toast.error("Enter a UTR / RRN and amount"); return; }
    if (!utrValid(utr)) { toast.error("UTR/RRN is typically 12–22 alphanumeric chars"); return; }
    setRows([...rows, { id: crypto.randomUUID(), utr: utr.trim().toUpperCase(), amount: a, expected: side === "expected", note: note.trim() }]);
    setUtr(""); setAmount(""); setNote("");
    toast.success("Entry added");
  };

  // Match expected vs received entries that share the same UTR.
  const evaluated = useMemo(() => {
    const byUtr = new Map<string, UtrRow[]>();
    rows.forEach(r => { const arr = byUtr.get(r.utr) ?? []; arr.push(r); byUtr.set(r.utr, arr); });
    return [...byUtr.entries()].map(([u, entries]) => {
      const exp = entries.find(e => e.expected);
      const rec = entries.find(e => !e.expected);
      const status: "matched" | "missing" | "unexpected" | "mismatch" =
        exp && rec ? (Math.abs(exp.amount - rec.amount) < 1 ? "matched" : "mismatch")
          : exp ? "missing" : "unexpected";
      return { utr: u, exp, rec, status, note: entries.map(e => e.note).filter(Boolean).join(" · ") };
    }).sort((a, b) => a.status.localeCompare(b.status));
  }, [rows]);

  const matched = evaluated.filter(e => e.status === "matched").length;
  const issues = evaluated.filter(e => e.status !== "matched").length;
  const STATUS_STYLE: Record<string, string> = {
    matched: "bg-green-900/30 text-green-400 border-green-800/40",
    missing: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    unexpected: "bg-blue-900/30 text-blue-400 border-blue-800/40",
    mismatch: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSearch size={14} className="text-[var(--color-primary)]" /> Payout Reconciliation by UTR</h2>
        <p className="text-xs text-[var(--color-muted)]">Match expected payouts to actual bank credits by UTR / RRN. Add both your expected entries and the credits from your statement — we flag missing, unexpected and amount-mismatched UTRs.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">UTR / RRN</label>
            <input value={utr} onChange={e => setUtr(e.target.value)} placeholder="HDFCN1234567890" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="9788" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Side</label>
            <select value={side} onChange={e => setSide(e.target.value as typeof side)} className={INP}>
              <option value="expected">Expected (book)</option>
              <option value="received">Received (bank)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Razorpay 12 Jun" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Matched", value: String(matched), color: "text-green-400" },
          { label: "Needs attention", value: String(issues), color: issues ? "text-orange-400" : "text-green-400" },
          { label: "Unique UTRs", value: String(evaluated.length), color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add expected payouts and bank credits to reconcile by UTR.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["UTR / RRN", "Expected", "Received", "Status", "Note", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {evaluated.map(e => (
                  <tr key={e.utr} className={`hover:bg-white/2 ${e.status === "mismatch" ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{e.utr}</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.exp ? formatCurrency(e.exp.amount) : <span className="text-[var(--color-muted)]">—</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.rec ? formatCurrency(e.rec.amount) : <span className="text-[var(--color-muted)]">—</span>}</td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[e.status]}`}>{e.status}</span></td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[160px] truncate">{e.note || "—"}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.utr !== e.utr))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">UTR (NEFT/RTGS) and RRN (IMPS/UPI) uniquely identify a transfer end-to-end. Missing = expected but not credited yet (chase the gateway); unexpected = a credit you didn't book; mismatch = amount differs (likely a fee or partial reversal).</p>
    </div>
  );
}
