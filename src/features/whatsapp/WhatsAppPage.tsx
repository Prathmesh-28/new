import { useMemo, useState } from "react";
import { MessageCircle, Check, Bell, Zap, Phone, ArrowRight, Copy, RefreshCw, Sparkles, TrendingUp, AlertTriangle, CreditCard, ChevronDown, ChevronUp, Send, BellRing, PlusCircle, FileText, CheckSquare, Trash2, Megaphone, PackageCheck, BadgeCheck, PartyPopper, Tag, Star, QrCode, ReceiptIndianRupee, Truck, CalendarClock, Gift, MessageSquareText, Rocket, UserPlus, CalendarCheck, Share2, CalendarRange, FileSignature, FolderInput, UserCheck, SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { DEFAULT_WA_PREFS, type WhatsAppPreferences } from "@/data/types";
import { useT } from "@/i18n";
import DatePicker from "@/components/DatePicker";

// Build a wa.me deep link that pre-fills a message (no backend call). If a
// recipient phone is supplied, it opens that chat; otherwise WhatsApp asks who.
function waLink(text: string, phone?: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

type WaTab = "overview" | "wa-invoice-pay" | "wa-reminder-bot" | "wa-sales-capture" | "wa-statement" | "wa-approvals" | "wa-broadcast" | "wa-order-status" | "wa-payment-confirm" | "wa-festive" | "wa-price-list" | "wa-review" | "wa-qr" | "wa-gst-invoice" | "wa-cod-confirm" | "wa-service-reminder" | "wa-loyalty" | "wa-quick-replies" | "wa-product-launch" | "wa-win-back" | "wa-appointment" | "wa-referral" | "wa-payment-plan" | "wa-quotation" | "wa-doc-request" | "wa-onboarding" | "wa-feedback";

// authFetch throws Error("<status>: <body>") - pull the server's {error} message out.
function apiError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  const i = m.indexOf("{");
  if (i >= 0) { try { return JSON.parse(m.slice(i)).error ?? m; } catch { /* ignore */ } }
  return m;
}

const DIGEST_PREVIEW = [
  { type: "header", text: "☀️ Headroom Morning Brief · Mon 9 Jun" },
  { type: "divider" },
  { type: "stat", label: "Cash Balance", value: "₹18.4L", delta: "+2.1L vs last week", positive: true },
  { type: "stat", label: "Runway", value: "94 days", delta: "↑ 6d improvement", positive: true },
  { type: "divider" },
  { type: "section", text: "⚡ 3 actions for today:" },
  { type: "action", text: "1. Chase Reddy Industries - ₹3.2L overdue 18d" },
  { type: "action", text: "2. TDS deposit due in 4 days - ₹41,000" },
  { type: "action", text: "3. Payroll ₹2.8L due Friday - buffer tight" },
  { type: "divider" },
  { type: "footer", text: "Reply *CASH* for balance · *FORECAST* for 30d view · *HELP* for all commands" },
];

const ALERT_TYPES = [
  { id: "low_cash",    label: "Low cash alert",         desc: "When balance drops below threshold",   icon: AlertTriangle, default: true  },
  { id: "overdue",     label: "Overdue invoice",         desc: "When a customer payment is overdue",   icon: Bell,          default: true  },
  { id: "gst_due",     label: "GST filing reminder",     desc: "7 days and 1 day before due date",     icon: TrendingUp,    default: true  },
  { id: "credit_offer",label: "Credit offer available",  desc: "When you pre-qualify for a new offer", icon: CreditCard,    default: false },
  { id: "payroll",     label: "Payroll reminder",        desc: "3 days before payroll is due",         icon: Zap,           default: true  },
  { id: "weekly",      label: "Weekly summary",          desc: "Monday morning cash brief",            icon: Sparkles,      default: true  },
];

const COMMANDS = [
  { cmd: "CASH",     desc: "Current balance across all accounts" },
  { cmd: "RUNWAY",   desc: "Days of cash remaining at current burn" },
  { cmd: "FORECAST", desc: "30-day cash projection in plain English" },
  { cmd: "OVERDUE",  desc: "List of overdue invoices to chase today" },
  { cmd: "GST",      desc: "Next GST liability and due date" },
  { cmd: "CREDIT",   desc: "Check if you qualify for working capital" },
  { cmd: "PAUSE",    desc: "Pause all alerts for 24 hours" },
  { cmd: "HELP",     desc: "Show all available commands" },
];

function DigestBubble() {
  return (
    <div className="bg-[#005C4B] rounded-xl rounded-tl-none p-3 max-w-xs w-full shadow-lg">
      <div className="space-y-1">
        {DIGEST_PREVIEW.map((line, i) => {
          if (line.type === "header") return (
            <p key={i} className="text-white font-semibold text-sm">{line.text}</p>
          );
          if (line.type === "divider") return (
            <div key={i} className="h-px bg-white/10 my-1.5" />
          );
          if (line.type === "stat") return (
            <div key={i} className="flex items-center justify-between">
              <span className="text-white/70 text-xs">{line.label}</span>
              <div className="text-right">
                <span className="text-white font-bold text-xs">{line.value}</span>
                <span className={`block text-[10px] ${line.positive ? "text-green-300" : "text-red-300"}`}>{line.delta}</span>
              </div>
            </div>
          );
          if (line.type === "section") return (
            <p key={i} className="text-white/90 text-xs font-medium mt-1">{line.text}</p>
          );
          if (line.type === "action") return (
            <p key={i} className="text-white/80 text-xs pl-1">{line.text}</p>
          );
          if (line.type === "footer") return (
            <p key={i} className="text-white/50 text-[10px] mt-1 leading-relaxed">{line.text}</p>
          );
          return null;
        })}
      </div>
      <p className="text-white/40 text-[10px] text-right mt-2">9:01 AM ✓✓</p>
    </div>
  );
}

function ReplyBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-[#202C33] rounded-xl rounded-tr-none p-2.5 max-w-[60%]">
        <p className="text-white text-xs font-mono">{text}</p>
        <p className="text-white/40 text-[10px] text-right mt-1">9:03 AM ✓✓</p>
      </div>
    </div>
  );
}

function ResponseBubble({ text }: { text: string }) {
  return (
    <div className="bg-[#005C4B] rounded-xl rounded-tl-none p-2.5 max-w-xs">
      <p className="text-white text-xs">{text}</p>
      <p className="text-white/40 text-[10px] text-right mt-1">9:03 AM ✓✓</p>
    </div>
  );
}

export default function WhatsAppPage() {
  const tr = useT();
  const [step, setStep]         = useState<"idle" | "phone" | "otp" | "done">("idle");
  const [phone, setPhone]       = useState("");
  const [otp, setOtp]           = useState("");
  // Alert prefs are persisted per-tenant in the KV store so they survive reload
  // and the backend morning-brief digest honours them.
  const { store, setStore, canEdit } = useApp();
  const alerts: WhatsAppPreferences = { ...DEFAULT_WA_PREFS, ...(store.whatsappPreferences ?? {}) };
  const [showCommands, setShowCommands] = useState(false);
  const [chatStep, setChatStep] = useState(0);

  const connected = step === "done";

  const [sending, setSending]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const e164 = () => "+91" + phone.replace(/\D/g, "");

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) { toast.error("Enter a valid 10-digit mobile number"); return; }
    setSending(true);
    try {
      await api.post("/api/whatsapp/send-otp", { phone: e164() });
      setStep("otp");
      toast.success("Code sent to +91 " + digits + " on WhatsApp");
    } catch (err) {
      toast.error(apiError(err));
    } finally { setSending(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) { toast.error("Enter the 6-digit code from WhatsApp"); return; }
    setVerifying(true);
    try {
      await api.post("/api/whatsapp/verify-otp", { phone: e164(), code: otp });
      setStep("done");
      toast.success("WhatsApp connected! Your morning brief arrives at 9 AM daily.");
    } catch (err) {
      toast.error(apiError(err));
    } finally { setVerifying(false); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    toast.success("Copied");
  };

  const toggleAlert = (id: string) => {
    if (!canEdit()) { toast.error("Your role has read-only access."); return; }
    const key = id as keyof WhatsAppPreferences;
    setStore(s => ({
      ...s,
      whatsappPreferences: { ...DEFAULT_WA_PREFS, ...(s.whatsappPreferences ?? {}), [key]: !alerts[key] },
    }));
    toast.success(`${alerts[key] ? "Muted" : "Enabled"} - saved to your morning brief`, { id: "wa-pref" });
  };

  const advanceChat = () => setChatStep(s => Math.min(s + 1, 2));

  const [tab, setTab] = useState<WaTab>("overview");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MessageCircle size={20} className="text-green-400" />
          {tr("wa.title")}
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {tr("wa.subtitle")}
        </p>
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["overview", tr("wa.tab.overview"), MessageCircle],
          ["wa-invoice-pay", tr("wa.tab.invoicePay"), Send],
          ["wa-reminder-bot", tr("wa.tab.reminderBot"), BellRing],
          ["wa-sales-capture", tr("wa.tab.salesCapture"), PlusCircle],
          ["wa-statement", tr("wa.tab.statement"), FileText],
          ["wa-approvals", tr("wa.tab.approvals"), CheckSquare],
          ["wa-broadcast", tr("wa.tab.broadcast"), Megaphone],
          ["wa-order-status", tr("wa.tab.orderStatus"), PackageCheck],
          ["wa-payment-confirm", "Pay Receipt", BadgeCheck],
          ["wa-festive", "Festive Offer", PartyPopper],
          ["wa-price-list", "Price List", Tag],
          ["wa-review", "Review Ask", Star],
          ["wa-qr", "Chat Link / QR", QrCode],
          ["wa-gst-invoice", "GST Invoice", ReceiptIndianRupee],
          ["wa-cod-confirm", "COD Confirm", Truck],
          ["wa-service-reminder", "Service Reminder", CalendarClock],
          ["wa-loyalty", "Loyalty Points", Gift],
          ["wa-quick-replies", "Quick Replies", MessageSquareText],
          ["wa-product-launch", "Product Launch", Rocket],
          ["wa-win-back", "Win-Back", UserPlus],
          ["wa-appointment", "Appointment", CalendarCheck],
          ["wa-referral", "Referral Ask", Share2],
          ["wa-payment-plan", "Payment Plan", CalendarRange],
          ["wa-quotation", "Quotation", FileSignature],
          ["wa-doc-request", "Doc / KYC Ask", FolderInput],
          ["wa-onboarding", "Onboarding", UserCheck],
          ["wa-feedback", "Feedback / CSAT", SmilePlus],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {tab === "wa-invoice-pay" && <WaInvoicePay />}
      {tab === "wa-reminder-bot" && <WaReminderBot />}
      {tab === "wa-sales-capture" && <WaSalesCapture />}
      {tab === "wa-statement" && <WaStatementOnDemand />}
      {tab === "wa-approvals" && <WaApprovalActions />}
      {tab === "wa-broadcast" && <WaBroadcastCampaign />}
      {tab === "wa-order-status" && <WaOrderStatus />}
      {tab === "wa-payment-confirm" && <WaPaymentConfirm />}
      {tab === "wa-festive" && <WaFestiveOffer />}
      {tab === "wa-price-list" && <WaPriceList />}
      {tab === "wa-review" && <WaReviewRequest />}
      {tab === "wa-qr" && <WaChatLinkQr />}
      {tab === "wa-gst-invoice" && <WaGstInvoiceShare />}
      {tab === "wa-cod-confirm" && <WaCodConfirm />}
      {tab === "wa-service-reminder" && <WaServiceReminder />}
      {tab === "wa-loyalty" && <WaLoyaltyPoints />}
      {tab === "wa-quick-replies" && <WaQuickReplies />}
      {tab === "wa-product-launch" && <WaProductLaunch />}
      {tab === "wa-win-back" && <WaWinBack />}
      {tab === "wa-appointment" && <WaAppointmentReminder />}
      {tab === "wa-referral" && <WaReferralAsk />}
      {tab === "wa-payment-plan" && <WaPaymentPlan />}
      {tab === "wa-quotation" && <WaQuotationBuilder />}
      {tab === "wa-doc-request" && <WaDocRequest />}
      {tab === "wa-onboarding" && <WaOnboardingForm />}
      {tab === "wa-feedback" && <WaFeedbackCollector />}

      {tab === "overview" && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: connect + settings */}
        <div className="space-y-4">

          {/* Connect card */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${connected ? "bg-green-900/40 border border-green-700/50" : "bg-green-950/30 border border-green-800/40"}`}>
                <MessageCircle size={16} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">{connected ? "WhatsApp Connected" : "Connect WhatsApp"}</p>
                <p className="text-xs text-[var(--color-muted)]">{connected ? `+91 ${phone} · Active` : "Receive alerts and query your finances"}</p>
              </div>
              {connected && <Check size={16} className="text-green-400 ml-auto" />}
            </div>

            {step === "idle" && (
              <button
                onClick={() => setStep("phone")}
                className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle size={14} />
                {tr("wa.connect")}
              </button>
            )}

            {step === "phone" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <span className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-muted)] select-none">+91</span>
                  <input
                    autoFocus
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="98XXXXXXXX"
                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-green-700/60"
                  />
                </div>
                <button
                  onClick={handleSendOtp}
                  disabled={sending}
                  className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send OTP via WhatsApp →"}
                </button>
              </div>
            )}

            {step === "otp" && (
              <div className="space-y-3">
                <p className="text-xs text-[var(--color-muted)]">Enter the 6-digit OTP sent to your WhatsApp</p>
                <input
                  autoFocus
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-green-700/60 text-center tracking-widest font-mono text-lg"
                />
                <button
                  onClick={handleVerifyOtp}
                  disabled={verifying}
                  className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {verifying ? "Verifying…" : "Verify & Connect"}
                </button>
                <button onClick={() => setStep("phone")} className="w-full text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
                  ← Change number
                </button>
              </div>
            )}

            {connected && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs py-2 border-b border-[var(--color-border)]">
                  <span className="text-[var(--color-muted)]">Morning digest</span>
                  <span className="text-green-400 font-medium">9:00 AM daily</span>
                </div>
                <div className="flex items-center justify-between text-xs py-2 border-b border-[var(--color-border)]">
                  <span className="text-[var(--color-muted)]">Active alerts</span>
                  <span className="font-medium">{Object.values(alerts).filter(Boolean).length} of {ALERT_TYPES.length}</span>
                </div>
                <button
                  onClick={async () => { try { await api.delete("/api/whatsapp/register"); } catch { /* ignore */ } setStep("idle"); setPhone(""); setOtp(""); toast.success("WhatsApp disconnected"); }}
                  className="text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors mt-1"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* Alert preferences */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h2 className="text-sm font-semibold mb-3">Alert preferences</h2>
            <div className="space-y-3">
              {ALERT_TYPES.map(({ id, label, desc, icon: Icon }) => (
                <div key={id} className="flex items-start gap-3">
                  <Icon size={14} className="text-[var(--color-muted)] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-xs text-[var(--color-muted)]">{desc}</p>
                  </div>
                  <button
                    onClick={() => toggleAlert(id)}
                    className={`w-10 h-5 rounded-full transition-colors shrink-0 relative ${alerts[id as keyof WhatsAppPreferences] ? "bg-green-700" : "bg-[var(--color-border)]"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${alerts[id as keyof WhatsAppPreferences] ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Commands */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => setShowCommands(v => !v)}
            >
              <h2 className="text-sm font-semibold">Chat commands</h2>
              {showCommands ? <ChevronUp size={14} className="text-[var(--color-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-muted)]" />}
            </button>
            {showCommands && (
              <div className="mt-3 space-y-2">
                {COMMANDS.map(({ cmd, desc }) => (
                  <div key={cmd} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                    <button
                      onClick={() => handleCopy(cmd)}
                      className="font-mono text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 rounded text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 flex items-center gap-1 shrink-0"
                    >
                      {cmd} <Copy size={9} />
                    </button>
                    <p className="text-xs text-[var(--color-muted)]">{desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: phone mockup */}
        <div className="space-y-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Live preview</h2>
              <span className="text-[10px] bg-green-950/40 text-green-400 border border-green-800/30 px-2 py-0.5 rounded-full">WhatsApp</span>
            </div>

            {/* Phone frame */}
            <div className="bg-[#0B141A] rounded-2xl p-3 border border-[#2A3942] max-w-[300px] mx-auto">
              {/* Status bar */}
              <div className="flex items-center gap-2 px-1 mb-3">
                <div className="w-8 h-8 bg-green-700 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">H</span>
                </div>
                <div>
                  <p className="text-white text-xs font-semibold leading-tight">Headroom</p>
                  <p className="text-[10px] text-white/40">Business account · online</p>
                </div>
                <Phone size={12} className="text-white/30 ml-auto" />
              </div>

              {/* Chat area */}
              <div className="bg-[#0B141A] rounded-xl p-2 space-y-3 min-h-[320px]">
                {/* Date badge */}
                <div className="flex justify-center">
                  <span className="text-[10px] text-white/30 bg-[#182229] px-2 py-0.5 rounded-full">TODAY</span>
                </div>

                <DigestBubble />

                {chatStep >= 1 && <ReplyBubble text="FORECAST" />}
                {chatStep >= 2 && (
                  <ResponseBubble text="📈 30-day forecast: ₹14.2L → ₹19.8L (P50). Main driver: Mehta Corp payment expected Jun 22 (₹6.1L). Risk: Jun 30 payroll ₹2.8L - buffer ok." />
                )}
              </div>

              {/* Try it */}
              {chatStep < 2 && (
                <button
                  onClick={advanceChat}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors py-1"
                >
                  <RefreshCw size={9} />
                  {chatStep === 0 ? "Reply FORECAST →" : "See response →"}
                </button>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h2 className="text-sm font-semibold mb-3">How it works</h2>
            <div className="space-y-3">
              {[
                { step: "1", title: "Connect your number", desc: "One-time OTP verification. No app download needed." },
                { step: "2", title: "Get the morning digest", desc: "Every day at 9 AM - balance, top 3 actions, tax reminders." },
                { step: "3", title: "Ask anything, anytime", desc: "Reply CASH, FORECAST, OVERDUE - get answers in seconds." },
                { step: "4", title: "Accept credit offers", desc: "Pre-qualified offers delivered directly. Approve in one reply." },
              ].map(({ step: s, title, desc }) => (
                <div key={s} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s}</span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{title}</p>
                    <p className="text-xs text-[var(--color-muted)]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stat */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Open rate", value: "94%", sub: "vs 22% email" },
              { label: "Response time", value: "<30s", sub: "avg query reply" },
              { label: "SMB owners", value: "80%", sub: "prefer WhatsApp" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-[var(--color-primary)]">{value}</p>
                <p className="text-[10px] text-[var(--color-text)] font-medium mt-0.5">{label}</p>
                <p className="text-[9px] text-[var(--color-muted)]">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade nudge */}
      {!connected && (
        <div className="bg-green-950/20 border border-green-800/30 rounded-lg px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap size={16} className="text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">94% of Headroom users who connect WhatsApp take action on alerts same-day</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Dashboard users check once a week. WhatsApp users check every morning.</p>
            </div>
          </div>
          <button
            onClick={() => setStep("phone")}
            className="flex items-center gap-1.5 text-xs bg-green-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-green-600 transition-colors shrink-0 whitespace-nowrap"
          >
            Connect now <ArrowRight size={12} />
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
}

// Shared styles
const WA_INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const WA_CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4";

function WaSendButton({ text, phone, label }: { text: string; phone?: string; label?: string }) {
  return (
    <a
      href={waLink(text, phone)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => toast.success("Opening WhatsApp…")}
      className="inline-flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
    >
      <Send size={14} />{label ?? "Send on WhatsApp"}
    </a>
  );
}

// ── #177 WhatsApp Invoice Send & Pay ────────────────────────────────────────
function WaInvoicePay() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [selected, setSelected] = useState("");
  const [phone, setPhone] = useState("");
  const [payLink, setPayLink] = useState("");

  const inv = invoices.find(i => i.id === selected);
  const fc = formatCurrency;

  const message = inv
    ? `Hi ${inv.customer},\n\nHere is your invoice ${inv.invoiceNumber ? `#${inv.invoiceNumber}` : ""} from ${store.firm?.name ?? "us"}.\n\n*Amount:* ${fc(inv.amount)}\n*Due:* ${inv.dueDate}\n${inv.description ? `*For:* ${inv.description}\n` : ""}${payLink ? `\nPay securely here: ${payLink}\n` : ""}\nReply *PAID* once settled and we'll mark it received. Thank you!`
    : "";

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Send size={15} className="text-green-400" />WhatsApp Invoice Send &amp; Pay</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Pick an open invoice, attach an optional UPI/card pay-link, and send it to the customer on WhatsApp.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice</label>
            <select value={selected} onChange={e => setSelected(e.target.value)} className={WA_INP}>
              <option value="">Select an invoice…</option>
              {invoices.map(i => (
                <option key={i.id} value={i.id}>{(i.invoiceNumber ? `#${i.invoiceNumber} · ` : "")}{i.customer} · {fc(i.amount)} · {i.status}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pay-link (UPI / card, optional)</label>
            <input value={payLink} onChange={e => setPayLink(e.target.value)} placeholder="https://rzp.io/i/…" className={WA_INP} />
          </div>
        </div>
        {invoices.length === 0 && <p className="text-xs text-[var(--color-muted)]">No invoices yet - create one in the Invoices page first.</p>}
      </div>

      {inv && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Amount", value: fc(inv.amount), color: "text-[var(--color-primary)]" },
              { label: "Status", value: inv.status, color: inv.status === "overdue" ? "text-red-400" : inv.status === "paid" ? "text-green-400" : "text-orange-400" },
              { label: "Due Date", value: inv.dueDate, color: "text-[var(--color-text)]" },
              { label: "Pay-link", value: payLink ? "Attached" : "None", color: payLink ? "text-green-400" : "text-[var(--color-muted)]" },
            ].map(c => (
              <div key={c.label} className={WA_CARD}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-base font-bold tabular-nums capitalize ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className={`${WA_CARD} space-y-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
            <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
            <WaSendButton text={message} phone={phone} label="Send invoice on WhatsApp" />
          </div>
        </>
      )}
    </div>
  );
}

// ── #178 WhatsApp Payment Reminder Bot ──────────────────────────────────────
type ReminderTier = { id: string; daysOverdue: number; tone: string };
const REMINDER_TIERS: ReminderTier[] = [
  { id: "gentle", daysOverdue: 1,  tone: "Gentle nudge" },
  { id: "firm",   daysOverdue: 7,  tone: "Firm reminder" },
  { id: "urgent", daysOverdue: 15, tone: "Urgent - final notice" },
];

function buildReminder(tier: ReminderTier, customer: string, amount: number, days: number, firmName: string): string {
  const fc = formatCurrency;
  if (tier.id === "gentle")
    return `Hi ${customer}, a friendly reminder that ${fc(amount)} is now ${days} day(s) overdue. Could you process it when convenient? Thanks - ${firmName}.`;
  if (tier.id === "firm")
    return `Hi ${customer}, our records show ${fc(amount)} is ${days} days overdue. Please arrange payment at the earliest. Let us know if there's an issue. - ${firmName}.`;
  return `Hi ${customer}, this is a final notice: ${fc(amount)} is ${days} days overdue. Kindly clear it within 48 hours to avoid late fees / further action. - ${firmName}.`;
}

function WaReminderBot() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const overdue = useMemo(() =>
    (store.invoices ?? [])
      .filter(i => i.status === "overdue" || (i.status === "pending" && new Date(i.dueDate) < today))
      .map(i => {
        const days = Math.max(1, Math.round((today.getTime() - new Date(i.dueDate).getTime()) / 86_400_000));
        const tier = days >= 15 ? REMINDER_TIERS[2] : days >= 7 ? REMINDER_TIERS[1] : REMINDER_TIERS[0];
        return { ...i, days, tier };
      })
      .sort((a, b) => b.days - a.days),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [store.invoices]);

  const totalOverdue = overdue.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-2`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BellRing size={15} className="text-green-400" />WhatsApp Payment Reminder Bot</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Auto-staged dunning ladder (D+1 / D+7 / D+15) built from your overdue invoices. Tap to send each nudge on WhatsApp.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Overdue invoices", value: String(overdue.length), color: "text-orange-400" },
          { label: "Total overdue", value: fc(totalOverdue), color: "text-red-400" },
          { label: "Final-notice", value: String(overdue.filter(o => o.tier.id === "urgent").length), color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className={WA_CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {overdue.length === 0 ? (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400">✓ No overdue invoices - nothing to chase.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Amount", "Overdue", "Tier", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overdue.map(o => (
                <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{o.customer}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fc(o.amount)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-red-400">{o.days}d</td>
                  <td className="px-4 py-2.5 text-xs">{o.tier.tone}</td>
                  <td className="px-4 py-2.5">
                    <WaSendButton text={buildReminder(o.tier, o.customer, o.amount, o.days, store.firm?.name ?? "us")} label="Remind" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Tier escalates with days overdue: D+1 gentle, D+7 firm, D+15 final notice.</p>
    </div>
  );
}

// ── #179 WhatsApp Daily-Sales Capture ───────────────────────────────────────
interface CapturedSale {
  id: string;
  date: string;
  customer: string;
  item: string;
  amount: number;
}

function WaSalesCapture() {
  const [sales, setSales] = useFeatureState<CapturedSale[]>("wa-sales-capture", []);
  const [customer, setCustomer] = useState("");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const fc = formatCurrency;

  const add = () => {
    const amt = parseFloat(amount);
    if (!item.trim() || !amt || amt <= 0) { toast.error("Enter an item and a positive amount"); return; }
    const row: CapturedSale = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      customer: customer.trim() || "Walk-in",
      item: item.trim(),
      amount: Math.round(amt),
    };
    setSales(prev => [row, ...prev]);
    setCustomer(""); setItem(""); setAmount("");
    toast.success("Sale booked");
  };

  const remove = (id: string) => setSales(prev => prev.filter(s => s.id !== id));

  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = sales.filter(s => s.date === today).reduce((s, r) => s + r.amount, 0);
  const total = sales.reduce((s, r) => s + r.amount, 0);

  const booked = sales.slice(0, 10).map(s => `${s.date} · ${s.customer} · ${s.item} · ${fc(s.amount)}`).join("\n");
  const ownerMsg = `Sales booked (latest ${Math.min(sales.length, 10)}):\n${booked || "-"}\n\nToday: ${fc(todayTotal)} · All-time: ${fc(total)}`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PlusCircle size={15} className="text-green-400" />WhatsApp Daily-Sales Capture</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Log a sale the way an owner would text it ("Sharma 2 chairs 4500"). Each entry is saved and synced; send a recap to your own WhatsApp any time.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Walk-in" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item / note</label>
            <input value={item} onChange={e => setItem(e.target.value)} placeholder="2 chairs" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="4500" className={WA_INP} />
          </div>
          <div className="flex items-end">
            <button onClick={add} className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors">Book sale</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Today's sales", value: fc(todayTotal), color: "text-green-400" },
          { label: "Entries", value: String(sales.length), color: "text-[var(--color-primary)]" },
          { label: "All-time total", value: fc(total), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className={WA_CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {sales.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Date", "Customer", "Item", "Amount", ""].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.date}</td>
                    <td className="px-4 py-2.5">{s.customer}</td>
                    <td className="px-4 py-2.5">{s.item}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fc(s.amount)}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => remove(s.id)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <WaSendButton text={ownerMsg} label="Send recap to my WhatsApp" />
        </>
      )}
    </div>
  );
}

// ── #180 WhatsApp Statement-on-Demand ───────────────────────────────────────
function WaStatementOnDemand() {
  const { store } = useApp();
  const fc = formatCurrency;
  const invoices = store.invoices ?? [];
  const customers = useMemo(() => Array.from(new Set(invoices.map(i => i.customer))).sort(), [invoices]);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");

  const rows = invoices.filter(i => i.customer === customer);
  const outstanding = rows.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const paid = rows.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  const lines = rows
    .slice()
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
    .map(i => `• ${i.invoiceDate} ${i.invoiceNumber ? `#${i.invoiceNumber} ` : ""}${fc(i.amount)} - ${i.status}`)
    .join("\n");

  const statement = customer
    ? `*Statement of Account - ${customer}*\nFrom ${store.firm?.name ?? "us"}\n\n${lines || "No invoices on record."}\n\n*Outstanding:* ${fc(outstanding)}\n*Settled:* ${fc(paid)}\n\nReply *PAY* for a pay-link or *QUERY* to raise a dispute.`
    : "";

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText size={15} className="text-green-400" />WhatsApp Statement-on-Demand</h3>
        <p className="text-[11px] text-[var(--color-muted)]">When a customer asks "what do I owe?", generate their full ledger statement and send it on WhatsApp in one tap.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <select value={customer} onChange={e => setCustomer(e.target.value)} className={WA_INP}>
              <option value="">Select a customer…</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
        {customers.length === 0 && <p className="text-xs text-[var(--color-muted)]">No invoices yet - nothing to build a statement from.</p>}
      </div>

      {customer && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Invoices", value: String(rows.length), color: "text-[var(--color-primary)]" },
              { label: "Outstanding", value: fc(outstanding), color: outstanding > 0 ? "text-red-400" : "text-green-400" },
              { label: "Settled", value: fc(paid), color: "text-green-400" },
              { label: "Total billed", value: fc(outstanding + paid), color: "text-[var(--color-text)]" },
            ].map(c => (
              <div key={c.label} className={WA_CARD}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className={`${WA_CARD} space-y-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)]">Statement preview</p>
            <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{statement}</pre>
            <WaSendButton text={statement} phone={phone} label="Send statement on WhatsApp" />
          </div>
        </>
      )}
    </div>
  );
}

// ── #181 WhatsApp Approval Actions ──────────────────────────────────────────
interface ApprovalItem {
  id: string;
  type: "invoice" | "payment" | "expense";
  reference: string;
  amount: number;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
}

function WaApprovalActions() {
  const [items, setItems] = useFeatureState<ApprovalItem[]>("wa-approvals", []);
  const [type, setType] = useState<ApprovalItem["type"]>("payment");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const fc = formatCurrency;

  const add = () => {
    const amt = parseFloat(amount);
    if (!reference.trim() || !amt || amt <= 0) { toast.error("Enter a reference and a positive amount"); return; }
    const row: ApprovalItem = {
      id: crypto.randomUUID(),
      type,
      reference: reference.trim(),
      amount: Math.round(amt),
      requestedBy: requestedBy.trim() || "Team",
      status: "pending",
    };
    setItems(prev => [row, ...prev]);
    setReference(""); setAmount(""); setRequestedBy("");
    toast.success("Approval request queued");
  };

  const setStatus = (id: string, status: ApprovalItem["status"]) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    toast.success(status === "approved" ? "Approved" : "Rejected");
  };

  const pending = items.filter(i => i.status === "pending");
  const pendingTotal = pending.reduce((s, i) => s + i.amount, 0);

  const requestMsg = (i: ApprovalItem) =>
    `*Approval needed* - ${i.type}\nRef: ${i.reference}\nAmount: ${fc(i.amount)}\nRequested by: ${i.requestedBy}\n\nReply *YES ${i.reference}* to approve or *NO ${i.reference}* to reject.`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CheckSquare size={15} className="text-green-400" />WhatsApp Approval Actions</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Queue invoices, payments or expenses for sign-off. Send the request to the approver on WhatsApp; record their YES/NO here.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as ApprovalItem["type"])} className={WA_INP}>
              <option value="payment">Payment</option>
              <option value="invoice">Invoice</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reference</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="PAY-104" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="85000" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Requested by</label>
            <input value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder="Priya (Ops)" className={WA_INP} />
          </div>
        </div>
        <button onClick={add} className="bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">Queue request</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Pending", value: String(pending.length), color: "text-orange-400" },
          { label: "Pending value", value: fc(pendingTotal), color: "text-[var(--color-primary)]" },
          { label: "Resolved", value: String(items.length - pending.length), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={WA_CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Type", "Reference", "Amount", "Requested by", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 capitalize">{i.type}</td>
                  <td className="px-4 py-2.5 font-medium">{i.reference}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fc(i.amount)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{i.requestedBy}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium capitalize ${i.status === "approved" ? "text-green-400" : i.status === "rejected" ? "text-red-400" : "text-orange-400"}`}>{i.status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <a href={waLink(requestMsg(i))} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"><Send size={12} />Send</a>
                      {i.status === "pending" && (
                        <>
                          <button onClick={() => setStatus(i.id, "approved")} className="text-xs text-green-400 hover:underline">Approve</button>
                          <button onClick={() => setStatus(i.id, "rejected")} className="text-xs text-red-400 hover:underline">Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #182 WhatsApp Broadcast / Campaign Composer ─────────────────────────────
// Personalised broadcast built from your customer list (derived from invoices).
// Pick a segment, write a message with {name} merge, send each one-by-one on
// WhatsApp (wa.me deep links - no bulk-send backend, stays WA-policy friendly).
type Segment = "all" | "outstanding" | "paid";
function WaBroadcastCampaign() {
  const { store } = useApp();
  const fc = formatCurrency;
  const invoices = store.invoices ?? [];
  const [segment, setSegment] = useState<Segment>("all");
  const [body, setBody] = useState("Hi {name}, we have a special update for you from " + (store.firm?.name ?? "us") + ". Reply *YES* to know more!");
  const [sent, setSent] = useState<Record<string, boolean>>({});

  // Roll invoices up to one row per customer with their outstanding balance.
  const customers = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach(i => {
      const out = i.status === "paid" ? 0 : i.amount;
      map.set(i.customer, (map.get(i.customer) ?? 0) + out);
    });
    return Array.from(map.entries()).map(([name, outstanding]) => ({ name, outstanding })).sort((a, b) => b.outstanding - a.outstanding);
  }, [invoices]);

  const recipients = customers.filter(c =>
    segment === "all" ? true : segment === "outstanding" ? c.outstanding > 0 : c.outstanding === 0,
  );

  const msgFor = (name: string) => body.replace(/\{name\}/g, name);

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Megaphone size={15} className="text-green-400" />WhatsApp Broadcast / Campaign Composer</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Write one message with a <code className="text-[var(--color-primary)]">{"{name}"}</code> merge tag, pick a segment of your customer list, and fire each personalised message off on WhatsApp. Track who you have sent to.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Segment</label>
            <select value={segment} onChange={e => setSegment(e.target.value as Segment)} className={WA_INP}>
              <option value="all">All customers</option>
              <option value="outstanding">With outstanding balance</option>
              <option value="paid">Fully paid (good payers)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Message ({"{name}"} = customer name)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className={`${WA_INP} resize-none`} />
          </div>
        </div>
        {customers.length === 0 && <p className="text-xs text-[var(--color-muted)]">No customers yet - invoices feed this list.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "In segment", value: String(recipients.length), color: "text-[var(--color-primary)]" },
          { label: "Sent", value: String(recipients.filter(r => sent[r.name]).length), color: "text-green-400" },
          { label: "Remaining", value: String(recipients.filter(r => !sent[r.name]).length), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className={WA_CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {recipients.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Outstanding", "Status", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recipients.map(r => (
                <tr key={r.name} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.outstanding > 0 ? fc(r.outstanding) : "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${sent[r.name] ? "text-green-400" : "text-[var(--color-muted)]"}`}>{sent[r.name] ? "Sent ✓" : "Pending"}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <a href={waLink(msgFor(r.name))} target="_blank" rel="noopener noreferrer"
                      onClick={() => { setSent(s => ({ ...s, [r.name]: true })); toast.success("Opening WhatsApp…"); }}
                      className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"><Send size={12} />Send</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Messages send one at a time via wa.me - keep broadcasts relevant to stay within WhatsApp's policy.</p>
    </div>
  );
}

// ── #183 WhatsApp Order-Status Update Sender ────────────────────────────────
const ORDER_STAGES = [
  { id: "confirmed", label: "Order confirmed",  emoji: "✅", line: "is confirmed and being prepared" },
  { id: "packed",    label: "Packed",            emoji: "📦", line: "has been packed and is ready" },
  { id: "shipped",   label: "Out for delivery",  emoji: "🚚", line: "is out for delivery" },
  { id: "delivered", label: "Delivered",         emoji: "🎉", line: "has been delivered - thank you" },
] as const;
function WaOrderStatus() {
  const { store } = useApp();
  const [customer, setCustomer] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [stage, setStage] = useState<(typeof ORDER_STAGES)[number]["id"]>("confirmed");
  const [eta, setEta] = useState("");
  const [phone, setPhone] = useState("");

  const s = ORDER_STAGES.find(x => x.id === stage)!;
  const message = `${s.emoji} Hi ${customer.trim() || "there"}, your order ${orderRef.trim() ? `*${orderRef.trim()}* ` : ""}${s.line}.${eta.trim() ? `\nExpected: ${eta.trim()}.` : ""}\n\nThank you for shopping with ${store.firm?.name ?? "us"}!`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PackageCheck size={15} className="text-green-400" />WhatsApp Order-Status Update</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Keep buyers in the loop. Pick a stage, add an ETA, and send a clean status update on WhatsApp in one tap.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma ji" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Order ref</label>
            <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="ORD-204" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stage</label>
            <select value={stage} onChange={e => setStage(e.target.value as typeof stage)} className={WA_INP}>
              {ORDER_STAGES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">ETA (optional)</label>
            <input value={eta} onChange={e => setEta(e.target.value)} placeholder="Today 6 PM" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ORDER_STAGES.map(o => (
          <button key={o.id} onClick={() => setStage(o.id)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors border ${stage === o.id ? "border-green-700 bg-green-950/30 text-green-400" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {o.emoji} {o.label}
          </button>
        ))}
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Send update on WhatsApp" />
      </div>
    </div>
  );
}

// ── #184 WhatsApp Payment-Confirmation Sender ───────────────────────────────
// Sends a branded "payment received" thank-you receipt; optionally clears the
// invoice against a known open invoice for the auto-filled amount + number.
function WaPaymentConfirm() {
  const { store } = useApp();
  const fc = formatCurrency;
  const invoices = store.invoices ?? [];
  const open = invoices.filter(i => i.status !== "paid");
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("UPI");
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");

  const inv = open.find(i => i.id === selected);
  const amt = inv ? inv.amount : parseFloat(amount) || 0;
  const customer = inv?.customer ?? "there";
  const today = new Date().toISOString().slice(0, 10);

  const message = `✅ *Payment received* - thank you, ${customer}!\n\n*Amount:* ${fc(amt)}\n*Mode:* ${mode}\n*Date:* ${today}\n${ref.trim() ? `*Ref:* ${ref.trim()}\n` : ""}${inv?.invoiceNumber ? `*Against invoice:* #${inv.invoiceNumber}\n` : ""}\nThis is your receipt from ${store.firm?.name ?? "us"}. We appreciate your business!`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BadgeCheck size={15} className="text-green-400" />WhatsApp Payment-Confirmation</h3>
        <p className="text-[11px] text-[var(--color-muted)]">When a customer pays, send an instant branded receipt + thank-you on WhatsApp. Link it to an open invoice to auto-fill the amount.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Against invoice (optional)</label>
            <select value={selected} onChange={e => { setSelected(e.target.value); setAmount(""); }} className={WA_INP}>
              <option value="">Manual amount…</option>
              {open.map(i => <option key={i.id} value={i.id}>{(i.invoiceNumber ? `#${i.invoiceNumber} · ` : "")}{i.customer} · {fc(i.amount)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={inv ? String(inv.amount) : amount} disabled={!!inv} onChange={e => setAmount(e.target.value)} placeholder="50000" className={`${WA_INP} disabled:opacity-60`} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)} className={WA_INP}>
              {["UPI", "Bank transfer", "Cash", "Cheque", "Card"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reference / UTR (optional)</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="UTR 4567..." className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Receipt preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Send receipt on WhatsApp" />
      </div>
    </div>
  );
}

// ── #185 WhatsApp Festive Greeting + Offer Composer ─────────────────────────
const FESTIVALS = [
  { id: "diwali",     name: "Diwali",            greet: "Wishing you a bright and prosperous Diwali" },
  { id: "holi",       name: "Holi",              greet: "A colourful and joyous Holi to you and family" },
  { id: "eid",        name: "Eid",               greet: "Eid Mubarak to you and your loved ones" },
  { id: "newyear",    name: "New Year",          greet: "Here's to a happy and prosperous New Year" },
  { id: "pongal",     name: "Pongal / Sankranti", greet: "Warm wishes on Pongal & Makar Sankranti" },
  { id: "ganesh",     name: "Ganesh Chaturthi",  greet: "Ganpati Bappa Morya! Blessings this Ganesh Chaturthi" },
] as const;
function WaFestiveOffer() {
  const { store } = useApp();
  const [fest, setFest] = useState<(typeof FESTIVALS)[number]["id"]>("diwali");
  const [offer, setOffer] = useState("Flat 15% off");
  const [code, setCode] = useState("FEST15");
  const [validTill, setValidTill] = useState("");

  const f = FESTIVALS.find(x => x.id === fest)!;
  const message = `🪔 *${f.name} Special* 🪔\n\n${f.greet}! 🎉\n\nAs a thank-you, enjoy *${offer.trim() || "a special offer"}*${code.trim() ? ` with code *${code.trim().toUpperCase()}*` : ""}.${validTill.trim() ? `\nValid till ${validTill.trim()}.` : ""}\n\nWarm wishes,\n${store.firm?.name ?? "Team"}`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><PartyPopper size={15} className="text-green-400" />WhatsApp Festive Greeting + Offer</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Combine a warm festival greeting with a promo code in one message - then send it to customers (pair with Broadcast for the whole list).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Festival</label>
            <select value={fest} onChange={e => setFest(e.target.value as typeof fest)} className={WA_INP}>
              {FESTIVALS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Offer</label>
            <input value={offer} onChange={e => setOffer(e.target.value)} placeholder="Flat 15% off" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Promo code</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="FEST15" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Valid till (optional)</label>
            <input value={validTill} onChange={e => setValidTill(e.target.value)} placeholder="30 Oct" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <div className="flex flex-wrap gap-2">
          <WaSendButton text={message} label="Send greeting on WhatsApp" />
          <button onClick={() => { navigator.clipboard.writeText(message).catch(() => {}); toast.success("Copied"); }}
            className="inline-flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text)] font-medium px-4 py-2 rounded-lg text-sm transition-colors"><Copy size={14} />Copy</button>
        </div>
      </div>
    </div>
  );
}

// ── #186 WhatsApp Catalog / Price-List Sharer ───────────────────────────────
interface PriceItem { id: string; name: string; price: number; unit: string; }
function WaPriceList() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [items, setItems] = useFeatureState<PriceItem[]>("wa-price-list", []);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [phone, setPhone] = useState("");

  const add = () => {
    const p = parseFloat(price);
    if (!name.trim() || !p || p <= 0) { toast.error("Enter an item and a positive price"); return; }
    setItems(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), price: Math.round(p), unit: unit.trim() }]);
    setName(""); setPrice(""); setUnit("");
    toast.success("Item added");
  };
  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const lines = items.map(i => `• ${i.name} - ${fc(i.price)}${i.unit ? ` / ${i.unit}` : ""}`).join("\n");
  const message = `*Price List - ${store.firm?.name ?? "us"}*\n\n${lines || "No items yet."}\n\n${store.firm?.gstNumber ? `GSTIN: ${store.firm.gstNumber}\n` : ""}Prices subject to change. Reply with what you'd like to order!`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Tag size={15} className="text-green-400" />WhatsApp Catalog / Price-List Sharer</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Build a saved price list once and share the whole catalogue on WhatsApp whenever a customer asks "what's your rate?". Items sync across devices.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Basmati rice" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Price (₹)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="120" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Unit (optional)</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="kg" className={WA_INP} />
          </div>
          <div className="flex items-end">
            <button onClick={add} className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors">Add item</button>
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Item", "Price", "Unit", ""].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{i.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fc(i.price)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted)]">{i.unit || "-"}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => remove(i.id)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:max-w-xs">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
          <div className={`${WA_CARD} space-y-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)]">Price-list preview</p>
            <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
            <WaSendButton text={message} phone={phone} label="Share price list on WhatsApp" />
          </div>
        </>
      )}
    </div>
  );
}

// ── #187 WhatsApp Feedback / Review Request Sender ──────────────────────────
function WaReviewRequest() {
  const { store } = useApp();
  const [customer, setCustomer] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [phone, setPhone] = useState("");
  const stars = "⭐⭐⭐⭐⭐";

  const message = `Hi ${customer.trim() || "there"}, thank you for choosing ${store.firm?.name ?? "us"}! 🙏\n\nWe'd love your honest feedback - it helps us serve you better.\n${stars}\n${reviewUrl.trim() ? `\nLeave a quick review here: ${reviewUrl.trim()}\n` : "\nReply with a rating from 1 to 5 and a line on how we did.\n"}\nThank you for your time!`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Star size={15} className="text-green-400" />WhatsApp Feedback / Review Request</h3>
        <p className="text-[11px] text-[var(--color-muted)]">After a sale, ask for a rating or a Google review on WhatsApp. Drop in your review link, or collect a quick 1-5 reply.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Mehta ji" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Review link (optional)</label>
            <input value={reviewUrl} onChange={e => setReviewUrl(e.target.value)} placeholder="https://g.page/r/…" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Request review on WhatsApp" />
      </div>
    </div>
  );
}

// ── #188 WhatsApp Click-to-Chat Link & QR Generator ─────────────────────────
// Builds a wa.me link with a pre-filled greeting your customers can tap from a
// poster, bill, or website. QR is rendered via a public QR image endpoint.
function WaChatLinkQr() {
  const { store } = useApp();
  const [phone, setPhone] = useState("");
  const [greeting, setGreeting] = useState(`Hi ${store.firm?.name ?? "there"}, I'd like to know more about your products.`);

  const digits = phone.replace(/\D/g, "");
  const valid = digits.length >= 10;
  const link = valid ? waLink(greeting, digits) : "";
  const qrSrc = valid ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}` : "";

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><QrCode size={15} className="text-green-400" />WhatsApp Click-to-Chat Link & QR</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Generate a tap-to-chat link (and printable QR) that opens your WhatsApp with a message already typed - perfect for invoices, posters, and shop signage.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your WhatsApp number (with country code)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pre-filled greeting</label>
            <input value={greeting} onChange={e => setGreeting(e.target.value)} className={WA_INP} />
          </div>
        </div>
        {!valid && <p className="text-xs text-[var(--color-muted)]">Enter a 10+ digit number (e.g. 9198XXXXXXXX) to generate the link.</p>}
      </div>

      {valid && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`${WA_CARD} space-y-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)]">Your click-to-chat link</p>
            <p className="text-xs break-all bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 font-mono text-[var(--color-primary)]">{link}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { navigator.clipboard.writeText(link).catch(() => {}); toast.success("Link copied"); }}
                className="inline-flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text)] font-medium px-4 py-2 rounded-lg text-sm transition-colors"><Copy size={14} />Copy link</button>
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"><Send size={14} />Test open</a>
            </div>
          </div>
          <div className={`${WA_CARD} flex flex-col items-center gap-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)] self-start">Printable QR</p>
            <img src={qrSrc} alt="WhatsApp chat QR code" width={180} height={180} className="rounded-lg bg-white p-2" />
            <a href={qrSrc} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-green-400 hover:underline"><QrCode size={12} />Open QR full size</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── #189 WhatsApp GST Invoice Share (tax-split breakup) ─────────────────────
// Picks an open invoice and builds a GST-compliant message: taxable value +
// CGST/SGST (intra-state) or IGST (inter-state) split derived from firm.gstRate.
function WaGstInvoiceShare() {
  const { store } = useApp();
  const fc = formatCurrency;
  const invoices = store.invoices ?? [];
  const [selected, setSelected] = useState("");
  const [interState, setInterState] = useState(false);
  const [phone, setPhone] = useState("");

  const inv = invoices.find(i => i.id === selected);
  const rate = store.firm?.gstRate ?? 18;
  // Invoice amount is treated as GST-inclusive; back out the taxable value.
  const gross = inv ? inv.amount : 0;
  const taxable = Math.round(gross / (1 + rate / 100));
  const taxTotal = gross - taxable;
  const half = Math.round(taxTotal / 2);

  const taxLines = interState
    ? `*IGST @ ${rate}%:* ${fc(taxTotal)}\n`
    : `*CGST @ ${rate / 2}%:* ${fc(half)}\n*SGST @ ${rate / 2}%:* ${fc(taxTotal - half)}\n`;

  const message = inv
    ? `*Tax Invoice* - ${store.firm?.name ?? "us"}\n${store.firm?.gstNumber ? `GSTIN: ${store.firm.gstNumber}\n` : ""}\nBill to: ${inv.customer}\n${inv.invoiceNumber ? `Invoice: #${inv.invoiceNumber}\n` : ""}Date: ${inv.invoiceDate}\n${inv.description ? `For: ${inv.description}\n` : ""}\n*Taxable value:* ${fc(taxable)}\n${taxLines}*Total payable:* ${fc(gross)}\n\nReply *PAID* once settled. Thank you!`
    : "";

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><ReceiptIndianRupee size={15} className="text-green-400" />WhatsApp GST Invoice Share</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Pick an invoice and send a GST-compliant breakup - taxable value plus CGST/SGST (or IGST inter-state) split from your firm's GST rate.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice</label>
            <select value={selected} onChange={e => setSelected(e.target.value)} className={WA_INP}>
              <option value="">Select an invoice…</option>
              {invoices.map(i => (
                <option key={i.id} value={i.id}>{(i.invoiceNumber ? `#${i.invoiceNumber} · ` : "")}{i.customer} · {fc(i.amount)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input type="checkbox" checked={interState} onChange={e => setInterState(e.target.checked)} className="accent-green-700" />
          Inter-state supply (use IGST instead of CGST + SGST)
        </label>
        {invoices.length === 0 && <p className="text-xs text-[var(--color-muted)]">No invoices yet - create one in the Invoices page first.</p>}
        {!store.firm?.gstNumber && inv && <p className="text-xs text-orange-400">No GSTIN saved in firm settings - add one for a fully compliant invoice.</p>}
      </div>

      {inv && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Taxable value", value: fc(taxable), color: "text-[var(--color-text)]" },
              { label: `Tax @ ${rate}%`, value: fc(taxTotal), color: "text-orange-400" },
              { label: "Total payable", value: fc(gross), color: "text-[var(--color-primary)]" },
              { label: "Split", value: interState ? "IGST" : "CGST+SGST", color: "text-[var(--color-muted)]" },
            ].map(c => (
              <div key={c.label} className={WA_CARD}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className={`${WA_CARD} space-y-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)]">Invoice preview</p>
            <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
            <WaSendButton text={message} phone={phone} label="Send GST invoice on WhatsApp" />
          </div>
        </>
      )}
    </div>
  );
}

// ── #190 WhatsApp COD-Order Confirmation Sender ─────────────────────────────
// Confirms a cash-on-delivery order with the amount to keep ready and a
// dispatch line - reduces COD refusals at the door.
function WaCodConfirm() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [customer, setCustomer] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [eta, setEta] = useState("");
  const [phone, setPhone] = useState("");

  const amt = parseFloat(amount) || 0;
  const message = `🚚 *COD Order Confirmed*\n\nHi ${customer.trim() || "there"}, your order ${orderRef.trim() ? `*${orderRef.trim()}* ` : ""}is confirmed for *Cash on Delivery*.\n\n*Amount to keep ready:* ${fc(amt)}\n${address.trim() ? `*Delivery to:* ${address.trim()}\n` : ""}${eta.trim() ? `*Expected:* ${eta.trim()}\n` : ""}\nPlease keep the exact amount handy. Reply *CONFIRM* to lock the order or *CHANGE* to edit. - ${store.firm?.name ?? "us"}`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Truck size={15} className="text-green-400" />WhatsApp COD-Order Confirmation</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Cut COD refusals - confirm the order, the exact cash to keep ready, and the delivery window on WhatsApp before you dispatch.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma ji" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Order ref</label>
            <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="ORD-204" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">COD amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1499" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">ETA (optional)</label>
            <input value={eta} onChange={e => setEta(e.target.value)} placeholder="Tomorrow 11 AM-2 PM" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Delivery address (optional)</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Flat 4B, Green Park" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Send COD confirmation" />
      </div>
    </div>
  );
}

// ── #191 WhatsApp Service / AMC Renewal Reminder ────────────────────────────
// Durable list of upcoming service/AMC/renewal dates; flags what's due and
// sends a renewal nudge on WhatsApp.
interface ServiceReminder {
  id: string;
  customer: string;
  service: string;
  dueDate: string;
  amount: number;
}
function WaServiceReminder() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [rows, setRows] = useFeatureState<ServiceReminder[]>("wa-service-reminders", []);
  const [customer, setCustomer] = useState("");
  const [service, setService] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!customer.trim() || !service.trim() || !dueDate) { toast.error("Enter customer, service and a due date"); return; }
    setRows(prev => [{ id: crypto.randomUUID(), customer: customer.trim(), service: service.trim(), dueDate, amount: Math.round(amt) }, ...prev]);
    setCustomer(""); setService(""); setDueDate(""); setAmount("");
    toast.success("Reminder saved");
  };
  const remove = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const withDays = useMemo(() =>
    rows
      .map(r => ({ ...r, days: Math.round((new Date(r.dueDate).getTime() - today.getTime()) / 86_400_000) }))
      .sort((a, b) => a.days - b.days),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows]);

  const dueSoon = withDays.filter(r => r.days <= 30 && r.days >= -30).length;

  const msgFor = (r: ServiceReminder & { days: number }) => {
    const when = r.days < 0 ? `was due ${Math.abs(r.days)} day(s) ago` : r.days === 0 ? "is due today" : `is due in ${r.days} day(s) (${r.dueDate})`;
    return `Hi ${r.customer}, a reminder that your *${r.service}* ${when}.${r.amount > 0 ? `\nRenewal amount: ${fc(r.amount)}.` : ""}\n\nReply *RENEW* and we'll take care of it. - ${store.firm?.name ?? "us"}`;
  };

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={15} className="text-green-400" />WhatsApp Service / AMC Renewal Reminder</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Track AMCs, subscriptions and service due-dates. Headroom flags what's coming up and sends a one-tap renewal nudge on WhatsApp. Saved across devices.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Mehta Corp" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Service / AMC</label>
            <input value={service} onChange={e => setService(e.target.value)} placeholder="AC AMC" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Due date</label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹, optional)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="2500" className={WA_INP} />
          </div>
          <div className="flex items-end">
            <button onClick={add} className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors">Add</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Tracked", value: String(rows.length), color: "text-[var(--color-primary)]" },
          { label: "Due ±30 days", value: String(dueSoon), color: "text-orange-400" },
          { label: "Renewal value", value: fc(rows.reduce((s, r) => s + r.amount, 0)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={WA_CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {withDays.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Service", "Due", "When", "Amount", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withDays.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                  <td className="px-4 py-2.5">{r.service}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.dueDate}</td>
                  <td className={`px-4 py-2.5 text-xs ${r.days < 0 ? "text-red-400" : r.days <= 30 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{r.days < 0 ? `${Math.abs(r.days)}d overdue` : r.days === 0 ? "Due today" : `in ${r.days}d`}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.amount > 0 ? fc(r.amount) : "-"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <a href={waLink(msgFor(r))} target="_blank" rel="noopener noreferrer" onClick={() => toast.success("Opening WhatsApp…")} className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"><Send size={12} />Remind</a>
                      <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #192 WhatsApp Loyalty-Points Update Sender ──────────────────────────────
// Durable per-customer points balances; add/redeem points and send the updated
// balance on WhatsApp.
interface LoyaltyMember {
  id: string;
  name: string;
  points: number;
}
function WaLoyaltyPoints() {
  const { store } = useApp();
  const [members, setMembers] = useFeatureState<LoyaltyMember[]>("wa-loyalty-members", []);
  const [name, setName] = useState("");
  const [delta, setDelta] = useState("");
  const [phone, setPhone] = useState("");

  const apply = (sign: 1 | -1) => {
    const d = Math.round(parseFloat(delta) || 0);
    if (!name.trim() || d <= 0) { toast.error("Enter a customer and a positive points value"); return; }
    setMembers(prev => {
      const existing = prev.find(m => m.name.toLowerCase() === name.trim().toLowerCase());
      const next = Math.max(0, (existing?.points ?? 0) + sign * d);
      if (existing) return prev.map(m => m.id === existing.id ? { ...m, points: next } : m);
      return [{ id: crypto.randomUUID(), name: name.trim(), points: next }, ...prev];
    });
    setDelta("");
    toast.success(sign > 0 ? `+${d} points added` : `${d} points redeemed`);
  };
  const remove = (id: string) => setMembers(prev => prev.filter(m => m.id !== id));

  const total = members.reduce((s, m) => s + m.points, 0);
  const msgFor = (m: LoyaltyMember) =>
    `🎁 Hi ${m.name}, your ${store.firm?.name ?? "loyalty"} points balance is now *${m.points}*.\n\nKeep shopping to earn more - redeem points against your next purchase. Thank you for being a valued customer!`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gift size={15} className="text-green-400" />WhatsApp Loyalty-Points Update</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Run a simple loyalty programme - add or redeem points per customer and text them their updated balance on WhatsApp. Balances saved across devices.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Sharma ji" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Points</label>
            <input type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="50" className={WA_INP} />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => apply(1)} className="flex-1 bg-green-700 hover:bg-green-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors">Add</button>
            <button onClick={() => apply(-1)} className="flex-1 border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text)] font-medium py-2 rounded-lg text-sm transition-colors">Redeem</button>
          </div>
        </div>
        <div className="md:max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Default WhatsApp number (optional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Members", value: String(members.length), color: "text-[var(--color-primary)]" },
          { label: "Points outstanding", value: String(total), color: "text-green-400" },
          { label: "Top balance", value: String(members.reduce((m, x) => Math.max(m, x.points), 0)), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className={WA_CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {members.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Points", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{m.name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-green-400 font-bold">{m.points}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <a href={waLink(msgFor(m), phone)} target="_blank" rel="noopener noreferrer" onClick={() => toast.success("Opening WhatsApp…")} className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"><Send size={12} />Send balance</a>
                      <button onClick={() => remove(m.id)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #193 WhatsApp Quick-Reply Snippet Library ───────────────────────────────
// Durable library of saved canned replies (with a {firm} merge); copy or send
// any snippet on WhatsApp in one tap.
interface Snippet { id: string; title: string; body: string; }
const DEFAULT_SNIPPETS: Snippet[] = [
  { id: "hours",   title: "Business hours", body: "Hi! We're open Mon-Sat, 10 AM-8 PM. How can we help you today? - {firm}" },
  { id: "payment", title: "Payment details", body: "You can pay via UPI to {firm}@upi or scan the QR we shared. Reply *PAID* with the UTR once done. Thank you!" },
  { id: "thanks",  title: "Thank you", body: "Thank you for your order with {firm}! 🙏 We'll keep you posted on the status. Reach out any time." },
];
function WaQuickReplies() {
  const { store } = useApp();
  const firm = store.firm?.name ?? "us";
  const [snippets, setSnippets] = useFeatureState<Snippet[]>("wa-quick-replies", DEFAULT_SNIPPETS);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [phone, setPhone] = useState("");

  const add = () => {
    if (!title.trim() || !body.trim()) { toast.error("Enter a title and a message"); return; }
    setSnippets(prev => [{ id: crypto.randomUUID(), title: title.trim(), body: body.trim() }, ...prev]);
    setTitle(""); setBody("");
    toast.success("Snippet saved");
  };
  const remove = (id: string) => setSnippets(prev => prev.filter(s => s.id !== id));
  const render = (s: Snippet) => s.body.replace(/\{firm\}/g, firm);

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquareText size={15} className="text-green-400" />WhatsApp Quick-Reply Snippet Library</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Save your most-used replies once (use <code className="text-[var(--color-primary)]">{"{firm}"}</code> for your business name) and fire any of them on WhatsApp in one tap. Synced across devices.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Delivery delay" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Message ({"{firm}"} = your name)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} className={`${WA_INP} resize-none`} placeholder="Hi, your order from {firm} is slightly delayed…" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button onClick={add} className="bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">Save snippet</button>
          <div className="md:max-w-xs">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Default WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      {snippets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {snippets.map(s => (
            <div key={s.id} className={`${WA_CARD} space-y-2`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{s.title}</p>
                <button onClick={() => remove(s.id)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors shrink-0"><Trash2 size={13} /></button>
              </div>
              <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">{render(s)}</pre>
              <div className="flex flex-wrap gap-2">
                <WaSendButton text={render(s)} phone={phone} label="Send" />
                <button onClick={() => { navigator.clipboard.writeText(render(s)).catch(() => {}); toast.success("Copied"); }}
                  className="inline-flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text)] font-medium px-4 py-2 rounded-lg text-sm transition-colors"><Copy size={14} />Copy</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #194 WhatsApp New-Product Launch Announcement ───────────────────────────
// Composes a launch message (product, price, launch-offer) to share with
// customers - pair with Broadcast to reach the whole list.
function WaProductLaunch() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [product, setProduct] = useState("");
  const [tagline, setTagline] = useState("");
  const [price, setPrice] = useState("");
  const [launchOffer, setLaunchOffer] = useState("");
  const [phone, setPhone] = useState("");

  const p = parseFloat(price) || 0;
  const message = `🚀 *Now Launching: ${product.trim() || "our new product"}*\n${tagline.trim() ? `${tagline.trim()}\n` : ""}\n${p > 0 ? `*Price:* ${fc(p)}\n` : ""}${launchOffer.trim() ? `*Launch offer:* ${launchOffer.trim()}\n` : ""}\nReply *INTERESTED* and we'll share full details. - ${store.firm?.name ?? "us"}`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Rocket size={15} className="text-green-400" />WhatsApp New-Product Launch</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Announce a new product or service with a price and launch offer in one polished message - then share it (use Broadcast for the whole list).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Product / service</label>
            <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Cold-pressed oils" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Price (₹, optional)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="299" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Launch offer (optional)</label>
            <input value={launchOffer} onChange={e => setLaunchOffer(e.target.value)} placeholder="20% off first week" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tagline (optional)</label>
            <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Pure, chemical-free, farm-fresh." className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <div className="flex flex-wrap gap-2">
          <WaSendButton text={message} phone={phone} label="Announce on WhatsApp" />
          <button onClick={() => { navigator.clipboard.writeText(message).catch(() => {}); toast.success("Copied"); }}
            className="inline-flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text)] font-medium px-4 py-2 rounded-lg text-sm transition-colors"><Copy size={14} />Copy</button>
        </div>
      </div>
    </div>
  );
}

// ── #195 WhatsApp Customer Win-Back Sender ──────────────────────────────────
// Finds customers with no invoice in the last N days (lapsed) and sends a
// "we miss you" win-back nudge with an optional comeback offer.
function WaWinBack() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [days, setDays] = useState("60");
  const [offer, setOffer] = useState("10% off your next order");
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const threshold = Math.max(1, parseInt(days, 10) || 60);
  const cutoff = Date.now() - threshold * 86_400_000;

  // Roll invoices up to last-activity per customer; lapsed = newest invoice older than cutoff.
  const lapsed = useMemo(() => {
    const last = new Map<string, number>();
    invoices.forEach(i => {
      const t = new Date(i.invoiceDate).getTime();
      if (!Number.isNaN(t)) last.set(i.customer, Math.max(last.get(i.customer) ?? 0, t));
    });
    return Array.from(last.entries())
      .filter(([, t]) => t < cutoff)
      .map(([name, t]) => ({ name, days: Math.round((Date.now() - t) / 86_400_000) }))
      .sort((a, b) => b.days - a.days);
  }, [invoices, cutoff]);

  const msgFor = (name: string) =>
    `Hi ${name}, we've missed you at ${store.firm?.name ?? "our shop"}! 👋\n\nIt's been a while - come back and enjoy *${offer.trim() || "a special welcome-back offer"}*.\n\nReply *YES* and we'll set it up for you. Hope to see you soon!`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserPlus size={15} className="text-green-400" />WhatsApp Customer Win-Back</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Spot customers who haven't bought in a while (from your invoice history) and send each a personalised "we miss you" message with a comeback offer.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Lapsed after (days)</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} placeholder="60" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Comeback offer</label>
            <input value={offer} onChange={e => setOffer(e.target.value)} placeholder="10% off your next order" className={WA_INP} />
          </div>
        </div>
        {invoices.length === 0 && <p className="text-xs text-[var(--color-muted)]">No invoices yet - invoice history feeds this list.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Lapsed customers", value: String(lapsed.length), color: "text-orange-400" },
          { label: "Reached out", value: String(lapsed.filter(c => sent[c.name]).length), color: "text-green-400" },
          { label: "Remaining", value: String(lapsed.filter(c => !sent[c.name]).length), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={WA_CARD}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {lapsed.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Last seen", "Status", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lapsed.map(c => (
                <tr key={c.name} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{c.days}d ago</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${sent[c.name] ? "text-green-400" : "text-[var(--color-muted)]"}`}>{sent[c.name] ? "Sent ✓" : "Pending"}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <a href={waLink(msgFor(c.name))} target="_blank" rel="noopener noreferrer"
                      onClick={() => { setSent(s => ({ ...s, [c.name]: true })); toast.success("Opening WhatsApp…"); }}
                      className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"><Send size={12} />Win back</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : invoices.length > 0 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm font-bold text-green-400">✓ No lapsed customers in this window - everyone's active.</p>
        </div>
      )}
    </div>
  );
}

// ── #196 WhatsApp Appointment / Visit Reminder ──────────────────────────────
function WaAppointmentReminder() {
  const { store } = useApp();
  const [customer, setCustomer] = useState("");
  const [purpose, setPurpose] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");

  const when = [date.trim(), time.trim()].filter(Boolean).join(" at ");
  const message = `📅 Hi ${customer.trim() || "there"}, this is a reminder for your ${purpose.trim() || "appointment"}${when ? ` on *${when}*` : ""}.${location.trim() ? `\n*Where:* ${location.trim()}` : ""}\n\nReply *CONFIRM* to confirm or *RESCHEDULE* if the time doesn't work. See you then! - ${store.firm?.name ?? "us"}`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarCheck size={15} className="text-green-400" />WhatsApp Appointment / Visit Reminder</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Cut no-shows - send a clear reminder for a booking, site visit or service call with a one-tap confirm / reschedule prompt.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Mehta ji" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="site visit" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Time (optional)</label>
            <input value={time} onChange={e => setTime(e.target.value)} placeholder="11:30 AM" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Location (optional)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Shop, MG Road" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Send reminder on WhatsApp" />
      </div>
    </div>
  );
}

// ── #197 WhatsApp Referral-Ask Sender ───────────────────────────────────────
function WaReferralAsk() {
  const { store } = useApp();
  const [customer, setCustomer] = useState("");
  const [reward, setReward] = useState("₹100 off for both of you");
  const [link, setLink] = useState("");
  const [phone, setPhone] = useState("");

  const message = `Hi ${customer.trim() || "there"}, glad you're enjoying ${store.firm?.name ?? "us"}! 🙌\n\nKnow someone who'd love us too? Refer a friend and ${reward.trim() ? `*${reward.trim()}*` : "you both get a reward"}.${link.trim() ? `\n\nShare this link: ${link.trim()}` : "\n\nJust reply with their name and number and we'll take it from there."}\n\nThank you for spreading the word!`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Share2 size={15} className="text-green-400" />WhatsApp Referral-Ask</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Turn happy customers into referrers - ask for a referral with a clear reward and an optional share link, in one tap on WhatsApp.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Sharma ji" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Referral reward</label>
            <input value={reward} onChange={e => setReward(e.target.value)} placeholder="₹100 off for both of you" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Referral link (optional)</label>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://…/refer" className={WA_INP} />
          </div>
          <div className="md:col-span-3 md:max-w-xs">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Ask for referral on WhatsApp" />
      </div>
    </div>
  );
}

// ── #198 WhatsApp Installment / Payment-Plan Offer ──────────────────────────
function WaPaymentPlan() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [customer, setCustomer] = useState("");
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("3");
  const [start, setStart] = useState("");
  const [phone, setPhone] = useState("");

  const totalAmt = Math.max(0, Math.round(parseFloat(total) || 0));
  const n = Math.max(1, Math.min(12, parseInt(count, 10) || 1));
  const base = Math.floor(totalAmt / n);
  const installments = useMemo(() => {
    if (totalAmt <= 0) return [] as { label: string; amount: number; due: string }[];
    const startDate = start ? new Date(start) : new Date();
    return Array.from({ length: n }, (_, idx) => {
      const due = new Date(startDate);
      due.setMonth(due.getMonth() + idx);
      const amount = idx === n - 1 ? totalAmt - base * (n - 1) : base;
      return { label: `Instalment ${idx + 1}/${n}`, amount, due: due.toISOString().slice(0, 10) };
    });
  }, [totalAmt, n, base, start]);

  const planLines = installments.map(i => `• ${i.label}: ${fc(i.amount)} by ${i.due}`).join("\n");
  const message = totalAmt > 0
    ? `Hi ${customer.trim() || "there"}, to make it easier we can split *${fc(totalAmt)}* into *${n}* monthly instalments:\n\n${planLines}\n\nReply *ACCEPT* to confirm this plan, or suggest dates that suit you. - ${store.firm?.name ?? "us"}`
    : "";

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarRange size={15} className="text-green-400" />WhatsApp Installment / Payment-Plan Offer</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Turn a big overdue or large order into an easy monthly plan. Headroom splits the amount evenly, dates each instalment, and sends the offer for a one-word ACCEPT.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Reddy ji" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total amount (₹)</label>
            <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="60000" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Instalments (1-12)</label>
            <input type="number" value={count} onChange={e => setCount(e.target.value)} placeholder="3" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">First due (optional)</label>
            <DatePicker value={start} onChange={setStart} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      {installments.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Total", value: fc(totalAmt), color: "text-[var(--color-primary)]" },
              { label: "Per month", value: fc(base), color: "text-green-400" },
              { label: "Instalments", value: String(n), color: "text-[var(--color-text)]" },
            ].map(c => (
              <div key={c.label} className={WA_CARD}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className={`${WA_CARD} space-y-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
            <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
            <WaSendButton text={message} phone={phone} label="Send plan on WhatsApp" />
          </div>
        </>
      )}
    </div>
  );
}

// ── #199 WhatsApp Quotation Builder ─────────────────────────────────────────
interface QuoteLine { id: string; item: string; qty: number; rate: number; }

function WaQuotationBuilder() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [customer, setCustomer] = useState("");
  const [gst, setGst] = useState("18");
  const [phone, setPhone] = useState("");

  const add = () => {
    const q = parseFloat(qty), r = parseFloat(rate);
    if (!item.trim() || !q || q <= 0 || !r || r < 0) { toast.error("Enter an item, quantity and rate"); return; }
    setLines(prev => [...prev, { id: crypto.randomUUID(), item: item.trim(), qty: q, rate: Math.round(r) }]);
    setItem(""); setQty("1"); setRate("");
  };
  const remove = (id: string) => setLines(prev => prev.filter(l => l.id !== id));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const gstRate = Math.max(0, parseFloat(gst) || 0);
  const tax = Math.round(subtotal * gstRate / 100);
  const grand = subtotal + tax;

  const body = lines.map(l => `• ${l.item} - ${l.qty} × ${fc(l.rate)} = ${fc(l.qty * l.rate)}`).join("\n");
  const message = lines.length > 0
    ? `*Quotation from ${store.firm?.name ?? "us"}*\n${customer.trim() ? `For: ${customer.trim()}\n` : ""}Date: ${new Date().toISOString().slice(0, 10)}\n\n${body}\n\n*Subtotal:* ${fc(subtotal)}\n*GST @ ${gstRate}%:* ${fc(tax)}\n*Total:* ${fc(grand)}\n\nReply *ACCEPT* to confirm this quote and we'll raise the invoice.`
    : "";

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileSignature size={15} className="text-green-400" />WhatsApp Quotation Builder</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Build a line-item quote on the move, add GST, and send a clean total to the customer on WhatsApp for a one-word ACCEPT.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer (optional)</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Mehta Corp" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GST %</label>
            <input type="number" value={gst} onChange={e => setGst(e.target.value)} placeholder="18" className={WA_INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Item</label>
            <input value={item} onChange={e => setItem(e.target.value)} placeholder="Office chair" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Qty</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="1" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rate (₹)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="4500" className={WA_INP} />
          </div>
          <button onClick={add} className="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors">Add line</button>
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Item", "Qty", "Rate", "Line total", ""].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5">{l.item}</td>
                    <td className="px-4 py-2.5 tabular-nums">{l.qty}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fc(l.rate)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fc(l.qty * l.rate)}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Subtotal", value: fc(subtotal), color: "text-[var(--color-text)]" },
              { label: `GST @ ${gstRate}%`, value: fc(tax), color: "text-[var(--color-muted)]" },
              { label: "Grand total", value: fc(grand), color: "text-[var(--color-primary)]" },
            ].map(c => (
              <div key={c.label} className={WA_CARD}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className={`${WA_CARD} space-y-3`}>
            <p className="text-xs font-semibold text-[var(--color-muted)]">Quote preview</p>
            <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
            <WaSendButton text={message} phone={phone} label="Send quote on WhatsApp" />
          </div>
        </>
      )}
    </div>
  );
}

// ── #200 WhatsApp Document / KYC Request ────────────────────────────────────
const KYC_DOCS = [
  { id: "pan",     label: "PAN card" },
  { id: "gstin",   label: "GSTIN certificate" },
  { id: "aadhaar", label: "Aadhaar (front & back)" },
  { id: "bank",    label: "Cancelled cheque / bank proof" },
  { id: "address", label: "Business address proof" },
  { id: "photo",   label: "Shop / signboard photo" },
];

function WaDocRequest() {
  const { store } = useApp();
  const [customer, setCustomer] = useState("");
  const [picked, setPicked] = useState<string[]>(["pan", "gstin"]);
  const [phone, setPhone] = useState("");

  const toggle = (id: string) => setPicked(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const chosen = KYC_DOCS.filter(d => picked.includes(d.id));
  const list = chosen.map((d, i) => `${i + 1}. ${d.label}`).join("\n");
  const message = chosen.length > 0
    ? `Hi ${customer.trim() || "there"}, to complete your onboarding with ${store.firm?.name ?? "us"} please reply to this chat with photos/PDFs of:\n\n${list}\n\nJust attach each document here - your data stays private and is used only for verification. Thank you!`
    : "";

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FolderInput size={15} className="text-green-400" />WhatsApp Document / KYC Request</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Stop chasing KYC over calls and email. Tick the documents you need, and send the customer a single tidy checklist to reply with on WhatsApp.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="New supplier" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {KYC_DOCS.map(d => (
            <button key={d.id} onClick={() => toggle(d.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${picked.includes(d.id) ? "bg-green-700 text-white border-green-600" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {chosen.length > 0 && (
        <div className={`${WA_CARD} space-y-3`}>
          <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview · {chosen.length} document(s)</p>
          <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
          <WaSendButton text={message} phone={phone} label="Request documents on WhatsApp" />
        </div>
      )}
    </div>
  );
}

// ── #201 WhatsApp Customer Onboarding Form ──────────────────────────────────
function WaOnboardingForm() {
  const { store } = useApp();
  const [name, setName] = useState("");
  const [welcome, setWelcome] = useState(true);
  const [phone, setPhone] = useState("");
  const fields = [
    "Full / business name",
    "GSTIN (if registered)",
    "Billing address with PIN",
    "Contact person & mobile",
    "Email for invoices",
  ];

  const ask = fields.map((f, i) => `${i + 1}. ${f}`).join("\n");
  const message = `${welcome ? `🙏 Welcome to ${store.firm?.name ?? "us"}, ${name.trim() || "and thank you for choosing us"}!\n\n` : ""}To set up your account, please reply with:\n\n${ask}\n\nYou can send it all in one message - we'll do the rest and confirm once you're set up. 🚀`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserCheck size={15} className="text-green-400" />WhatsApp Customer Onboarding</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Self-serve onboarding without losing the first order - send new customers a guided checklist to capture name, GSTIN and address right inside the chat.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Sharma Traders" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] cursor-pointer">
          <input type="checkbox" checked={welcome} onChange={e => setWelcome(e.target.checked)} className="accent-green-600" />
          Include a warm welcome line
        </label>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Send onboarding on WhatsApp" />
      </div>
    </div>
  );
}

// ── #202 WhatsApp Feedback / CSAT Collector ─────────────────────────────────
function WaFeedbackCollector() {
  const { store } = useApp();
  const [customer, setCustomer] = useState("");
  const [ref, setRef] = useState("");
  const [scale, setScale] = useState<"5" | "10">("5");
  const [phone, setPhone] = useState("");

  const max = scale === "5" ? 5 : 10;
  const message = `Hi ${customer.trim() || "there"}, thanks for choosing ${store.firm?.name ?? "us"}${ref.trim() ? ` (order ${ref.trim()})` : ""}! 🙌\n\nHow was your experience? Reply with a number from *1* (poor) to *${max}* (excellent).\n\nIf anything fell short, tell us in a line - we read every reply and will make it right.`;

  return (
    <div className="space-y-4">
      <div className={`${WA_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><SmilePlus size={15} className="text-green-400" />WhatsApp Feedback / CSAT Collector</h3>
        <p className="text-[11px] text-[var(--color-muted)]">Close the loop after a sale - send a quick rating ask on WhatsApp so complaints reach you directly instead of becoming silent churn.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Anita" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Order ref (optional)</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="ORD-204" className={WA_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rating scale</label>
            <select value={scale} onChange={e => setScale(e.target.value as "5" | "10")} className={WA_INP}>
              <option value="5">1-5 (CSAT)</option>
              <option value="10">1-10 (NPS)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer WhatsApp number (optional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9198XXXXXXXX" className={WA_INP} />
          </div>
        </div>
      </div>

      <div className={`${WA_CARD} space-y-3`}>
        <p className="text-xs font-semibold text-[var(--color-muted)]">Message preview</p>
        <pre className="text-xs whitespace-pre-wrap font-sans text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">{message}</pre>
        <WaSendButton text={message} phone={phone} label="Ask for feedback on WhatsApp" />
      </div>
    </div>
  );
}
