import { useState } from "react";
import { MessageCircle, Check, Bell, Zap, Phone, ArrowRight, Copy, RefreshCw, Sparkles, TrendingUp, AlertTriangle, CreditCard, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

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
  const [alerts, setAlerts]     = useState<Record<string, boolean>>(
    Object.fromEntries(ALERT_TYPES.map(a => [a.id, a.default]))
  );
  const [showCommands, setShowCommands] = useState(false);
  const [chatStep, setChatStep] = useState(0);

  const connected = step === "done";

  const handleSendOtp = () => {
    if (!/^\d{10}$/.test(phone.replace(/\s/g, ""))) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setStep("otp");
    toast.success("OTP sent to +91 " + phone);
  };

  const handleVerifyOtp = () => {
    if (otp.length < 4) { toast.error("Enter the OTP"); return; }
    setStep("done");
    toast.success("WhatsApp connected! Your first digest arrives tomorrow at 9 AM.");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    toast.success("Copied");
  };

  const toggleAlert = (id: string) => setAlerts(a => ({ ...a, [id]: !a[id] }));

  const advanceChat = () => setChatStep(s => Math.min(s + 1, 2));

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
                  className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  Send OTP via WhatsApp →
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
                  className="w-full bg-green-700 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  Verify & Connect
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
                  onClick={() => setStep("phone")}
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
                    className={`w-10 h-5 rounded-full transition-colors shrink-0 relative ${alerts[id] ? "bg-green-700" : "bg-[var(--color-border)]"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${alerts[id] ? "left-5" : "left-0.5"}`} />
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
    </div>
  );
}
