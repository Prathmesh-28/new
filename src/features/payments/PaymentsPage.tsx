import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  QrCode, Link2, CalendarClock, Percent, Wallet, RotateCcw, Split,
  Activity, MessageCircle, PieChart, Smartphone, Copy, Plus, CheckCircle2,
  AlertTriangle, IndianRupee, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, differenceInCalendarDays } from "date-fns";

// shared styles (reused from TaxPage/DebtPage convention)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type Tab =
  | "overview" | "qr" | "links" | "mandates" | "mdr" | "settlement"
  | "refunds" | "split" | "success" | "collect" | "mix";

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
