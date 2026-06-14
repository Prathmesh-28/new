import { useMemo, useState } from "react";
import { MessageCircle, Check, Bell, Zap, Phone, ArrowRight, Copy, RefreshCw, Sparkles, TrendingUp, AlertTriangle, CreditCard, ChevronDown, ChevronUp, Send, BellRing, PlusCircle, FileText, CheckSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { DEFAULT_WA_PREFS, type WhatsAppPreferences } from "@/data/types";

// Build a wa.me deep link that pre-fills a message (no backend call). If a
// recipient phone is supplied, it opens that chat; otherwise WhatsApp asks who.
function waLink(text: string, phone?: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

type WaTab = "overview" | "wa-invoice-pay" | "wa-reminder-bot" | "wa-sales-capture" | "wa-statement" | "wa-approvals";

// authFetch throws Error("<status>: <body>") — pull the server's {error} message out.
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
  { type: "action", text: "1. Chase Reddy Industries — ₹3.2L overdue 18d" },
  { type: "action", text: "2. TDS deposit due in 4 days — ₹41,000" },
  { type: "action", text: "3. Payroll ₹2.8L due Friday — buffer tight" },
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
    toast.success(`${alerts[key] ? "Muted" : "Enabled"} — saved to your morning brief`, { id: "wa-pref" });
  };

  const advanceChat = () => setChatStep(s => Math.min(s + 1, 2));

  const [tab, setTab] = useState<WaTab>("overview");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MessageCircle size={20} className="text-green-400" />
          WhatsApp Channel
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Get your cash flow on WhatsApp — morning brief, instant alerts, and ask your numbers any time.
        </p>
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["overview", "Overview", MessageCircle],
          ["wa-invoice-pay", "Invoice & Pay", Send],
          ["wa-reminder-bot", "Reminder Bot", BellRing],
          ["wa-sales-capture", "Sales Capture", PlusCircle],
          ["wa-statement", "Statement", FileText],
          ["wa-approvals", "Approvals", CheckSquare],
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
                Connect WhatsApp
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
                  <ResponseBubble text="📈 30-day forecast: ₹14.2L → ₹19.8L (P50). Main driver: Mehta Corp payment expected Jun 22 (₹6.1L). Risk: Jun 30 payroll ₹2.8L — buffer ok." />
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
                { step: "2", title: "Get the morning digest", desc: "Every day at 9 AM — balance, top 3 actions, tax reminders." },
                { step: "3", title: "Ask anything, anytime", desc: "Reply CASH, FORECAST, OVERDUE — get answers in seconds." },
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
        {invoices.length === 0 && <p className="text-xs text-[var(--color-muted)]">No invoices yet — create one in the Invoices page first.</p>}
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
  { id: "urgent", daysOverdue: 15, tone: "Urgent — final notice" },
];

function buildReminder(tier: ReminderTier, customer: string, amount: number, days: number, firmName: string): string {
  const fc = formatCurrency;
  if (tier.id === "gentle")
    return `Hi ${customer}, a friendly reminder that ${fc(amount)} is now ${days} day(s) overdue. Could you process it when convenient? Thanks — ${firmName}.`;
  if (tier.id === "firm")
    return `Hi ${customer}, our records show ${fc(amount)} is ${days} days overdue. Please arrange payment at the earliest. Let us know if there's an issue. — ${firmName}.`;
  return `Hi ${customer}, this is a final notice: ${fc(amount)} is ${days} days overdue. Kindly clear it within 48 hours to avoid late fees / further action. — ${firmName}.`;
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
          <p className="text-sm font-bold text-green-400">✓ No overdue invoices — nothing to chase.</p>
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
  const ownerMsg = `Sales booked (latest ${Math.min(sales.length, 10)}):\n${booked || "—"}\n\nToday: ${fc(todayTotal)} · All-time: ${fc(total)}`;

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
    .map(i => `• ${i.invoiceDate} ${i.invoiceNumber ? `#${i.invoiceNumber} ` : ""}${fc(i.amount)} — ${i.status}`)
    .join("\n");

  const statement = customer
    ? `*Statement of Account — ${customer}*\nFrom ${store.firm?.name ?? "us"}\n\n${lines || "No invoices on record."}\n\n*Outstanding:* ${fc(outstanding)}\n*Settled:* ${fc(paid)}\n\nReply *PAY* for a pay-link or *QUERY* to raise a dispute.`
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
        {customers.length === 0 && <p className="text-xs text-[var(--color-muted)]">No invoices yet — nothing to build a statement from.</p>}
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
    `*Approval needed* — ${i.type}\nRef: ${i.reference}\nAmount: ${fc(i.amount)}\nRequested by: ${i.requestedBy}\n\nReply *YES ${i.reference}* to approve or *NO ${i.reference}* to reject.`;

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
