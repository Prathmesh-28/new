import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "@/context/AppContext";
import EmptyState from "@/components/EmptyState";
import { api } from "@/lib/api";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import {
  QrCode, Link2, CalendarClock, Percent, Wallet, RotateCcw, Split,
  Activity, MessageCircle, PieChart, Smartphone, Copy, Plus, CheckCircle2,
  AlertTriangle, IndianRupee, TrendingUp,
  Repeat, FileSpreadsheet, BellRing, Grid3x3, ShieldAlert,
  CalendarRange, Coins, Calculator, FileSearch,
  Download, Trash2,
  FileCheck, Scale, ListOrdered, Boxes, BadgeCheck, Zap, CopyCheck,
  Layers, ArrowDownUp, PiggyBank, PlugZap,
  RefreshCw, HelpCircle, ReceiptText, Lock, PackageCheck,
  ReceiptIndianRupee, Landmark, UserCheck, LineChart, ClipboardCheck,
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
  | "emi" | "convfee" | "forecast" | "tip" | "utr"
  | "nach" | "gwcompare" | "dunning" | "vaccount" | "verify" | "instant" | "dupe"
  | "feetier" | "allocate" | "reserve" | "downtime"
  | "retry" | "decode" | "tds" | "preauth" | "cod"
  | "itc" | "pennydrop" | "approval" | "recovery" | "tippool";

async function copy(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Could not copy - copy manually");
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
            Collect over UPI &amp; cards, build payment links, track autopay mandates, reconcile settlements and watch success rate - India-first money movement.
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
            ["nach", "NACH Register", FileCheck],
            ["gwcompare", "Gateway Compare", Scale],
            ["dunning", "Dunning Ladder", ListOrdered],
            ["vaccount", "Virtual Accounts", Boxes],
            ["verify", "Payee Verify", BadgeCheck],
            ["instant", "Instant Settle", Zap],
            ["dupe", "Duplicate Guard", CopyCheck],
            ["feetier", "Fee Tier Model", Layers],
            ["allocate", "Payment Allocation", ArrowDownUp],
            ["reserve", "Rolling Reserve", PiggyBank],
            ["downtime", "Method Downtime", PlugZap],
            ["retry", "Mandate Retry", RefreshCw],
            ["decode", "Decline Decoder", HelpCircle],
            ["tds", "Settlement TDS", ReceiptText],
            ["preauth", "Pre-Auth Holds", Lock],
            ["cod", "COD → Prepaid", PackageCheck],
            ["itc", "Fee GST / ITC", ReceiptIndianRupee],
            ["pennydrop", "Penny-Drop Verify", Landmark],
            ["approval", "Payout Approvals", UserCheck],
            ["recovery", "Recovery Analytics", LineChart],
            ["tippool", "Tip Pooling", ClipboardCheck],
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
      {tab === "nach" && <NachRegister />}
      {tab === "gwcompare" && <GatewayComparator />}
      {tab === "dunning" && <DunningLadder />}
      {tab === "vaccount" && <VirtualAccountAllocator />}
      {tab === "verify" && <PayeeVerifyLog />}
      {tab === "instant" && <InstantSettleCalculator />}
      {tab === "dupe" && <DuplicateGuard />}
      {tab === "feetier" && <FeeTierModeler />}
      {tab === "allocate" && <PaymentAllocator />}
      {tab === "reserve" && <RollingReserveTracker />}
      {tab === "downtime" && <MethodDowntimeLog />}
      {tab === "retry" && <MandateRetryPlanner />}
      {tab === "decode" && <DeclineDecoder />}
      {tab === "tds" && <SettlementTdsTagger />}
      {tab === "preauth" && <PreAuthHoldTracker />}
      {tab === "cod" && <CodToPrepaidSaver />}
      {tab === "itc" && <FeeGstItcTracker />}
      {tab === "pennydrop" && <PennyDropVerifier />}
      {tab === "approval" && <PayoutApprovalDesk />}
      {tab === "recovery" && <RecoveryAnalytics />}
      {tab === "tippool" && <TipPoolingSplitter />}
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
    { label: "Avg blended MDR", value: "~0.9%", color: "text-yellow-400", sub: "UPI 0% · cards ~2% - tune in MDR tool", tab: "mdr" as Tab },
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
          Everything below runs on your device - UPI links and QRs use the open NPCI <code className="text-[var(--color-primary)]">upi://pay</code> spec, so they work with any UPI app without a gateway account. Trackers persist to your synced store.
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
        UPI is zero-MDR for merchants on P2M up to ₹2,000 and broadly subsidised; RuPay debit is also zero-MDR. Steer customers to UPI/RuPay to cut processing cost. Card MDR figures here are indicative - confirm with your acquirer.
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
        <p className="text-xs text-[var(--color-muted)]">Builds a standard <code className="text-[var(--color-primary)]">upi://pay</code> intent so any UPI app can scan or tap to pay you - amount and reference pre-filled.</p>
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
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹ (am) - blank = payer enters</label>
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
                : <p className="text-xs text-[var(--color-muted)]">Open amount - payer enters the value</p>}
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
            <p className="text-[10px] text-[var(--color-muted)]">The link opens GPay / PhonePe / Paytm / any UPI app. Tapping on desktop won't work - share it to a phone, or let the customer scan the QR.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Payment-link builder ───────────────────────────────────────────────────────────
// ── Live payment-link API shapes (backend: modules/books/payments.js) ──────────────
type LedgerLite = { id: string; name: string; is_party: boolean; is_bank: boolean; is_active: boolean };
type PaymentLink = {
  id: string;
  invoice_voucher_id: string | null;
  party_ledger_id: string | null;
  provider: string;
  provider_ref?: string | null;
  amount: string;
  status: "CREATED" | "PAID" | string;
  link_url: string | null;
  created_at?: string;
  note?: string;
};

function PaymentLinkBuilder() {
  const { store } = useApp();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [gstPct, setGstPct] = useState(String(store.firm?.gstRate ?? 18));
  const [includeGst, setIncludeGst] = useState(true);
  const [allowPartial, setAllowPartial] = useState(false);
  const [expiryDays, setExpiryDays] = useState("7");
  const [vpa, setVpa] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  // Live backend wiring: real hosted links + settlement reconciliation.
  const [ledgers, setLedgers] = useState<LedgerLite[]>([]);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [partyLedgerId, setPartyLedgerId] = useState("");
  const [bankLedgerId, setBankLedgerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(true);

  const partyLedgers = useMemo(() => ledgers.filter(l => l.is_party && l.is_active), [ledgers]);
  const bankLedgers = useMemo(() => ledgers.filter(l => l.is_bank && l.is_active), [ledgers]);

  const refreshLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const rows = await api.get<PaymentLink[]>("/api/books/payments/links");
      setLinks(Array.isArray(rows) ? rows : []);
      setApiAvailable(true);
    } catch {
      setApiAvailable(false);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const l = await api.get<LedgerLite[]>("/api/books/ledgers");
        if (alive) setLedgers(Array.isArray(l) ? l : []);
      } catch { /* books not set up / offline - manual UPI link still works */ }
    })();
    refreshLinks();
    return () => { alive = false; };
  }, [refreshLinks]);

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
      `${store.firm?.name ?? "We"} - payment request${title ? `: ${title}` : ""}`,
      total > 0 ? `Amount: ${formatCurrency(total)}${gst > 0 ? ` (incl. ${formatCurrency(gst)} GST)` : ""}` : "",
      allowPartial ? "Partial payment allowed." : "",
      `Pay by: ${format(expiryDate, "d MMM yyyy")}`,
      vpaValid ? `UPI: ${upiLink}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }, [store.firm, title, total, gst, allowPartial, expiryDate, upiLink, vpaValid]);

  async function generateLink() {
    if (!(total > 0)) { toast.error("Enter a base amount first"); return; }
    setCreating(true);
    try {
      const link = await api.post<PaymentLink>("/api/books/payments/links", {
        amount: total,
        partyLedgerId: partyLedgerId || undefined,
        provider: "razorpay",
      });
      if (link?.link_url && !link.link_url.startsWith("pending-gateway://")) {
        toast.success("Live payment link created");
      } else {
        toast.success(link?.note ? "Link created - mark paid manually" : "Link created");
        if (link?.note) toast.message(link.note);
      }
      setApiAvailable(true);
      await refreshLinks();
    } catch (e) {
      setApiAvailable(false);
      toast.error(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not create link - books may not be set up");
    } finally {
      setCreating(false);
    }
  }

  async function markPaid(linkId: string) {
    if (!bankLedgerId) { toast.error("Pick the bank/UPI ledger that received the money"); return; }
    setPayingId(linkId);
    try {
      await api.post(`/api/books/payments/links/${linkId}/paid`, { bankLedgerId });
      toast.success("Marked paid - receipt posted & allocated");
      await refreshLinks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not mark paid");
    } finally {
      setPayingId(null);
    }
  }

  function shareLinkText(link: PaymentLink) {
    const url = link.link_url && !link.link_url.startsWith("pending-gateway://") ? link.link_url : "";
    return [
      `${store.firm?.name ?? "We"} - payment request${title ? `: ${title}` : ""}`,
      `Amount: ${formatCurrency(Number(link.amount) || 0)}`,
      url ? `Pay securely: ${url}` : "",
    ].filter(Boolean).join("\n");
  }

  const liveUrlFor = (link: PaymentLink) =>
    link.link_url && !link.link_url.startsWith("pending-gateway://") ? link.link_url : "";

  return (
    <div className="space-y-4">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Link2 size={14} className="text-[var(--color-primary)]" /> Branded Payment Link</h2>
        <p className="text-xs text-[var(--color-muted)]">Compose a shareable pay-request with GST, expiry and partial-pay terms, backed by a UPI intent link.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Title / what it's for</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Invoice 1042 - design retainer" className={INP} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Base amount ₹</label>
            <input ref={amountRef} type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" className={INP} />
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

        <div className="pt-3 mt-1 border-t border-[var(--color-border)] space-y-2">
          <p className="text-xs font-medium flex items-center gap-1.5"><Zap size={12} className="text-[var(--color-primary)]" /> Generate a real hosted link</p>
          {partyLedgers.length > 0 && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Bill to (party ledger) - optional, enables auto-allocation</label>
              <select value={partyLedgerId} onChange={e => setPartyLedgerId(e.target.value)} className={INP}>
                <option value="">- Account-level (no party) -</option>
                {partyLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <button onClick={generateLink} disabled={creating || !(total > 0)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-50">
            {creating ? <RefreshCw size={12} className="animate-spin" /> : <Link2 size={12} />} {creating ? "Creating…" : "Create live payment link"}
          </button>
          <p className="text-[10px] text-[var(--color-muted)]">Mints a Razorpay hosted link when gateway keys are set; otherwise records a trackable link you mark paid manually. Posts a receipt against the party on settlement.</p>
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold">Preview</h3>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold">{store.firm?.name ?? "Your business"}</p>
          {title && <p className="text-xs text-[var(--color-muted)]">{title}</p>}
          <div className="flex items-end justify-between pt-1">
            <span className="text-xs text-[var(--color-muted)]">Amount due</span>
            <span className="text-2xl font-bold tabular-nums">{total > 0 ? formatCurrency(total) : "-"}</span>
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

    <div className={`${CARD} p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Link2 size={14} className="text-[var(--color-primary)]" /> Live payment links</h3>
        <button onClick={refreshLinks} disabled={loadingLinks}
          className="flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-50">
          <RefreshCw size={11} className={loadingLinks ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      {bankLedgers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-[var(--color-muted)]">Settle into</label>
          <select value={bankLedgerId} onChange={e => setBankLedgerId(e.target.value)} className={`${INP} max-w-[260px]`}>
            <option value="">- Pick bank / UPI ledger -</option>
            {bankLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
      {!apiAvailable ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Books backend unavailable - manual UPI links above still work. Links will appear here once you're online and the chart of accounts is set up.</p>
      ) : links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No payment links yet"
          description="Create a branded UPI / card payment link to collect from a customer - it appears here with a copyable URL, a WhatsApp share, and a mark-paid action."
          ctaText="Create a payment link"
          onCta={() => { amountRef.current?.focus(); amountRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
        />
      ) : (
        <div className="space-y-2">
          {links.map(link => {
            const url = liveUrlFor(link);
            const paid = link.status === "PAID";
            return (
              <div key={link.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(link.amount) || 0)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${paid ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>{paid ? "Paid" : "Awaiting"}</span>
                    <span className="text-[10px] text-[var(--color-muted)] uppercase">{link.provider}</span>
                  </div>
                  {url
                    ? <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--color-primary)] hover:underline break-all">{url}</a>
                    : <span className="text-[11px] text-[var(--color-muted)]">{link.note ? link.note : "No hosted URL - mark paid manually."}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {url && (
                    <>
                      <button onClick={() => copy(url, "Payment link copied")} className="flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline">
                        <Copy size={11} /> Copy
                      </button>
                      <a href={`https://wa.me/?text=${encodeURIComponent(shareLinkText(link))}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-[var(--color-text)] hover:text-[var(--color-primary)]">
                        <MessageCircle size={11} /> Share
                      </a>
                    </>
                  )}
                  {!paid && (
                    <button onClick={() => markPaid(link.id)} disabled={payingId === link.id}
                      className="flex items-center gap-1 text-[11px] bg-[var(--color-primary)] text-[var(--color-bg)] px-2.5 py-1 rounded-md font-medium disabled:opacity-50">
                      {payingId === link.id ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Mark paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
        <p className="text-xs text-[var(--color-muted)]">Track recurring debit mandates across UPI AutoPay, e-NACH and card standing instructions - caps, frequency and next debit date.</p>
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
    credit: { label: "Credit card", pct: 2.0, note: "Typically 1.8-2.5%" },
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
                <TrendingUp size={14} /> Steering this {formatCurrency(base)} sale to UPI/RuPay saves the full {formatCurrency(Math.round(totalCost))} in fees - your effective margin uplift on every such transaction.
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
        <p className="text-xs text-[var(--color-muted)]">Enter each gateway settlement batch - we compute the expected payout (gross less MDR &amp; GST) and flag any variance to chase.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Expected payout = gross − MDR fee − 18% GST on the fee. A negative variance means the gateway withheld more than expected (TDS, rolling reserve or extra charges) - reconcile against the settlement report.</p>
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
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.orderRef || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[160px] truncate">{r.reason || "-"}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">Refunds to the original instrument typically settle in 5-7 working days for cards and instantly for UPI. Pair every refund with a GST credit note where the original sale was taxed.</p>
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
        <p className="text-xs text-[var(--color-muted)]">Model a marketplace / partner split - divide one captured payment across several parties by % or fixed amount.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Split settlement routes one customer payment to multiple bank accounts at capture. Ensure percentages plus fixed amounts don't exceed the captured total - any unallocated balance stays in your account.</p>
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
          { label: "Success rate", value: attempts.length ? `${rate.toFixed(1)}%` : "-", color: rate >= 90 ? "text-green-400" : rate >= 75 ? "text-yellow-400" : "text-red-400" },
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
              <p className="text-xs text-[var(--color-muted)]">No failures logged - nice.</p>
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
        <p className="text-[10px] text-[var(--color-muted)]">Opens WhatsApp with the message pre-filled to the customer - you still tap send, so it stays personal and within WhatsApp's policy.</p>
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
            : "No attempts logged yet - showing an inferred mix from inbound revenue by amount band. Log attempts in the Success Rate tab for exact instrument data."}
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
        <p className="text-xs text-[var(--color-muted)]">Size the right mandate cap for a recurring plan - we add headroom for taxes and price revisions, and flag the ₹15,000 PIN-less threshold and pre-debit notification.</p>
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
                  <span className="text-xs">Debit {i + 1} - <span className="font-medium">{format(d, "d MMM yyyy")}</span></span>
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

  // Detect duplicate account numbers - a classic bulk-transfer error.
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
    toast.success("CSV downloaded - upload to your bank/PG portal");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet size={14} className="text-[var(--color-primary)]" /> Bulk-Payout File Builder</h2>
        <p className="text-xs text-[var(--color-muted)]">Build a validated payee sheet for IMPS/NEFT/UPI bulk disbursal - dedupe accounts, check IFSC format, then export a bank-ready CSV.</p>
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
                      <td className="px-4 py-2.5">{r.ifsc || <span className="text-[var(--color-muted)]">-</span>}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">CSV columns match most bank/PG bulk-upload templates (name, account, IFSC, amount, narration). Always run a penny-drop verification before disbursing - a wrong account number is rarely recoverable.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">A polite 3-day cadence collects materially faster than a single reminder. Keep WhatsApp messages personal and within policy - you tap send from the Collect-Request composer.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Each QR embeds its label as the transaction reference (tr), so your settlement report shows which table/counter collected what - invaluable for tip splitting and per-station reconciliation.</p>
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
        <p className="text-xs text-[var(--color-muted)]">Log every card chargeback with its evidence deadline so you never miss the window - undefended disputes are auto-lost. Track your win rate over time.</p>
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
          { label: "Win rate", value: decided.length ? `${winRate.toFixed(0)}%` : "-", color: winRate >= 50 ? "text-green-400" : "text-yellow-400" },
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
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{d.orderRef || "-"}</td>
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
      <p className="text-[10px] text-[var(--color-muted)]">Compile a strong evidence packet - order confirmation, delivery proof, customer comms, and your refund/return policy - before the acquirer's deadline. A clear bank-statement descriptor prevents many disputes in the first place.</p>
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
      `EMI: ${formatCurrency(Math.round(emi))}/month${annualRate > 0 ? ` @ ${annualRate}% p.a.` : " (0% - no interest)"}`,
      ...schedule.map(s => `${format(s.date, "d MMM yyyy")}: ${formatCurrency(Math.round(s.principal + s.interest))}`)].join("\n"),
    [schedule, P, nMonths, emi, annualRate]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarRange size={14} className="text-[var(--color-primary)]" /> EMI-on-Invoice / Payment-Plan Builder</h2>
        <p className="text-xs text-[var(--color-muted)]">Split a large invoice into instalments - set interest (or 0% for a no-cost plan) and generate a dated schedule you can share with the customer.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">A 0% plan is a no-cost EMI - you absorb financing in exchange for a closed sale. Pair each instalment with a UPI AutoPay mandate (see the AutoPay calculator) so collections are automatic.</p>
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
            <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20 text-xs text-red-400">Fee % is too high to gross-up - reduce it below {(100 / gstMult).toFixed(0)}%.</div>
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
        <p className="text-xs text-[var(--color-muted)]">Enter captured sales by instrument - we project when each settles (UPI T+1, cards T+2) net of MDR, so you know exactly what lands in your bank and when.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Cycles are indicative - most gateways settle UPI/net-banking at T+1 and cards at T+2, excluding bank holidays. Same-day/instant settlement is usually available for a transparent extra fee. Confirm your exact cycle with your acquirer.</p>
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
        <p className="text-xs text-[var(--color-muted)]">Add an optional tip line and round the payable to a clean figure - the rounding goes to staff/charity as a transparent extra. Useful for cafes, salons and delivery.</p>
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
      <p className="text-[10px] text-[var(--color-muted)]">Tips and round-ups should be optional and clearly itemised - never auto-added without consent. The tip line can be routed to a staff payout pool in your bulk-payout file.</p>
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
    if (!utrValid(utr)) { toast.error("UTR/RRN is typically 12-22 alphanumeric chars"); return; }
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
        <p className="text-xs text-[var(--color-muted)]">Match expected payouts to actual bank credits by UTR / RRN. Add both your expected entries and the credits from your statement - we flag missing, unexpected and amount-mismatched UTRs.</p>
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
                    <td className="px-4 py-2.5 tabular-nums">{e.exp ? formatCurrency(e.exp.amount) : <span className="text-[var(--color-muted)]">-</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.rec ? formatCurrency(e.rec.amount) : <span className="text-[var(--color-muted)]">-</span>}</td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[e.status]}`}>{e.status}</span></td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[160px] truncate">{e.note || "-"}</td>
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

// ── NACH / e-NACH mandate register ─────────────────────────────────────────────────
type NachRow = {
  id: string; umrn: string; customer: string; amount: number;
  freq: "monthly" | "quarterly" | "half-yearly" | "yearly" | "adhoc";
  sponsorBank: string; debitBank: string; mode: "e-mandate" | "physical";
  start: string; end: string; status: "pending" | "active" | "rejected" | "cancelled";
};
function NachRegister() {
  const [rows, setRows] = useFeatureState<NachRow[]>("pay-nach", []);
  const [umrn, setUmrn] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<NachRow["freq"]>("monthly");
  const [sponsorBank, setSponsorBank] = useState("");
  const [debitBank, setDebitBank] = useState("");
  const [mode, setMode] = useState<NachRow["mode"]>("e-mandate");
  const [start, setStart] = useState(() => new Date().toISOString().split("T")[0]);
  const [end, setEnd] = useState(() => format(addMonths(new Date(), 12), "yyyy-MM-dd"));

  const add = () => {
    const a = parseFloat(amount);
    if (!customer.trim() || isNaN(a) || a <= 0) { toast.error("Enter customer and a valid max debit amount"); return; }
    setRows([{ id: crypto.randomUUID(), umrn: umrn.trim(), customer: customer.trim(), amount: a, freq, sponsorBank: sponsorBank.trim(), debitBank: debitBank.trim(), mode, start, end, status: "pending" }, ...rows]);
    setUmrn(""); setCustomer(""); setAmount("");
    toast.success("Mandate registered");
  };
  const setStatus = (id: string, status: NachRow["status"]) => setRows(rows.map(r => r.id === id ? { ...r, status } : r));

  const active = rows.filter(r => r.status === "active");
  const monthlyEquiv = active.reduce((s, r) => {
    const f = r.freq === "monthly" ? 1 : r.freq === "quarterly" ? 1 / 3 : r.freq === "half-yearly" ? 1 / 6 : r.freq === "yearly" ? 1 / 12 : 0;
    return s + r.amount * f;
  }, 0);
  const expiringSoon = active.filter(r => differenceInCalendarDays(new Date(r.end), new Date()) <= 30).length;

  const STATUS_STYLE: Record<NachRow["status"], string> = {
    pending: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    active: "bg-green-900/30 text-green-400 border-green-800/40",
    rejected: "bg-red-900/30 text-red-400 border-red-800/40",
    cancelled: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileCheck size={14} className="text-[var(--color-primary)]" /> NACH / e-NACH Mandate Register</h2>
        <p className="text-xs text-[var(--color-muted)]">Maintain the formal mandate paperwork - UMRN, sponsor &amp; destination bank, validity window and approval state - for every NACH / e-NACH debit you sponsor. Distinct from the live AutoPay tracker; this is your register of record.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">UMRN</label>
            <input value={umrn} onChange={e => setUmrn(e.target.value)} placeholder="HDFC68012..." className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Acme Pvt Ltd" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Max debit ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Frequency</label>
            <select value={freq} onChange={e => setFreq(e.target.value as NachRow["freq"])} className={INP}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half-yearly">Half-yearly</option>
              <option value="yearly">Yearly</option>
              <option value="adhoc">As &amp; when</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value as NachRow["mode"])} className={INP}>
              <option value="e-mandate">e-NACH</option>
              <option value="physical">Physical</option>
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sponsor bank</label>
            <input value={sponsorBank} onChange={e => setSponsorBank(e.target.value)} placeholder="HDFC Bank" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer's bank</label>
            <input value={debitBank} onChange={e => setDebitBank(e.target.value)} placeholder="SBI" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Valid from</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Valid until</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active mandates", value: String(active.length), color: "text-green-400" },
          { label: "Monthly-equiv value", value: formatAmount(Math.round(monthlyEquiv)), color: "text-blue-400" },
          { label: "Expiring ≤30d", value: String(expiringSoon), color: expiringSoon ? "text-orange-400" : "text-green-400" },
          { label: "Total registered", value: String(rows.length), color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No mandates registered. Add the UMRN and bank details once the NPCI mandate is approved.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["UMRN", "Customer", "Max debit", "Freq", "Banks", "Validity", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const daysLeft = differenceInCalendarDays(new Date(r.end), new Date());
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-mono text-[11px]">{r.umrn || "-"}</td>
                      <td className="px-4 py-2.5 font-medium">{r.customer} <span className="text-[9px] text-[var(--color-muted)]">{r.mode === "e-mandate" ? "e-NACH" : "physical"}</span></td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-2.5 capitalize text-[var(--color-muted)]">{r.freq.replace("-", " ")}</td>
                      <td className="px-4 py-2.5 text-[11px] text-[var(--color-muted)]">{r.sponsorBank || "-"} → {r.debitBank || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[11px]">
                        {format(new Date(r.start), "MMM yy")}-{format(new Date(r.end), "MMM yy")}
                        {r.status === "active" && daysLeft <= 30 && <span className="ml-1 text-[9px] text-orange-400">{daysLeft < 0 ? "expired" : `${daysLeft}d`}</span>}
                      </td>
                      <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {r.status === "pending" && (
                          <>
                            <button onClick={() => setStatus(r.id, "active")} className="text-[10px] text-green-400 hover:underline mr-2">Approve</button>
                            <button onClick={() => setStatus(r.id, "rejected")} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 mr-2">Reject</button>
                          </>
                        )}
                        {r.status === "active" && <button onClick={() => setStatus(r.id, "cancelled")} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 mr-2">Cancel</button>}
                        <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">UMRN (Unique Mandate Reference Number) is issued by NPCI once a NACH mandate is accepted by the destination bank. e-NACH (Aadhaar/net-banking/debit-card auth) activates in ~T+1; physical mandates take longer. Keep this register reconciled with your sponsor bank's mandate file.</p>
    </div>
  );
}

// ── Payment-gateway comparator ──────────────────────────────────────────────────────
type GwRow = { id: string; name: string; pct: number; flat: number; successPct: number; settleDays: number };
function GatewayComparator() {
  const [monthlyVol, setMonthlyVol] = useState("500000");
  const [txns, setTxns] = useState("400");
  const [gws, setGws] = useState<GwRow[]>([
    { id: crypto.randomUUID(), name: "Razorpay", pct: 2.0, flat: 0, successPct: 92, settleDays: 2 },
    { id: crypto.randomUUID(), name: "Cashfree", pct: 1.9, flat: 0, successPct: 93, settleDays: 1 },
    { id: crypto.randomUUID(), name: "PhonePe PG", pct: 1.8, flat: 0, successPct: 90, settleDays: 1 },
  ]);

  const vol = parseFloat(monthlyVol) || 0;
  const n = parseInt(txns) || 0;

  const update = (id: string, patch: Partial<GwRow>) => setGws(gws.map(g => g.id === id ? { ...g, ...patch } : g));
  const addGw = () => setGws([...gws, { id: crypto.randomUUID(), name: `Gateway ${gws.length + 1}`, pct: 2.0, flat: 0, successPct: 90, settleDays: 2 }]);

  const evaluated = gws.map(g => {
    const mdr = vol * g.pct / 100;
    const flatTotal = g.flat * n;
    const fee = mdr + flatTotal;
    const gst = fee * 0.18;
    const totalCost = fee + gst;
    // realised GMV factors in success rate - failed attempts are lost / retried elsewhere
    const realisedGmv = vol * g.successPct / 100;
    // effective cost as % of realised volume
    const effPct = realisedGmv > 0 ? totalCost / realisedGmv * 100 : 0;
    return { ...g, totalCost, realisedGmv, effPct };
  });
  const cheapest = evaluated.length ? evaluated.reduce((a, b) => b.totalCost < a.totalCost ? b : a) : null;
  const bestEff = evaluated.length ? evaluated.reduce((a, b) => b.effPct < a.effPct ? b : a) : null;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Payment-Gateway Comparator</h2>
        <p className="text-xs text-[var(--color-muted)]">Compare acquirers on true cost - MDR % plus per-txn flat fee plus 18% GST - and weight it by success rate and settlement speed. The lowest sticker rate isn't always the cheapest once declines are priced in.</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly volume ₹</label>
            <input type="number" value={monthlyVol} onChange={e => setMonthlyVol(e.target.value)} placeholder="500000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Transactions / mo</label>
            <input type="number" value={txns} onChange={e => setTxns(e.target.value)} placeholder="400" className={INP} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] text-[var(--color-muted)] uppercase tracking-wider px-1">
            <span className="col-span-3">Gateway</span><span className="col-span-2">MDR %</span><span className="col-span-2">Flat ₹</span><span className="col-span-2">Success %</span><span className="col-span-2">Settle (d)</span><span className="col-span-1"></span>
          </div>
          {gws.map(g => (
            <div key={g.id} className="grid grid-cols-12 gap-2 items-center">
              <input value={g.name} onChange={e => update(g.id, { name: e.target.value })} className={`${INP} col-span-3`} />
              <input type="number" step="0.1" value={g.pct} onChange={e => update(g.id, { pct: parseFloat(e.target.value) || 0 })} className={`${INP} col-span-2`} />
              <input type="number" value={g.flat} onChange={e => update(g.id, { flat: parseFloat(e.target.value) || 0 })} className={`${INP} col-span-2`} />
              <input type="number" value={g.successPct} onChange={e => update(g.id, { successPct: parseFloat(e.target.value) || 0 })} className={`${INP} col-span-2`} />
              <input type="number" value={g.settleDays} onChange={e => update(g.id, { settleDays: parseFloat(e.target.value) || 0 })} className={`${INP} col-span-2`} />
              <button onClick={() => setGws(gws.filter(x => x.id !== g.id))} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 text-sm">✕</button>
            </div>
          ))}
          <button onClick={addGw} className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline"><Plus size={12} /> Add gateway</button>
        </div>
      </div>

      {evaluated.length > 0 && vol > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Gateway", "Total cost/mo", "Realised GMV", "Eff. cost %", "Settle", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...evaluated].sort((a, b) => a.effPct - b.effPct).map(g => (
                  <tr key={g.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{g.name}
                      {cheapest?.id === g.id && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full border border-blue-800/40 bg-blue-900/30 text-blue-400">cheapest</span>}
                      {bestEff?.id === g.id && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full border border-green-800/40 bg-green-900/30 text-green-400">best value</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(g.totalCost))}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(Math.round(g.realisedGmv))}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold">{g.effPct.toFixed(2)}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">T+{g.settleDays}</td>
                    <td className="px-4 py-2.5"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Effective cost % = (MDR + flat fees + 18% GST) ÷ realised GMV, where realised GMV discounts the volume lost to declines. A gateway with a higher sticker MDR but better success can net out cheaper. Faster settlement (lower T+n) frees working capital - weigh it against cost.</p>
    </div>
  );
}

// ── Subscription dunning retry-ladder ────────────────────────────────────────────────
type DunStep = { id: string; dayOffset: number; channel: "upi-autopay" | "whatsapp" | "sms" | "email" | "call"; action: string };
function DunningLadder() {
  const [steps, setSteps] = useFeatureState<DunStep[]>("pay-dunning", [
    { id: "d1", dayOffset: 0, channel: "upi-autopay", action: "Auto re-present mandate (T+0)" },
    { id: "d2", dayOffset: 1, channel: "whatsapp", action: "WhatsApp: 'Payment failed - tap to pay now'" },
    { id: "d3", dayOffset: 3, channel: "upi-autopay", action: "Second re-presentment after payday window" },
    { id: "d4", dayOffset: 5, channel: "sms", action: "SMS with fresh payment link" },
    { id: "d5", dayOffset: 7, channel: "call", action: "Human call + pause/cancel offer" },
  ]);
  const [mrr, setMrr] = useState("999");
  const [failRate, setFailRate] = useState("8");
  const [subs, setSubs] = useState("300");

  // Per-step incremental recovery assumption (% of still-unpaid recovered at that step)
  const RECOVERY: Record<DunStep["channel"], number> = {
    "upi-autopay": 0.35, whatsapp: 0.25, sms: 0.15, email: 0.1, call: 0.4,
  };

  const sorted = [...steps].sort((a, b) => a.dayOffset - b.dayOffset);
  const monthlyMrr = parseFloat(mrr) || 0;
  const subCount = parseInt(subs) || 0;
  const failed = subCount * (parseFloat(failRate) || 0) / 100;
  const failedValue = failed * monthlyMrr;

  let remaining = failedValue;
  const ladder = sorted.map(s => {
    const rec = remaining * RECOVERY[s.channel];
    remaining -= rec;
    return { ...s, recovered: rec, remainingAfter: remaining };
  });
  const totalRecovered = failedValue - remaining;
  const recoveryPct = failedValue > 0 ? totalRecovered / failedValue * 100 : 0;

  const update = (id: string, patch: Partial<DunStep>) => setSteps(steps.map(s => s.id === id ? { ...s, ...patch } : s));
  const addStep = () => setSteps([...steps, { id: crypto.randomUUID(), dayOffset: (sorted[sorted.length - 1]?.dayOffset ?? 0) + 2, channel: "whatsapp", action: "Follow-up nudge" }]);

  const CH_LABEL: Record<DunStep["channel"], string> = { "upi-autopay": "UPI AutoPay retry", whatsapp: "WhatsApp", sms: "SMS", email: "Email", call: "Call" };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ListOrdered size={14} className="text-[var(--color-primary)]" /> Subscription Dunning Retry-Ladder</h2>
        <p className="text-xs text-[var(--color-muted)]">Design a multi-channel retry ladder for failed recurring debits and model how much MRR you'd recover. Time re-presentments around payday and escalate channels as days pass.</p>
        <div className="grid grid-cols-3 gap-3 max-w-lg">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">ARPU / MRR ₹</label>
            <input type="number" value={mrr} onChange={e => setMrr(e.target.value)} placeholder="999" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Active subs</label>
            <input type="number" value={subs} onChange={e => setSubs(e.target.value)} placeholder="300" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly fail %</label>
            <input type="number" value={failRate} onChange={e => setFailRate(e.target.value)} placeholder="8" className={INP} />
          </div>
        </div>
        <div className="space-y-2">
          {sorted.map((s, i) => (
            <div key={s.id} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-1 text-[10px] text-[var(--color-muted)] tabular-nums">#{i + 1}</span>
              <div className="col-span-2 flex items-center gap-1">
                <span className="text-[10px] text-[var(--color-muted)]">T+</span>
                <input type="number" value={s.dayOffset} onChange={e => update(s.id, { dayOffset: parseInt(e.target.value) || 0 })} className={INP} />
              </div>
              <select value={s.channel} onChange={e => update(s.id, { channel: e.target.value as DunStep["channel"] })} className={`${INP} col-span-3`}>
                <option value="upi-autopay">UPI AutoPay retry</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
              </select>
              <input value={s.action} onChange={e => update(s.id, { action: e.target.value })} className={`${INP} col-span-5`} />
              <button onClick={() => setSteps(steps.filter(x => x.id !== s.id))} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 text-sm">✕</button>
            </div>
          ))}
          <button onClick={addStep} className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline"><Plus size={12} /> Add step</button>
        </div>
      </div>

      {failedValue > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Failed debits/mo", value: String(Math.round(failed)), color: "text-orange-400" },
              { label: "At-risk MRR", value: formatAmount(Math.round(failedValue)), color: "text-red-400" },
              { label: "Recovered (modelled)", value: formatAmount(Math.round(totalRecovered)), color: "text-green-400" },
              { label: "Recovery rate", value: `${recoveryPct.toFixed(0)}%`, color: "text-blue-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-5 space-y-2`}>
            <p className="text-sm font-semibold mb-1">Ladder waterfall</p>
            {ladder.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                <span className="text-xs"><span className="text-[var(--color-muted)]">#{i + 1} · T+{s.dayOffset} · {CH_LABEL[s.channel]}</span> - {s.action}</span>
                <span className="tabular-nums text-green-400 font-semibold whitespace-nowrap">+{formatCurrency(Math.round(s.recovered))}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm pt-2 text-orange-400">
              <span className="font-semibold">Still unrecovered (churn risk)</span>
              <span className="tabular-nums font-bold">{formatCurrency(Math.round(remaining))}</span>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Recovery percentages are planning heuristics - UPI AutoPay re-presentment and a human call typically recover the most. NPCI allows limited re-presentments per mandate cycle; spacing them around the 1st/payday lifts success. Offer pause over cancel to save the relationship.</p>
    </div>
  );
}

// ── Virtual-account allocator ─────────────────────────────────────────────────────────
type VaRow = { id: string; customer: string; vpaHandle: string; ifsc: string; accountNo: string };
function VirtualAccountAllocator() {
  const { store } = useApp();
  const [rows, setRows] = useFeatureState<VaRow[]>("pay-vaccounts", []);
  const [customer, setCustomer] = useState("");
  const base = (store.firm?.name ?? "BIZ").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6) || "BIZ";
  const handle = base.toLowerCase();

  const add = () => {
    if (!customer.trim()) { toast.error("Enter a customer / cost-centre name"); return; }
    const slug = customer.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "CUST";
    const seq = (rows.length + 1).toString().padStart(4, "0");
    const accountNo = `${base}${slug}${seq}`;
    const vpaHandle = `${handle}.${customer.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "cust"}@yesbank`;
    if (rows.some(r => r.accountNo === accountNo)) { toast.error("That virtual account already exists"); return; }
    setRows([{ id: crypto.randomUUID(), customer: customer.trim(), vpaHandle, ifsc: "YESB0CMSNOC", accountNo }, ...rows]);
    setCustomer("");
    toast.success("Virtual account allocated");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Virtual-Account Allocator</h2>
        <p className="text-xs text-[var(--color-muted)]">Mint a unique virtual account number and VPA per customer so every inbound NEFT/IMPS/UPI auto-tags to the right ledger - no more guessing who paid. Share each customer their own deterministic credentials.</p>
        <div className="flex gap-2 items-end max-w-lg">
          <div className="flex-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer / cost-centre</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Acme Retail - Pune" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <Plus size={13} /> Allocate
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Numbers are derived deterministically from your firm name + customer so they're stable and collision-checked. In production these map to a real CMS virtual-account range from your bank/PG.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No virtual accounts yet. Allocate one per customer for hands-free reconciliation.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Virtual A/C", "IFSC", "Collect VPA", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{r.accountNo}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-muted)]">{r.ifsc}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{r.vpaHandle}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => copy(`A/C ${r.accountNo} · IFSC ${r.ifsc} · UPI ${r.vpaHandle}`, "Account details copied")} className="text-[10px] text-[var(--color-primary)] hover:underline mr-3">Copy</button>
                      <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                    </td>
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

// ── Payee verification log (penny-drop / VPA name check) ─────────────────────────────
type VerifyRow = { id: string; payee: string; type: "vpa" | "bank"; identifier: string; ifsc: string; nameAtBank: string; checked: string; result: "verified" | "name-mismatch" | "invalid" };
function PayeeVerifyLog() {
  const [rows, setRows] = useFeatureState<VerifyRow[]>("pay-verify", []);
  const [payee, setPayee] = useState("");
  const [type, setType] = useState<VerifyRow["type"]>("vpa");
  const [identifier, setIdentifier] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [nameAtBank, setNameAtBank] = useState("");

  const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|the|and|&|co|company)\b/g, "").replace(/[^a-z0-9]/g, "");
  const idValid = type === "vpa"
    ? /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(identifier.trim())
    : /^\d{6,18}$/.test(identifier.trim()) && /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim());

  const add = () => {
    if (!payee.trim() || !nameAtBank.trim()) { toast.error("Enter the expected payee and the name returned at the bank"); return; }
    if (!idValid) { toast.error(type === "vpa" ? "Enter a valid VPA" : "Enter a valid account number and IFSC"); return; }
    const a = norm(payee), b = norm(nameAtBank);
    const match = a === b || a.includes(b) || b.includes(a);
    const result: VerifyRow["result"] = match ? "verified" : "name-mismatch";
    setRows([{ id: crypto.randomUUID(), payee: payee.trim(), type, identifier: identifier.trim(), ifsc: ifsc.trim().toUpperCase(), nameAtBank: nameAtBank.trim(), checked: new Date().toISOString().split("T")[0], result }, ...rows]);
    setPayee(""); setIdentifier(""); setIfsc(""); setNameAtBank("");
    if (match) toast.success("Name matches - safe to pay"); else toast.error("Name mismatch - do not pay until resolved");
  };

  const verified = rows.filter(r => r.result === "verified").length;
  const flagged = rows.filter(r => r.result !== "verified").length;
  const STATUS_STYLE: Record<VerifyRow["result"], string> = {
    verified: "bg-green-900/30 text-green-400 border-green-800/40",
    "name-mismatch": "bg-orange-900/30 text-orange-400 border-orange-800/40",
    invalid: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><BadgeCheck size={14} className="text-[var(--color-primary)]" /> Payee Verification Log</h2>
        <p className="text-xs text-[var(--color-muted)]">Before a payout, confirm the beneficiary name at the bank (VPA name-check or ₹1 penny-drop) matches who you intend to pay. Log each check; we fuzzy-match the names and flag mismatches so you never disburse to the wrong account.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected payee</label>
            <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Acme Pvt Ltd" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as VerifyRow["type"])} className={INP}>
              <option value="vpa">VPA name-check</option>
              <option value="bank">Penny-drop</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{type === "vpa" ? "VPA" : "Account no."}</label>
            <input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={type === "vpa" ? "acme@okhdfcbank" : "50100123456789"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IFSC {type === "vpa" && "(n/a)"}</label>
            <input value={ifsc} onChange={e => setIfsc(e.target.value)} placeholder="HDFC0001234" className={INP} disabled={type === "vpa"} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name at bank</label>
            <input value={nameAtBank} onChange={e => setNameAtBank(e.target.value)} placeholder="ACME PRIVATE LIMITED" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <CheckCircle2 size={13} /> Check
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Verified", value: String(verified), color: "text-green-400" },
          { label: "Flagged", value: String(flagged), color: flagged ? "text-orange-400" : "text-green-400" },
          { label: "Total checks", value: String(rows.length), color: "text-[var(--color-text)]" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No verifications logged. Always confirm the beneficiary name before bulk or high-value payouts.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Expected", "Identifier", "Name at bank", "Checked", "Result", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className={`hover:bg-white/2 ${r.result !== "verified" ? "bg-orange-950/10" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{r.payee}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{r.identifier}{r.type === "bank" && r.ifsc ? ` · ${r.ifsc}` : ""}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.nameAtBank}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[11px]">{format(new Date(r.checked), "d MMM")}</td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.result]}`}>{r.result.replace("-", " ")}</span></td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Name matching here is a fuzzy check (ignores Pvt/Ltd/LLP and punctuation) - treat a mismatch as a hard stop and re-confirm with the payee. Penny-drop (a ₹1 credit) returns the registered account name; VPA name-check returns the UPI-registered name. Both prevent misdirected funds.</p>
    </div>
  );
}

// ── Instant / same-day settlement accelerator calculator ─────────────────────────────
function InstantSettleCalculator() {
  const [amount, setAmount] = useState("100000");
  const [feePct, setFeePct] = useState("0.20");
  const [daysSaved, setDaysSaved] = useState("2");
  const [borrowApr, setBorrowApr] = useState("18");

  const amt = parseFloat(amount) || 0;
  const fee = amt * (parseFloat(feePct) || 0) / 100;
  const gstOnFee = fee * 0.18;
  const totalFee = fee + gstOnFee;
  const days = parseFloat(daysSaved) || 0;
  const apr = parseFloat(borrowApr) || 0;
  // Value of having the cash early = interest you'd otherwise pay to borrow it for `days`
  const carryValue = amt * apr / 100 * days / 365;
  const net = carryValue - totalFee;
  const worthIt = net >= 0;
  // breakeven APR where carry value == fee
  const breakevenApr = days > 0 && amt > 0 ? totalFee / (amt * days / 365) * 100 : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Zap size={14} className="text-[var(--color-primary)]" /> Instant-Settlement Accelerator</h2>
        <p className="text-xs text-[var(--color-muted)]">Most gateways settle T+1/T+2. Paying a small fee for instant / same-day settlement only pays off if the cost of money you'd otherwise borrow exceeds the fee. This tells you whether to opt in.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Settlement amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Instant-settle fee %</label>
            <input type="number" step="0.01" value={feePct} onChange={e => setFeePct(e.target.value)} placeholder="0.20" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Days brought forward</label>
            <input type="number" value={daysSaved} onChange={e => setDaysSaved(e.target.value)} placeholder="2" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your borrowing APR %</label>
            <input type="number" value={borrowApr} onChange={e => setBorrowApr(e.target.value)} placeholder="18" className={INP} />
          </div>
        </div>
      </div>

      {amt > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Instant-settle fee", value: formatCurrency(Math.round(totalFee)), color: "text-orange-400", sub: "incl. 18% GST" },
              { label: "Value of early cash", value: formatCurrency(Math.round(carryValue)), color: "text-blue-400", sub: `${days}d @ ${apr}% APR` },
              { label: "Net benefit", value: formatCurrency(Math.round(net)), color: worthIt ? "text-green-400" : "text-red-400", sub: worthIt ? "opt in" : "not worth it" },
              { label: "Breakeven APR", value: `${breakevenApr.toFixed(1)}%`, color: "text-[var(--color-text)]", sub: "fee pays off above this" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${worthIt ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
            <p className={`text-sm font-bold flex items-center gap-2 ${worthIt ? "text-green-400" : "text-orange-400"}`}>
              {worthIt ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {worthIt
                ? `Opt in - bringing ${formatCurrency(amt)} forward ${days} day(s) is worth ${formatCurrency(Math.round(carryValue))}, more than the ${formatCurrency(Math.round(totalFee))} fee.`
                : `Skip it - the ${formatCurrency(Math.round(totalFee))} fee exceeds the ${formatCurrency(Math.round(carryValue))} value of the cash arriving ${days} day(s) early. Only worthwhile if your effective cost of capital is above ${breakevenApr.toFixed(1)}%.`}
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Decision rule: opt into instant settlement when your true cost of working capital (overdraft/CC APR, or the discount you'd give to get paid early) exceeds the breakeven APR shown. For idle cash with no borrowing need, the standard T+1 cycle is cheaper.</p>
    </div>
  );
}

// ── Duplicate-payment guard ──────────────────────────────────────────────────────────
type PayEntry = { id: string; ref: string; customer: string; amount: number; date: string };
function DuplicateGuard() {
  const [entries, setEntries] = useFeatureState<PayEntry[]>("pay-dupe-entries", []);
  const [ref, setRef] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [windowDays, setWindowDays] = useState("3");

  const add = () => {
    const a = parseFloat(amount);
    if (!customer.trim() || isNaN(a) || a <= 0) { toast.error("Enter customer and a valid amount"); return; }
    setEntries([{ id: crypto.randomUUID(), ref: ref.trim(), customer: customer.trim(), amount: a, date }, ...entries]);
    setRef(""); setCustomer(""); setAmount("");
    toast.success("Payment recorded");
  };

  const win = parseInt(windowDays) || 0;
  // Group potential duplicates: same customer + same amount within window, or same non-empty ref.
  const flagged = useMemo(() => {
    const dupIds = new Set<string>();
    const groups: PayEntry[][] = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        const sameRef = a.ref !== "" && a.ref.toLowerCase() === b.ref.toLowerCase();
        const sameAmtCust = a.customer.toLowerCase() === b.customer.toLowerCase()
          && Math.abs(a.amount - b.amount) < 1
          && Math.abs(differenceInCalendarDays(new Date(a.date), new Date(b.date))) <= win;
        if (sameRef || sameAmtCust) { dupIds.add(a.id); dupIds.add(b.id); }
      }
    }
    // build display groups keyed by customer+amount (and ref)
    const map = new Map<string, PayEntry[]>();
    entries.filter(e => dupIds.has(e.id)).forEach(e => {
      const key = e.ref ? `ref:${e.ref.toLowerCase()}` : `${e.customer.toLowerCase()}|${e.amount}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    map.forEach(g => { if (g.length > 1) groups.push(g); });
    return { dupIds, groups };
  }, [entries, win]);

  const dupValue = entries.filter(e => flagged.dupIds.has(e.id)).reduce((s, e) => s + e.amount, 0);
  // exposure = value of the *extra* (duplicate) payments beyond the first in each group
  const exposure = flagged.groups.reduce((s, g) => s + g.slice(1).reduce((x, e) => x + e.amount, 0), 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CopyCheck size={14} className="text-[var(--color-primary)]" /> Duplicate-Payment Guard</h2>
        <p className="text-xs text-[var(--color-muted)]">Paste or add payments and we flag likely double-charges - same reference, or same customer + same amount within a tolerance window - so you can refund the extra before it becomes a complaint or chargeback.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Ravi Kumar" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="2500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Order / ref</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="INV-1042" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Window (days)</label>
            <input type="number" value={windowDays} onChange={e => setWindowDays(e.target.value)} placeholder="3" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Payments tracked", value: String(entries.length), color: "text-[var(--color-text)]" },
          { label: "Suspected dupes", value: String(flagged.dupIds.size), color: flagged.dupIds.size ? "text-orange-400" : "text-green-400" },
          { label: "Duplicate exposure", value: formatAmount(Math.round(exposure)), color: exposure ? "text-red-400" : "text-green-400" },
          { label: "Flagged value", value: formatAmount(Math.round(dupValue)), color: "text-yellow-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {flagged.groups.length > 0 && (
        <div className="space-y-3">
          {flagged.groups.map((g, gi) => (
            <div key={gi} className={`${CARD} p-4 border-orange-800/40`}>
              <p className="text-xs font-semibold text-orange-400 flex items-center gap-1.5 mb-2"><AlertTriangle size={12} /> Possible duplicate - {g.length} payments of {formatCurrency(g[0].amount)} {g[0].ref ? `· ref ${g[0].ref}` : `to ${g[0].customer}`}</p>
              <div className="space-y-1">
                {g.map((e, ei) => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-muted)]">{ei === 0 ? "Original" : `Duplicate #${ei}`} · {e.customer} · {format(new Date(e.date), "d MMM")} {e.ref && `· ${e.ref}`}</span>
                    <span className="tabular-nums font-medium">{formatCurrency(e.amount)}{ei > 0 && <span className="ml-2 text-red-400">refund</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add payments to scan for double-charges. Tip: import a day's settlement and let the guard flag repeats.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Amount", "Ref", "Date", "Flag", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {entries.map(e => (
                  <tr key={e.id} className={`hover:bg-white/2 ${flagged.dupIds.has(e.id) ? "bg-orange-950/10" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{e.customer}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{e.ref || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[11px]">{format(new Date(e.date), "d MMM")}</td>
                    <td className="px-4 py-2.5">{flagged.dupIds.has(e.id) ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-orange-800/40 bg-orange-900/30 text-orange-400">dupe?</span> : <span className="text-[10px] text-green-400">ok</span>}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setEntries(entries.filter(x => x.id !== e.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Heuristic match: identical non-empty reference, or same customer + same amount within the tolerance window. Genuine repeat purchases can trip this - review each group before refunding. Refund the extra charge to the original instrument and issue a GST credit note if the sale was taxed.</p>
    </div>
  );
}

// ── Fee-by-volume tier modeler ───────────────────────────────────────────────────────
type FeeTier = { id: string; upto: number; ratePct: number };
function FeeTierModeler() {
  const [tiers, setTiers] = useFeatureState<FeeTier[]>("pay-feetiers", []);
  const [upto, setUpto] = useState("");
  const [rate, setRate] = useState("");
  const [volume, setVolume] = useState("");

  const sorted = useMemo(() => [...tiers].sort((a, b) => a.upto - b.upto), [tiers]);

  const add = () => {
    const u = Number(upto), r = Number(rate);
    if (!Number.isFinite(u) || u <= 0) { toast.error("Enter a positive monthly-volume ceiling"); return; }
    if (!Number.isFinite(r) || r < 0 || r > 5) { toast.error("Enter a rate between 0 and 5%"); return; }
    if (tiers.some(t => t.upto === u)) { toast.error("A tier with that ceiling already exists"); return; }
    setTiers([...tiers, { id: crypto.randomUUID(), upto: u, ratePct: r }]);
    setUpto(""); setRate("");
    toast.success("Tier added");
  };

  const vol = Number(volume) || 0;
  const calc = useMemo(() => {
    if (vol <= 0 || sorted.length === 0) return null;
    let remaining = vol, fee = 0, prevCeil = 0;
    const breakdown: { band: string; amount: number; ratePct: number; fee: number }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const bandTop = t.upto;
      const slab = Math.max(0, Math.min(remaining, bandTop - prevCeil));
      if (slab > 0) {
        const f = slab * t.ratePct / 100;
        breakdown.push({ band: `${formatCurrency(prevCeil)} - ${formatCurrency(bandTop)}`, amount: slab, ratePct: t.ratePct, fee: f });
        fee += f; remaining -= slab;
      }
      prevCeil = bandTop;
      if (remaining <= 0) break;
    }
    if (remaining > 0) {
      const topRate = sorted[sorted.length - 1].ratePct;
      const f = remaining * topRate / 100;
      breakdown.push({ band: `above ${formatCurrency(prevCeil)}`, amount: remaining, ratePct: topRate, fee: f });
      fee += f;
    }
    const blended = vol > 0 ? fee / vol * 100 : 0;
    return { fee, blended, breakdown };
  }, [vol, sorted]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Fee-by-Volume Tier Modeler</h2>
        <p className="text-xs text-[var(--color-muted)]">Build the slab-rate card your gateway offers as you scale, then drop in an expected monthly volume to see the marginal cost per band and your true blended MDR. Use it to negotiate the next tier before you cross it.</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-40">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Volume up to (₹/mo)</label>
            <input value={upto} onChange={e => setUpto(e.target.value)} inputMode="numeric" placeholder="1000000" className={INP} />
          </div>
          <div className="w-32">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate %</label>
            <input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="1.8" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <Plus size={13} /> Add tier
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No tiers yet. Add your gateway's slab card - e.g. 2.0% up to ₹5L, 1.8% up to ₹20L, 1.5% above.</p>
      ) : (
        <div className={`${CARD} p-5 space-y-4`}>
          <div className="flex flex-wrap gap-2">
            {sorted.map(t => (
              <span key={t.id} className="flex items-center gap-2 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-full px-3 py-1.5">
                <span className="font-medium">≤ {formatCurrency(t.upto)}</span>
                <span className="text-[var(--color-primary)] tabular-nums">{t.ratePct}%</span>
                <button onClick={() => setTiers(tiers.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={11} /></button>
              </span>
            ))}
          </div>
          <div className="max-w-xs">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected monthly volume (₹)</label>
            <input value={volume} onChange={e => setVolume(e.target.value)} inputMode="numeric" placeholder="3500000" className={INP} />
          </div>
          {calc && (
            <div className="space-y-2">
              {calc.breakdown.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-[var(--color-muted)]">{b.band} <span className="text-[10px]">@ {b.ratePct}%</span></span>
                  <span className="tabular-nums">{formatCurrency(Math.round(b.amount))} → <span className="text-[var(--color-text)] font-medium">{formatCurrency(Math.round(b.fee))}</span></span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-1">
                <span className="font-semibold">Total fee / blended MDR</span>
                <span className="tabular-nums font-bold text-[var(--color-primary)]">{formatCurrency(Math.round(calc.fee))} · {calc.blended.toFixed(2)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Marginal pricing: each slab is charged only on the volume that falls inside it, so your blended rate is always below the top-band rate. GST (18%) applies on the fee, not the transaction. Add a buffer tier above your forecast so a good month doesn't surprise you.</p>
    </div>
  );
}

// ── Partial-payment allocation ───────────────────────────────────────────────────────
type AllocInvoice = { id: string; number: string; due: number };
function PaymentAllocator() {
  const [invoices, setInvoices] = useFeatureState<AllocInvoice[]>("pay-alloc-invoices", []);
  const [number, setNumber] = useState("");
  const [due, setDue] = useState("");
  const [received, setReceived] = useState("");
  const [mode, setMode] = useState<"oldest" | "prorata">("oldest");

  const add = () => {
    const d = Number(due);
    if (!number.trim()) { toast.error("Enter an invoice number"); return; }
    if (!Number.isFinite(d) || d <= 0) { toast.error("Enter a positive outstanding amount"); return; }
    if (invoices.some(i => i.number.toLowerCase() === number.trim().toLowerCase())) { toast.error("That invoice is already listed"); return; }
    setInvoices([...invoices, { id: crypto.randomUUID(), number: number.trim(), due: d }]);
    setNumber(""); setDue("");
  };

  const totalDue = invoices.reduce((s, i) => s + i.due, 0);
  const recv = Number(received) || 0;
  const alloc = useMemo(() => {
    if (recv <= 0 || invoices.length === 0) return null;
    const rows = invoices.map(i => ({ ...i, applied: 0 }));
    let pool = recv;
    if (mode === "oldest") {
      for (const r of rows) {
        const a = Math.min(pool, r.due);
        r.applied = a; pool -= a;
        if (pool <= 0) break;
      }
    } else {
      for (const r of rows) {
        const share = totalDue > 0 ? Math.min(r.due, recv * r.due / totalDue) : 0;
        r.applied = Math.round(share);
      }
      pool = recv - rows.reduce((s, r) => s + r.applied, 0);
    }
    const advance = Math.max(0, pool);
    return { rows, advance };
  }, [recv, invoices, mode, totalDue]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ArrowDownUp size={14} className="text-[var(--color-primary)]" /> Partial-Payment Allocation</h2>
        <p className="text-xs text-[var(--color-muted)]">A customer paid a lump sum that doesn't match any one invoice. List the open invoices, enter what landed, and decide whether to clear oldest-first or split pro-rata - then post clean part-payments to each bill.</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-40">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice #</label>
            <input value={number} onChange={e => setNumber(e.target.value)} placeholder="INV-1042" className={INP} />
          </div>
          <div className="w-40">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Outstanding (₹)</label>
            <input value={due} onChange={e => setDue(e.target.value)} inputMode="numeric" placeholder="48000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <Plus size={13} /> Add invoice
          </button>
        </div>
      </div>

      {invoices.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No open invoices listed. Add the bills this customer still owes against, in age order.</p>
      ) : (
        <div className={`${CARD} p-5 space-y-4`}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-44">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Amount received (₹)</label>
              <input value={received} onChange={e => setReceived(e.target.value)} inputMode="numeric" placeholder="60000" className={INP} />
            </div>
            <div className="w-40">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Allocation rule</label>
              <select value={mode} onChange={e => setMode(e.target.value as typeof mode)} className={INP}>
                <option value="oldest">Oldest first</option>
                <option value="prorata">Pro-rata</option>
              </select>
            </div>
            <span className="text-xs text-[var(--color-muted)]">Total due: <span className="tabular-nums text-[var(--color-text)]">{formatCurrency(totalDue)}</span></span>
          </div>
          <div className="space-y-2">
            {(alloc ? alloc.rows : invoices.map(i => ({ ...i, applied: 0 }))).map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-1.5">
                <span className="font-medium flex items-center gap-2">
                  {r.number}
                  <button onClick={() => setInvoices(invoices.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={11} /></button>
                </span>
                <span className="tabular-nums text-[var(--color-muted)]">
                  applied <span className="text-green-400 font-medium">{formatCurrency(Math.round(r.applied))}</span> · bal {formatCurrency(Math.round(r.due - r.applied))}
                </span>
              </div>
            ))}
            {alloc && alloc.advance > 0 && (
              <div className="flex items-center justify-between text-sm pt-1 text-[var(--color-primary)]">
                <span className="font-semibold">Unapplied (post as advance)</span>
                <span className="tabular-nums font-bold">{formatCurrency(Math.round(alloc.advance))}</span>
              </div>
            )}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Oldest-first protects your ageing buckets and is the safer default for receivables; pro-rata keeps every invoice proportionally alive when a customer disputes specific bills. Any surplus should be parked as a customer advance, not force-fit onto a bill.</p>
    </div>
  );
}

// ── Rolling-reserve tracker ──────────────────────────────────────────────────────────
type ReserveRow = { id: string; month: string; gross: number; reservePct: number; releaseMonth: string };
function RollingReserveTracker() {
  const [rows, setRows] = useFeatureState<ReserveRow[]>("pay-reserves", []);
  const [gross, setGross] = useState("");
  const [pct, setPct] = useState("5");
  const [holdMonths, setHoldMonths] = useState("6");
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));

  const add = () => {
    const g = Number(gross), p = Number(pct), h = Number(holdMonths);
    if (!Number.isFinite(g) || g <= 0) { toast.error("Enter the month's gross processed volume"); return; }
    if (!Number.isFinite(p) || p < 0 || p > 100) { toast.error("Reserve % must be 0-100"); return; }
    if (!Number.isFinite(h) || h < 1) { toast.error("Hold period must be at least 1 month"); return; }
    if (rows.some(r => r.month === month)) { toast.error("That month is already tracked"); return; }
    const release = format(addMonths(new Date(month + "-01"), h), "yyyy-MM");
    setRows([{ id: crypto.randomUUID(), month, gross: g, reservePct: p, releaseMonth: release }, ...rows]);
    setGross("");
    toast.success("Reserve recorded");
  };

  const today = format(new Date(), "yyyy-MM");
  const held = useMemo(() => rows.map(r => ({ ...r, amount: r.gross * r.reservePct / 100, released: r.releaseMonth <= today })), [rows, today]);
  const lockedUp = held.filter(r => !r.released).reduce((s, r) => s + r.amount, 0);
  const dueThisMonth = held.filter(r => r.releaseMonth === today).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Rolling-Reserve Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">High-risk merchants and new accounts often have a slice of every settlement withheld as a rolling reserve, released months later. Log each month's hold so you can forecast the cash that frees up - and chase releases the gateway forgets.</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-36">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={INP} />
          </div>
          <div className="w-40">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross processed (₹)</label>
            <input value={gross} onChange={e => setGross(e.target.value)} inputMode="numeric" placeholder="2400000" className={INP} />
          </div>
          <div className="w-24">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reserve %</label>
            <input value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal" className={INP} />
          </div>
          <div className="w-28">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Hold (months)</label>
            <input value={holdMonths} onChange={e => setHoldMonths(e.target.value)} inputMode="numeric" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <Plus size={13} /> Record
          </button>
        </div>
      </div>

      {held.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No reserves tracked yet. Add a month and its hold % to start forecasting locked-up cash.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[["Currently locked up", lockedUp, "text-orange-400"], ["Releasing this month", dueThisMonth, "text-green-400"], ["Months tracked", held.length, ""]].map(([label, val, cls]) => (
              <div key={String(label)} className={`${CARD} p-4`}>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
                <p className={`text-lg font-bold tabular-nums mt-0.5 ${cls as string}`}>{label === "Months tracked" ? formatAmount(Number(val)) : formatCurrency(Math.round(Number(val)))}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Month", "Gross", "Reserve %", "Held", "Releases", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {held.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{format(new Date(r.month + "-01"), "MMM yyyy")}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.gross)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.reservePct}%</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium">{formatCurrency(Math.round(r.amount))}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[11px]">{format(new Date(r.releaseMonth + "-01"), "MMM yyyy")}</td>
                      <td className="px-4 py-2.5">{r.released
                        ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-green-800/40 bg-green-900/30 text-green-400">released</span>
                        : <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-orange-800/40 bg-orange-900/30 text-orange-400">held</span>}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Reserves are your money sitting in the gateway's escrow - treat them as a receivable, not an expense. A clean chargeback history is your strongest lever to get the % cut or the hold period shortened at renewal.</p>
    </div>
  );
}

// ── Payment-method downtime log ──────────────────────────────────────────────────────
type DowntimeRow = { id: string; method: string; start: string; minutes: number; failedTxns: number; lostValue: number };
function MethodDowntimeLog() {
  const [rows, setRows] = useFeatureState<DowntimeRow[]>("pay-downtime", []);
  const [method, setMethod] = useState("UPI");
  const [start, setStart] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [minutes, setMinutes] = useState("");
  const [failed, setFailed] = useState("");
  const [lost, setLost] = useState("");

  const add = () => {
    const m = Number(minutes), f = Number(failed), l = Number(lost);
    if (!method.trim()) { toast.error("Pick a payment method"); return; }
    if (!Number.isFinite(m) || m <= 0) { toast.error("Enter outage duration in minutes"); return; }
    setRows([{ id: crypto.randomUUID(), method: method.trim(), start, minutes: m, failedTxns: Number.isFinite(f) ? f : 0, lostValue: Number.isFinite(l) ? l : 0 }, ...rows]);
    setMinutes(""); setFailed(""); setLost("");
    toast.success("Outage logged");
  };

  const totalMin = rows.reduce((s, r) => s + r.minutes, 0);
  const totalLost = rows.reduce((s, r) => s + r.lostValue, 0);
  const worst = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.method, (map.get(r.method) ?? 0) + r.minutes);
    let name = "-", mins = 0;
    for (const [k, v] of map) if (v > mins) { name = k; mins = v; }
    return { name, mins };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PlugZap size={14} className="text-[var(--color-primary)]" /> Payment-Method Downtime Log</h2>
        <p className="text-xs text-[var(--color-muted)]">When a bank handle or card network goes dark, your checkout silently bleeds. Log each outage with the value lost so you can hold the gateway to its SLA, justify a multi-PG fallback, and spot the flaky issuer to deprioritise at routing.</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-36">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={INP}>
              {["UPI", "Cards", "Netbanking", "Wallet", "EMI"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="w-48">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Started</label>
            <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className={INP} />
          </div>
          <div className="w-28">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Minutes</label>
            <input value={minutes} onChange={e => setMinutes(e.target.value)} inputMode="numeric" placeholder="45" className={INP} />
          </div>
          <div className="w-28">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Failed txns</label>
            <input value={failed} onChange={e => setFailed(e.target.value)} inputMode="numeric" placeholder="120" className={INP} />
          </div>
          <div className="w-32">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value lost (₹)</label>
            <input value={lost} onChange={e => setLost(e.target.value)} inputMode="numeric" placeholder="85000" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
            <Plus size={13} /> Log
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No outages logged. Capture each one as it happens - exact start time and lost value are your strongest SLA evidence.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[["Total downtime", `${totalMin} min`], ["Value lost", formatCurrency(Math.round(totalLost))], ["Flakiest method", `${worst.name} · ${worst.mins}m`]].map(([label, val]) => (
              <div key={label} className={`${CARD} p-4`}>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
                <p className="text-lg font-bold tabular-nums mt-0.5">{val}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Method", "Started", "Duration", "Failed", "Lost", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.method}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[11px]">{format(new Date(r.start), "d MMM HH:mm")}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.minutes} min</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.failedTxns || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.lostValue ? formatCurrency(r.lostValue) : "-"}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">RBI's framework expects gateways to publish uptime; your own log is what turns a vague "it was down" into a credit claim. Route around a method that repeatedly fails at peak hours and keep a second PG warm as automatic fallback.</p>
    </div>
  );
}

// ── Mandate retry planner ───────────────────────────────────────────────────────────
function MandateRetryPlanner() {
  const [amount, setAmount] = useState("");
  const [failDate, setFailDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payday, setPayday] = useState("1");

  const amt = parseFloat(amount) || 0;
  const base = useMemo(() => new Date(failDate), [failDate]);
  const paydayN = Math.min(28, Math.max(1, parseInt(payday) || 1));

  // RBI/NPCI allow limited re-presentments; schedule them around the next payday.
  const nextPayday = useMemo(() => {
    const d = new Date(base);
    d.setDate(paydayN);
    if (d <= base) d.setMonth(d.getMonth() + 1);
    return d;
  }, [base, paydayN]);

  const attempts = useMemo(() => {
    const list: { label: string; date: Date; rationale: string }[] = [
      { label: "Retry 1 - T+1", date: new Date(base.getTime() + 1 * 864e5), rationale: "Catch a same-cycle top-up before the balance moves again" },
      { label: "Retry 2 - payday +1", date: new Date(nextPayday.getTime() + 1 * 864e5), rationale: "Salary has landed - highest success window" },
      { label: "Retry 3 - payday +3", date: new Date(nextPayday.getTime() + 3 * 864e5), rationale: "Final attempt before flagging for manual collection" },
    ];
    return list;
  }, [base, nextPayday]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><RefreshCw size={14} className="text-[var(--color-primary)]" /> Mandate Retry Planner</h2>
        <p className="text-xs text-[var(--color-muted)]">A failed AutoPay debit is usually just an empty balance, not a lost customer. This schedules re-presentments around the payer's next payday - when money is most likely to be there.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Debit amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="2999" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Failed on</label>
            <input type="date" value={failDate} onChange={e => setFailDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payer's payday (day of month)</label>
            <input type="number" min={1} max={28} value={payday} onChange={e => setPayday(e.target.value)} placeholder="1" className={INP} />
          </div>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Attempt", "Date", "Why then", "Amount"].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {attempts.map(a => (
                <tr key={a.label} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{a.label}</td>
                  <td className="px-4 py-2.5 tabular-nums">{format(a.date, "EEE d MMM")}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)] text-[11px]">{a.rationale}</td>
                  <td className="px-4 py-2.5 tabular-nums">{amt > 0 ? formatCurrency(amt) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button onClick={() => copy(attempts.map(a => `${a.label}: ${format(a.date, "d MMM yyyy")}`).join("\n"), "Retry schedule copied")}
        className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium">
        <Copy size={12} /> Copy schedule
      </button>
      <p className="text-[10px] text-[var(--color-muted)]">UPI AutoPay and e-NACH cap the number of re-presentments per mandate cycle - don't burn all attempts on day one. A 24h pre-debit notification is still required before each retry; pair this with the Dunning Ladder for the messaging.</p>
    </div>
  );
}

// ── Decline-reason decoder ──────────────────────────────────────────────────────────
function DeclineDecoder() {
  const [q, setQ] = useState("");
  const CODES: { code: string; aliases: string[]; meaning: string; fix: string; retry: "yes" | "no" | "later" }[] = [
    { code: "INSUFFICIENT_FUNDS", aliases: ["51", "u30", "low balance"], meaning: "Payer's account/card didn't have enough balance.", fix: "Ask the customer to top up, then retry - or schedule around their payday.", retry: "later" },
    { code: "DO_NOT_HONOUR", aliases: ["05", "decline"], meaning: "Issuing bank declined without a specific reason - often a soft risk block.", fix: "Retry once; if it repeats, ask the customer to contact their bank or use another method.", retry: "yes" },
    { code: "EXPIRED_CARD", aliases: ["54"], meaning: "The card on file has expired.", fix: "Collect a fresh card or switch the customer to UPI AutoPay.", retry: "no" },
    { code: "AUTH_TIMEOUT", aliases: ["91", "u69", "no response"], meaning: "The bank or UPI app didn't respond in time.", fix: "Safe to retry immediately - this is usually transient.", retry: "yes" },
    { code: "LIMIT_EXCEEDED", aliases: ["61", "u16"], meaning: "Transaction exceeds the per-txn or daily limit on the instrument.", fix: "Split into smaller amounts or ask the customer to raise their limit.", retry: "later" },
    { code: "MANDATE_NOT_FOUND", aliases: ["um", "revoked"], meaning: "The AutoPay mandate is paused, revoked or never activated.", fix: "Re-create the mandate; don't keep retrying against a dead one.", retry: "no" },
    { code: "RISK_DECLINED", aliases: ["59", "fraud", "u67"], meaning: "Flagged by the bank or gateway risk engine.", fix: "Don't hammer retries - ask the customer to authenticate via their bank app first.", retry: "no" },
  ];
  const norm = q.trim().toLowerCase();
  const matches = norm === "" ? CODES : CODES.filter(c =>
    c.code.toLowerCase().includes(norm) || c.meaning.toLowerCase().includes(norm) || c.aliases.some(a => a.includes(norm)));
  const RETRY_STYLE = { yes: "text-green-400", no: "text-red-400", later: "text-yellow-400" } as const;
  const RETRY_LABEL = { yes: "Retry now", no: "Don't retry", later: "Retry later" } as const;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><HelpCircle size={14} className="text-[var(--color-primary)]" /> Decline-Reason Decoder</h2>
        <p className="text-xs text-[var(--color-muted)]">Acquirer error codes are cryptic - "05" or "U69" means nothing to counter staff. Search the code or symptom to get a plain-language meaning, the fix, and whether it's safe to retry.</p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type a code (51, U30) or a symptom (low balance, expired)…" className={INP} />
      </div>

      {matches.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No match. Try the raw acquirer code, or a keyword like "balance", "expired" or "limit".</p>
      ) : (
        <div className="space-y-2">
          {matches.map(c => (
            <div key={c.code} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-mono text-xs font-semibold text-[var(--color-primary)]">{c.code}</span>
                <span className={`text-[11px] font-semibold ${RETRY_STYLE[c.retry]}`}>{RETRY_LABEL[c.retry]}</span>
              </div>
              <p className="text-sm mt-1">{c.meaning}</p>
              <p className="text-xs text-[var(--color-muted)] mt-1"><span className="text-[var(--color-text)] font-medium">Fix:</span> {c.fix}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">Also shown as: {c.aliases.join(", ")}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Codes vary slightly by acquirer - these are the common mappings across major Indian gateways. When in doubt, the gateway's settlement report carries the canonical reason; never retry a hard decline (expired/revoked/risk) more than once.</p>
    </div>
  );
}

// ── Settlement-TDS tagger ───────────────────────────────────────────────────────────
type TdsRow = { id: string; date: string; source: string; gross: number; tdsPct: number };
function SettlementTdsTagger() {
  const [rows, setRows] = useFeatureState<TdsRow[]>("pay-tds", []);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [source, setSource] = useState("");
  const [gross, setGross] = useState("");
  const [tdsPct, setTdsPct] = useState("1");

  const add = () => {
    const g = parseFloat(gross), t = parseFloat(tdsPct);
    if (!source.trim() || isNaN(g) || g <= 0) { toast.error("Enter the source and gross settled amount"); return; }
    setRows([{ id: crypto.randomUUID(), date, source: source.trim(), gross: g, tdsPct: isNaN(t) ? 0 : t }, ...rows]);
    setSource(""); setGross("");
    toast.success("TDS entry tagged");
  };

  const evaluated = rows.map(r => ({ ...r, tds: r.gross * r.tdsPct / 100 }));
  const totalGross = evaluated.reduce((s, r) => s + r.gross, 0);
  const totalTds = evaluated.reduce((s, r) => s + r.tds, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ReceiptText size={14} className="text-[var(--color-primary)]" /> Settlement-TDS Tagger</h2>
        <p className="text-xs text-[var(--color-muted)]">Marketplaces (194-O) and some gateways deduct TDS before they pay you out. That TDS is your credit - tag it here so it shows up in your 26AS reconciliation and isn't written off as a fee.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Settlement date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Source</label>
            <input value={source} onChange={e => setSource(e.target.value)} placeholder="Amazon / Razorpay" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross settled ₹</label>
            <input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="200000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">TDS %</label>
            <input type="number" step="0.1" value={tdsPct} onChange={e => setTdsPct(e.target.value)} placeholder="1" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Tag
          </button>
        </div>
      </div>

      {evaluated.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Gross settled", value: formatAmount(Math.round(totalGross)), color: "text-[var(--color-text)]" },
            { label: "TDS deducted", value: formatCurrency(Math.round(totalTds)), color: "text-orange-400" },
            { label: "Claimable credit", value: formatCurrency(Math.round(totalTds)), color: "text-green-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No TDS tagged yet. Pull the TDS line from each marketplace/gateway settlement report and log it so it reconciles to Form 26AS.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Date", "Source", "Gross", "TDS %", "TDS amount", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...evaluated].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums">{format(new Date(r.date), "d MMM")}</td>
                    <td className="px-4 py-2.5 font-medium">{r.source}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(r.gross)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.tdsPct}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(r.tds))}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Section 194-O TDS on e-commerce is typically 0.1-1%. The deductor must file it against your PAN for the credit to appear in 26AS/AIS - chase a missing entry with the marketplace before you file your return.</p>
    </div>
  );
}

// ── Pre-authorization hold tracker ──────────────────────────────────────────────────
type HoldRow = { id: string; customer: string; held: number; placed: string; expiryDays: number; status: "held" | "captured" | "released" };
function PreAuthHoldTracker() {
  const [rows, setRows] = useFeatureState<HoldRow[]>("pay-preauth", []);
  const [customer, setCustomer] = useState("");
  const [held, setHeld] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");

  const add = () => {
    const h = parseFloat(held), e = parseInt(expiryDays);
    if (!customer.trim() || isNaN(h) || h <= 0) { toast.error("Enter customer and the amount to block"); return; }
    setRows([{ id: crypto.randomUUID(), customer: customer.trim(), held: h, placed: new Date().toISOString().split("T")[0], expiryDays: isNaN(e) ? 7 : e, status: "held" }, ...rows]);
    setCustomer(""); setHeld("");
    toast.success("Hold logged");
  };
  const setStatus = (id: string, status: HoldRow["status"]) =>
    setRows(rows.map(r => r.id === id ? { ...r, status } : r));

  const active = rows.filter(r => r.status === "held");
  const blockedValue = active.reduce((s, r) => s + r.held, 0);
  const today = new Date();
  const STATUS_STYLE: Record<HoldRow["status"], string> = {
    held: "bg-blue-900/30 text-blue-400 border-blue-800/40",
    captured: "bg-green-900/30 text-green-400 border-green-800/40",
    released: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Lock size={14} className="text-[var(--color-primary)]" /> Pre-Authorization Hold Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">For rentals, hospitality or bookings: block funds at reservation, capture on fulfilment, release if cancelled. Track every hold so an auth never silently expires and costs you the sale.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Room 204 - Mehta" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount blocked ₹</label>
            <input type="number" value={held} onChange={e => setHeld(e.target.value)} placeholder="15000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Auth valid (days)</label>
            <input type="number" min={1} value={expiryDays} onChange={e => setExpiryDays(e.target.value)} placeholder="7" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Hold
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active holds", value: String(active.length), color: "text-blue-400" },
            { label: "Funds blocked", value: formatAmount(Math.round(blockedValue)), color: "text-yellow-400" },
            { label: "Total tracked", value: String(rows.length), color: "text-[var(--color-text)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No holds tracked. Log each pre-auth at booking so you can capture or release it before the authorization lapses.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Blocked", "Placed", "Auth expires", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const expiry = new Date(new Date(r.placed).getTime() + r.expiryDays * 864e5);
                  const daysLeft = differenceInCalendarDays(expiry, today);
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.held)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[11px]">{format(new Date(r.placed), "d MMM")}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[11px]">
                        {format(expiry, "d MMM")}
                        {r.status === "held" && <span className={`ml-2 text-[10px] ${daysLeft <= 1 ? "text-red-400" : daysLeft <= 3 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{daysLeft < 0 ? "lapsed" : `${daysLeft}d`}</span>}
                      </td>
                      <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {r.status === "held" && (
                          <>
                            <button onClick={() => setStatus(r.id, "captured")} className="text-[10px] text-green-400 hover:underline mr-2">Capture</button>
                            <button onClick={() => setStatus(r.id, "released")} className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)] mr-2">Release</button>
                          </>
                        )}
                        <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Card pre-auths typically lapse in 5-7 days (longer for hotels); after that you must re-auth, which can fail. Capture only the amount actually consumed - over-capturing beyond the held value usually needs a fresh authorization.</p>
    </div>
  );
}

// ── COD → prepaid conversion saver ──────────────────────────────────────────────────
function CodToPrepaidSaver() {
  const [orders, setOrders] = useState("");
  const [aov, setAov] = useState("");
  const [rtoPct, setRtoPct] = useState("25");
  const [shipCost, setShipCost] = useState("120");
  const [codFee, setCodFee] = useState("40");
  const [convertPct, setConvertPct] = useState("30");

  const n = parseFloat(orders) || 0;
  const a = parseFloat(aov) || 0;
  const rto = (parseFloat(rtoPct) || 0) / 100;
  const fwdBack = (parseFloat(shipCost) || 0) * 2; // forward + return leg on an RTO
  const cod = parseFloat(codFee) || 0;
  const conv = (parseFloat(convertPct) || 0) / 100;

  // Cost of COD as-is: RTO orders eat two-way shipping + the per-order COD handling fee.
  const codOrders = n;
  const rtoOrders = codOrders * rto;
  const currentRtoCost = rtoOrders * fwdBack;
  const currentCodFees = codOrders * cod;
  const currentBleed = currentRtoCost + currentCodFees;

  // After nudging a share to prepaid: those orders carry zero RTO risk and no COD fee.
  const converted = codOrders * conv;
  const savedRto = converted * rto * fwdBack;
  const savedFees = converted * cod;
  const totalSaved = savedRto + savedFees;
  const blockedRevenueFreed = converted * rto * a; // revenue no longer lost to prepaid-order RTO

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PackageCheck size={14} className="text-[var(--color-primary)]" /> COD → Prepaid Conversion Saver</h2>
        <p className="text-xs text-[var(--color-muted)]">Cash-on-delivery quietly bleeds money through returns (RTO) and per-order handling fees. See what a pre-shipment UPI nudge saves when you convert a share of COD orders to prepaid.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">COD orders / month</label>
            <input type="number" value={orders} onChange={e => setOrders(e.target.value)} placeholder="500" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Avg order value ₹</label>
            <input type="number" value={aov} onChange={e => setAov(e.target.value)} placeholder="800" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">RTO / return rate %</label>
            <input type="number" value={rtoPct} onChange={e => setRtoPct(e.target.value)} placeholder="25" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Shipping leg ₹ (one way)</label>
            <input type="number" value={shipCost} onChange={e => setShipCost(e.target.value)} placeholder="120" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">COD handling fee ₹</label>
            <input type="number" value={codFee} onChange={e => setCodFee(e.target.value)} placeholder="40" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Convert to prepaid %</label>
            <input type="number" value={convertPct} onChange={e => setConvertPct(e.target.value)} placeholder="30" className={INP} />
          </div>
        </div>
      </div>

      {n > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "COD bleed / month", value: formatCurrency(Math.round(currentBleed)), color: "text-red-400", sub: `${Math.round(rtoOrders)} RTOs + fees` },
              { label: "Orders converted", value: String(Math.round(converted)), color: "text-blue-400", sub: `${convertPct}% to prepaid` },
              { label: "Monthly saving", value: formatCurrency(Math.round(totalSaved)), color: "text-green-400", sub: "RTO + COD fees avoided" },
              { label: "Revenue de-risked", value: formatCurrency(Math.round(blockedRevenueFreed)), color: "text-green-400", sub: "no longer lost to RTO" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
            <p className="text-sm font-bold text-green-400 flex items-center gap-2">
              <TrendingUp size={14} /> Converting {convertPct}% of COD to prepaid saves about {formatCurrency(Math.round(totalSaved))}/month in shipping &amp; fees - roughly {formatCurrency(Math.round(totalSaved * 12))} a year - before counting the working capital freed from cash-in-transit.
            </p>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A small prepaid discount (₹20-50) often pays for itself many times over against RTO cost. Send a UPI link the moment the order is placed and again before dispatch; prepaid orders also return far less often than COD.</p>
    </div>
  );
}

// ── Gateway-fee GST / ITC tracker ──────────────────────────────────────────────────
type FeeGstRow = { id: string; month: string; gateway: string; feeBase: number; gstPct: number };
function FeeGstItcTracker() {
  const [rows, setRows] = useFeatureState<FeeGstRow[]>("pay-fee-gst", []);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [gateway, setGateway] = useState("");
  const [feeBase, setFeeBase] = useState("");
  const [gstPct, setGstPct] = useState("18");

  const add = () => {
    const f = parseFloat(feeBase), g = parseFloat(gstPct);
    if (!gateway.trim() || isNaN(f) || f <= 0) { toast.error("Enter gateway and the fee charged (before GST)"); return; }
    setRows([{ id: crypto.randomUUID(), month, gateway: gateway.trim(), feeBase: f, gstPct: isNaN(g) ? 18 : g }, ...rows]);
    setGateway(""); setFeeBase("");
    toast.success("Fee entry added");
  };

  const evaluated = rows.map(r => {
    const gst = r.feeBase * r.gstPct / 100;
    return { ...r, gst, gross: r.feeBase + gst };
  });
  const totalFee = evaluated.reduce((s, r) => s + r.feeBase, 0);
  const totalGst = evaluated.reduce((s, r) => s + r.gst, 0);
  const months = new Set(evaluated.map(r => r.month)).size;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ReceiptIndianRupee size={14} className="text-[var(--color-primary)]" /> Gateway-Fee GST &amp; ITC Tracker</h2>
        <p className="text-xs text-[var(--color-muted)]">Payment gateways charge 18% GST on their processing fee - and you can claim it back as input tax credit. Log each month's fee so the ITC shows up in your GSTR-3B instead of leaking away.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gateway</label>
            <input value={gateway} onChange={e => setGateway(e.target.value)} placeholder="Razorpay" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Fee charged ₹ (ex-GST)</label>
            <input type="number" value={feeBase} onChange={e => setFeeBase(e.target.value)} placeholder="4200" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GST %</label>
            <input type="number" value={gstPct} onChange={e => setGstPct(e.target.value)} placeholder="18" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {evaluated.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total fees (ex-GST)", value: formatCurrency(Math.round(totalFee)), color: "text-orange-400" },
            { label: "GST paid on fees", value: formatCurrency(Math.round(totalGst)), color: "text-blue-400" },
            { label: "Claimable ITC", value: formatCurrency(Math.round(totalGst)), color: "text-green-400" },
            { label: "Months tracked", value: String(months), color: "text-[var(--color-text)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No fee entries yet. Pull the GST-on-fee figure from each gateway's monthly tax invoice and log it here.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Month", "Gateway", "Fee (ex-GST)", "GST", "Gross debit", "ITC", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[...evaluated].sort((a, b) => b.month.localeCompare(a.month)).map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 tabular-nums">{r.month}</td>
                    <td className="px-4 py-2.5 font-medium">{r.gateway}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.feeBase))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-blue-400">{formatCurrency(Math.round(r.gst))} <span className="text-[10px] text-[var(--color-muted)]">@{r.gstPct}%</span></td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(Math.round(r.gross))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(Math.round(r.gst))}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">ITC is claimable only if the gateway's GSTIN and your invoice details match what's filed in their GSTR-1 and reflected in your GSTR-2B. Reconcile this log against 2B before claiming, and keep the tax invoice - not just the settlement statement - on file.</p>
    </div>
  );
}

// ── Penny-drop bank verification log ────────────────────────────────────────────────
type PennyRow = { id: string; payee: string; account: string; ifsc: string; nameAtBank: string; status: "verified" | "mismatch" | "failed"; ts: string };
function PennyDropVerifier() {
  const [rows, setRows] = useFeatureState<PennyRow[]>("pay-pennydrop", []);
  const [payee, setPayee] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [nameAtBank, setNameAtBank] = useState("");

  const ifscValid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
  const acctValid = /^\d{6,18}$/.test(account.trim());

  const add = (status: PennyRow["status"]) => {
    if (!payee.trim() || !acctValid || !ifscValid) { toast.error("Enter payee, a valid account number and IFSC"); return; }
    setRows([{ id: crypto.randomUUID(), payee: payee.trim(), account: account.trim(), ifsc: ifsc.trim().toUpperCase(), nameAtBank: nameAtBank.trim(), status, ts: new Date().toISOString() }, ...rows]);
    setPayee(""); setAccount(""); setIfsc(""); setNameAtBank("");
    toast.success(status === "verified" ? "Marked verified" : status === "mismatch" ? "Logged name mismatch" : "Logged failed drop");
  };

  const verified = rows.filter(r => r.status === "verified").length;
  const flagged = rows.filter(r => r.status !== "verified").length;
  const STATUS_STYLE: Record<PennyRow["status"], string> = {
    verified: "bg-green-900/30 text-green-400 border-green-800/40",
    mismatch: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    failed: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Penny-Drop Bank Verification</h2>
        <p className="text-xs text-[var(--color-muted)]">Before a bulk or high-value payout, confirm the account is real and the name matches. Push a ₹1 credit, read back the registered name, and log the result here so a wrong-account transfer never leaves your books.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payee (as you know them)</label>
            <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Sharma Logistics" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account number</label>
            <input value={account} onChange={e => setAccount(e.target.value)} inputMode="numeric" placeholder="50100123456789" className={INP} />
            {account.trim() !== "" && !acctValid && <p className="text-[10px] text-red-400 mt-1">6-18 digits</p>}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IFSC</label>
            <input value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" className={INP} />
            {ifsc.trim() !== "" && !ifscValid && <p className="text-[10px] text-red-400 mt-1">Format ABCD0XXXXXX</p>}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name returned by bank</label>
            <input value={nameAtBank} onChange={e => setNameAtBank(e.target.value)} placeholder="SHARMA LOGISTICS PVT LTD" className={INP} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => add("verified")} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-xs font-medium"><CheckCircle2 size={12} /> Name matches - verify</button>
          <button onClick={() => add("mismatch")} className="flex items-center gap-1.5 bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-xs hover:border-yellow-800/40">Name mismatch</button>
          <button onClick={() => add("failed")} className="flex items-center gap-1.5 bg-[var(--color-accent)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-xs hover:border-red-800/40">Drop failed</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Verified", value: String(verified), color: "text-green-400" },
            { label: "Flagged", value: String(flagged), color: flagged ? "text-orange-400" : "text-green-400" },
            { label: "Total checks", value: String(rows.length), color: "text-[var(--color-text)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No verifications logged. Verify every new beneficiary once, then reuse the confirmed record on future pay-runs.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Payee", "Account", "IFSC", "Bank name", "Status", "Checked", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className={`hover:bg-white/2 ${r.status === "failed" ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{r.payee}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[11px]">{r.account}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{r.ifsc}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[180px] truncate">{r.nameAtBank || "-"}</td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                    <td className="px-4 py-2.5 tabular-nums text-[11px] text-[var(--color-muted)]">{format(new Date(r.ts), "d MMM")}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A penny-drop costs a rupee or two per check but prevents a misdirected payout that's almost impossible to claw back. Treat a name mismatch as a hard stop - confirm the spelling with the payee before releasing funds.</p>
    </div>
  );
}

// ── Payout approval desk (maker-checker) ────────────────────────────────────────────
type ApprovalRow = { id: string; payee: string; amount: number; purpose: string; requestedBy: string; ts: string; status: "pending" | "approved" | "rejected" };
function PayoutApprovalDesk() {
  const [rows, setRows] = useFeatureState<ApprovalRow[]>("pay-approvals", []);
  const [threshold, setThreshold] = useFeatureState<number>("pay-approval-threshold", 50000);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requestedBy, setRequestedBy] = useState("");

  const submit = () => {
    const a = parseFloat(amount);
    if (!payee.trim() || isNaN(a) || a <= 0) { toast.error("Enter payee and a valid amount"); return; }
    const needsApproval = a >= threshold;
    setRows([{
      id: crypto.randomUUID(), payee: payee.trim(), amount: a, purpose: purpose.trim(),
      requestedBy: requestedBy.trim() || "-", ts: new Date().toISOString(),
      status: needsApproval ? "pending" : "approved",
    }, ...rows]);
    setPayee(""); setAmount(""); setPurpose("");
    toast.success(needsApproval ? "Sent for approval" : "Auto-approved (below threshold)");
  };
  const setStatus = (id: string, status: ApprovalRow["status"]) =>
    setRows(rows.map(r => r.id === id ? { ...r, status } : r));

  const pending = rows.filter(r => r.status === "pending");
  const pendingValue = pending.reduce((s, r) => s + r.amount, 0);
  const approvedValue = rows.filter(r => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  const STATUS_STYLE: Record<ApprovalRow["status"], string> = {
    pending: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    approved: "bg-green-900/30 text-green-400 border-green-800/40",
    rejected: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><UserCheck size={14} className="text-[var(--color-primary)]" /> Payout Approval Desk</h2>
        <p className="text-xs text-[var(--color-muted)]">Maker-checker for disbursals: anything at or above your threshold needs a second pair of eyes before it's released. Small payouts auto-clear so routine spend isn't blocked.</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--color-muted)]">Approval needed at or above ₹</span>
          <input type="number" min={0} value={threshold} onChange={e => setThreshold(parseFloat(e.target.value) || 0)} className={`${INP} max-w-[140px]`} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payee</label>
            <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Vendor / staff" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="75000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Q2 supplier dues" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Requested by</label>
            <input value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder="Priya (accounts)" className={INP} />
          </div>
          <button onClick={submit} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Submit
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Awaiting approval", value: formatAmount(pendingValue), sub: `${pending.length} request(s)`, color: pending.length ? "text-orange-400" : "text-green-400" },
            { label: "Approved", value: formatAmount(approvedValue), sub: "cleared to pay", color: "text-green-400" },
            { label: "Total requests", value: String(rows.length), sub: "all-time", color: "text-[var(--color-text)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No payout requests yet. Submit one above; anything at or above {formatCurrency(threshold)} will queue for approval.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Payee", "Amount", "Purpose", "Requested by", "When", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.payee}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)] max-w-[160px] truncate">{r.purpose || "-"}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.requestedBy}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[11px] text-[var(--color-muted)]">{format(new Date(r.ts), "d MMM")}</td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {r.status === "pending" && (
                        <>
                          <button onClick={() => setStatus(r.id, "approved")} className="text-[10px] text-green-400 hover:underline mr-2">Approve</button>
                          <button onClick={() => setStatus(r.id, "rejected")} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 mr-2">Reject</button>
                        </>
                      )}
                      <button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Maker-checker is the single cheapest control against payout fraud and fat-finger errors. The person who raises a payout should never be the one who approves it - keep submit and approve in different hands.</p>
    </div>
  );
}

// ── Failed-payment recovery analytics ───────────────────────────────────────────────
type RecoveryRow = { id: string; label: string; failedCount: number; failedValue: number; recoveredCount: number };
function RecoveryAnalytics() {
  const [rows, setRows] = useFeatureState<RecoveryRow[]>("pay-recovery", []);
  const [label, setLabel] = useState("");
  const [failedCount, setFailedCount] = useState("");
  const [failedValue, setFailedValue] = useState("");
  const [recoveredCount, setRecoveredCount] = useState("");

  const add = () => {
    const fc = parseInt(failedCount), fv = parseFloat(failedValue), rc = parseInt(recoveredCount);
    if (!label.trim() || isNaN(fc) || fc <= 0 || isNaN(fv) || fv < 0) { toast.error("Enter a label, failed count and failed value"); return; }
    const rcN = isNaN(rc) ? 0 : Math.min(rc, fc);
    setRows([{ id: crypto.randomUUID(), label: label.trim(), failedCount: fc, failedValue: fv, recoveredCount: rcN }, ...rows]);
    setLabel(""); setFailedCount(""); setFailedValue(""); setRecoveredCount("");
    toast.success("Cohort added");
  };

  const evaluated = rows.map(r => {
    const avgTicket = r.failedValue / r.failedCount;
    const recoveryRate = r.failedCount ? r.recoveredCount / r.failedCount : 0;
    const recoveredValue = avgTicket * r.recoveredCount;
    const stillRecoverable = r.failedValue - recoveredValue;
    return { ...r, avgTicket, recoveryRate, recoveredValue, stillRecoverable };
  });
  const totalFailedValue = evaluated.reduce((s, r) => s + r.failedValue, 0);
  const totalRecoveredValue = evaluated.reduce((s, r) => s + r.recoveredValue, 0);
  const totalLeft = evaluated.reduce((s, r) => s + r.stillRecoverable, 0);
  const blendedRate = totalFailedValue ? totalRecoveredValue / totalFailedValue : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><LineChart size={14} className="text-[var(--color-primary)]" /> Failed-Payment Recovery Analytics</h2>
        <p className="text-xs text-[var(--color-muted)]">A failed payment isn't lost revenue yet - most of it is recoverable with a timely retry or fresh link. Log failed cohorts by period or method to see how much you've clawed back and how much is still on the table.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cohort (period / method)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="May · UPI collect" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Failed count</label>
            <input type="number" value={failedCount} onChange={e => setFailedCount(e.target.value)} placeholder="240" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Failed value ₹</label>
            <input type="number" value={failedValue} onChange={e => setFailedValue(e.target.value)} placeholder="360000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Recovered count</label>
            <input type="number" value={recoveredCount} onChange={e => setRecoveredCount(e.target.value)} placeholder="156" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {evaluated.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Failed value", value: formatAmount(Math.round(totalFailedValue)), color: "text-orange-400" },
            { label: "Recovered", value: formatAmount(Math.round(totalRecoveredValue)), color: "text-green-400" },
            { label: "Still recoverable", value: formatAmount(Math.round(totalLeft)), color: totalLeft > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Blended recovery", value: `${(blendedRate * 100).toFixed(0)}%`, color: "text-blue-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {evaluated.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No cohorts yet. Add a period or payment method with its failed and recovered counts to size your recoverable revenue.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Cohort", "Failed", "Failed value", "Avg ticket", "Recovery", "Recovered", "Still recoverable", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {evaluated.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.failedCount}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(r.failedValue)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.avgTicket))}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.recoveryRate >= 0.5 ? "text-green-400" : r.recoveryRate >= 0.25 ? "text-yellow-400" : "text-orange-400"}`}>{(r.recoveryRate * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{formatAmount(Math.round(r.recoveredValue))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-yellow-400">{formatAmount(Math.round(r.stillRecoverable))}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(rows.filter(x => x.id !== r.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Insufficient-balance and step-up declines recover best when retried 2-3 days after payday; hard declines (closed card, blocked account) rarely do. Use the Dunning Ladder and Mandate Retry tools to action the "still recoverable" pool.</p>
    </div>
  );
}

// ── Tip pooling / staff split ───────────────────────────────────────────────────────
type TipStaff = { id: string; name: string; shares: number };
function TipPoolingSplitter() {
  const [staff, setStaff] = useFeatureState<TipStaff[]>("pay-tip-staff", []);
  const [pool, setPool] = useState("");
  const [name, setName] = useState("");
  const [shares, setShares] = useState("1");

  const add = () => {
    const sh = parseFloat(shares);
    if (!name.trim() || isNaN(sh) || sh <= 0) { toast.error("Enter a staff name and a positive share weight"); return; }
    setStaff([...staff, { id: crypto.randomUUID(), name: name.trim(), shares: sh }]);
    setName(""); setShares("1");
    toast.success("Staff added");
  };

  const poolN = parseFloat(pool) || 0;
  const totalShares = staff.reduce((s, m) => s + m.shares, 0);
  const allocation = staff.map(m => ({
    ...m,
    amount: totalShares > 0 ? poolN * m.shares / totalShares : 0,
  }));
  // Penny-correct: give rounding remainder to the largest-share staffer.
  const rounded = allocation.map(a => ({ ...a, paid: Math.floor(a.amount) }));
  const distributed = rounded.reduce((s, a) => s + a.paid, 0);
  const remainder = Math.round(poolN) - distributed;
  const topIdx = rounded.reduce((best, a, i) => a.amount > (rounded[best]?.amount ?? -1) ? i : best, 0);
  const finalRows = rounded.map((a, i) => ({ ...a, paid: i === topIdx ? a.paid + remainder : a.paid }));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck size={14} className="text-[var(--color-primary)]" /> Tip Pooling &amp; Staff Split</h2>
        <p className="text-xs text-[var(--color-muted)]">Tips collected at checkout go into one pool - this splits them fairly across staff by share weight (e.g. full-timers 2, part-timers 1), to the rupee, with no money lost to rounding.</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-44">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tip pool to split ₹</label>
            <input type="number" value={pool} onChange={e => setPool(e.target.value)} placeholder="4800" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Staff name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Anil" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Share weight</label>
            <input type="number" min={0} step="0.5" value={shares} onChange={e => setShares(e.target.value)} placeholder="1" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add staff
          </button>
        </div>
      </div>

      {staff.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pool", value: formatCurrency(Math.round(poolN)), color: "text-[var(--color-text)]" },
            { label: "Staff", value: String(staff.length), color: "text-blue-400" },
            { label: "Total shares", value: String(totalShares), color: "text-[var(--color-muted)]" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {staff.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No staff added. Add the people who share the tip pool and set each one's share weight.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Staff", "Shares", "% of pool", "Payout", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {finalRows.map(a => (
                  <tr key={a.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{a.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{a.shares}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{totalShares > 0 ? `${(a.shares / totalShares * 100).toFixed(1)}%` : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(a.paid)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => copy(`${a.name}: ${formatCurrency(a.paid)}`, "Payout copied")} className="text-[10px] text-[var(--color-primary)] hover:underline mr-3">Copy</button>
                      <button onClick={() => setStaff(staff.filter(x => x.id !== a.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">The largest-share staffer absorbs the rounding remainder so the payouts always add back exactly to the pool. Disbursed tips are taxable as the recipients' income - keep this split sheet as the record behind each payout.</p>
    </div>
  );
}
