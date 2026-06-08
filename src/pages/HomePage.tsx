import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3, CreditCard, Rocket, ShieldCheck, Zap, Cpu,
  CheckCircle2, ChevronDown, ArrowRight, Building2, Users,
  FileText, Menu, X, TrendingDown, AlertTriangle, Landmark,
  Star, Quote,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
} from "recharts";

/* ── Intersection-observer scroll animation ── */
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, vis };
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, vis } = useInView();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"} ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Fake sparkline data for the product mockup ── */
const MOCK_CHART = Array.from({ length: 45 }, (_, i) => ({
  d: i,
  p50: 28 + Math.sin(i * 0.18) * 6 + i * 0.15,
  p90: 34 + Math.sin(i * 0.18) * 6 + i * 0.15,
  p10: 22 + Math.sin(i * 0.18) * 6 + i * 0.15,
}));

/* ── Dashboard product mockup ── */
function ProductMockup() {
  return (
    <div className="relative w-full max-w-2xl mx-auto rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-2xl shadow-black/50 bg-[var(--color-surface)]">
      {/* Mockup header */}
      <div className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs font-bold">Head<span className="text-[var(--color-primary)]">room</span></span>
        <div className="flex gap-3 text-[10px] text-[var(--color-muted)]">
          {["Dashboard","Forecast","Credit","Capital"].map(t => (
            <span key={t} className={t === "Dashboard" ? "text-[var(--color-primary)] font-semibold" : ""}>{t}</span>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 p-4">
        {[
          { label: "Cash Balance",  value: "₹42.6L",  color: "text-[var(--color-primary)]" },
          { label: "Monthly Burn",  value: "₹8.2L",   color: "text-red-400"               },
          { label: "Runway",        value: "156 days", color: "text-green-400"             },
          { label: "Alerts",        value: "2 new",    color: "text-orange-400"            },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-3">
            <p className="text-[9px] text-[var(--color-muted)] mb-1.5">{c.label}</p>
            <p className={`text-sm font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="px-4 pb-4">
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-3">
          <p className="text-[9px] text-[var(--color-muted)] mb-2">60-Day Cash Forecast (₹L) · P10 / P50 / P90</p>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={MOCK_CHART} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#C9A227" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#C9A227" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#1e1e14", border: "1px solid #2e2e1a", borderRadius: 6, fontSize: 10 }}
                formatter={(v: number) => [`₹${v.toFixed(0)}L`, ""]}
              />
              <Area type="monotone" dataKey="p90" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 2" fill="transparent" />
              <Area type="monotone" dataKey="p50" stroke="#C9A227" strokeWidth={2}                      fill="url(#mg)"     />
              <Area type="monotone" dataKey="p10" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 2" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Glow overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[var(--color-surface)] to-transparent pointer-events-none" />
    </div>
  );
}

/* ── Copy data ── */
const PAIN_POINTS = [
  { before: "Spreadsheet updated once a month", after: "Live cash position, updated every 5 seconds"  },
  { before: "\"How much runway do we have?\" takes a call", after: "Runway on your dashboard, always"  },
  { before: "Bank loan process takes 4–6 weeks", after: "Competing offers in seconds, from your own data" },
  { before: "Investors ask for updates by email", after: "Investors get a live portal with their own login" },
];

const FEATURES = [
  {
    icon: BarChart3, color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20",
    title: "Cash Flow Forecasting",
    tagline: "90-day visibility, zero guesswork",
    desc: "Probabilistic P10/P50/P90 projections built from your actual bank transactions. No manual entry. Stack scenarios — new hire, contract, loan — before you commit.",
    points: ["P10/P50/P90 confidence bands", "What-if scenario builder", "Daily burn & runway counter", "Cash obligation calendar"],
  },
  {
    icon: CreditCard, color: "text-blue-400", bg: "bg-blue-950/30 border-blue-800/20",
    title: "Embedded Credit Marketplace",
    tagline: "Get funded in minutes, not months",
    desc: "Your transaction history becomes your credit score. Submit once, receive competing offers from multiple lenders. No paperwork. No branch visits. No waiting.",
    points: ["Live underwriting from your transactions", "3+ lender offers simultaneously", "Terms 3 – 36 months", "Score improves as cash flow improves"],
  },
  {
    icon: Rocket, color: "text-purple-400", bg: "bg-purple-950/30 border-purple-800/20",
    title: "Capital Raising Module",
    tagline: "Raise from investors on your terms",
    desc: "Choose Revenue Share, Reg CF equity, or Reg A+ mini-IPO. Manage the full investor lifecycle — commitment to cap table — from a single dashboard.",
    points: ["Rev Share, Reg CF, Reg A+ tracks", "Investor portal with live progress", "Equity % auto-calculated", "Commitment → confirmation workflow"],
  },
  {
    icon: ShieldCheck, color: "text-green-400", bg: "bg-green-950/30 border-green-800/20",
    title: "Role-Based Workspace",
    tagline: "One platform, four access levels",
    desc: "Owners see everything. Accountants see cash flow. Investors see their holdings. Data is isolated at the database level — not just hidden in the UI.",
    points: ["Owner, accountant, investor, super admin", "Namespace-isolated at DB level", "Invite by email, set role instantly", "Audit trail on every action"],
  },
  {
    icon: Zap, color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-800/20",
    title: "Local-First Real-Time Sync",
    tagline: "Instant UI. Team always in sync.",
    desc: "Writes hit the screen instantly — no spinners while you type. Changes sync to the server in 400ms and broadcast to all teammates every 5 seconds.",
    points: ["Zero-latency local writes", "400ms debounced server sync", "5-second multi-user broadcast", "Works offline, syncs on reconnect"],
  },
  {
    icon: Cpu, color: "text-orange-400", bg: "bg-orange-950/30 border-orange-800/20",
    title: "AI Financial Assistant",
    tagline: "Ask anything. Get numbers, not jargon.",
    desc: "Powered by Claude (Anthropic). Ask \"how long can we survive if revenue drops 30%?\" and get a precise answer from your own data — not a generic template.",
    points: ["Context-aware of your transactions", "Plain-language answers", "Actionable recommendations", "Optional — bring your own API key"],
  },
];

const TESTIMONIALS = [
  { name: "Priya Sharma",    co: "Founder, NutriBox",          quote: "We used to guess our runway every month. Now I open Headroom on my phone every morning. Closed a ₹25L credit line in 3 days.",           stars: 5 },
  { name: "Arjun Mehta",     co: "CFO, TechBridge Solutions",  quote: "The scenario builder alone saved us from a bad hiring decision. We saw it would push runway under 60 days before we ever signed an offer.", stars: 5 },
  { name: "Sneha Kapoor",    co: "Co-founder, GreenThread",    quote: "Our investors now check the portal themselves instead of emailing us. That's 3 hours a week back. The Reg CF raise was seamless.",         stars: 5 },
];

const PLANS = [
  {
    name: "Starter", price: "Free", sub: "forever",
    desc: "For early-stage founders exploring their numbers.",
    features: ["Cash flow dashboard", "30-day forecast", "1 bank account", "2 team members", "Basic alerts"],
    cta: "Start free", highlight: false,
  },
  {
    name: "Growth", price: "₹4,999", sub: "/ month",
    desc: "For growing SMBs that need full visibility and credit.",
    features: ["Everything in Starter", "90-day P10/P50/P90 forecast", "Scenario builder", "Credit marketplace", "Unlimited bank accounts", "5 team members", "AI assistant"],
    cta: "Start 14-day trial", highlight: true,
  },
  {
    name: "Scale", price: "₹12,999", sub: "/ month",
    desc: "For businesses actively raising capital or managing investors.",
    features: ["Everything in Growth", "Capital raising module", "Unlimited investors", "Reg CF & Reg A+ support", "Unlimited team members", "Priority support", "Custom onboarding"],
    cta: "Talk to us", highlight: false,
  },
];

const FAQS = [
  { q: "Do I need to be an accountant to use Headroom?",     a: "No. Headroom is built for founders. It translates raw transactions into plain language — runway, burn, risk. Your CA can also get their own login with accountant access." },
  { q: "How does Headroom get my transaction data?",          a: "You connect your bank accounts through our secure integration. Headroom reads transaction history to power forecasting and underwriting. No manual entry needed." },
  { q: "How is my credit score calculated?",                  a: "Headroom computes a live underwriting score from your monthly revenue, burn rate, runway, and business age. The higher your score, the better offers you receive from lenders." },
  { q: "Which lenders are in the credit marketplace?",        a: "We route applications to Stripe Capital, OnDeck, Lendingkart, and other NBFC partners. You see all offers side-by-side and pick the best terms." },
  { q: "Can investors access our sensitive financial data?",  a: "No. Investors get a dedicated portal that shows only the capital raise they're part of — their investment, equity %, and raise progress. All other data is invisible to them." },
  { q: "Is there a free trial for paid plans?",               a: "Yes — Growth plan comes with a 14-day free trial, no credit card required. You keep your data if you downgrade to Starter." },
];

/* ── FAQ accordion ── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--color-border)] last:border-0">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-start justify-between py-5 text-left gap-6 group">
        <span className="text-sm font-medium group-hover:text-[var(--color-primary)] transition-colors">{q}</span>
        <ChevronDown size={16} className={`shrink-0 mt-0.5 text-[var(--color-muted)] transition-transform duration-200 ${open ? "rotate-180 text-[var(--color-primary)]" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48 pb-5" : "max-h-0"}`}>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function HomePage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">

      {/* ─── NAV ─── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-[var(--color-bg)]/90 backdrop-blur-xl border-b border-[var(--color-border)] shadow-xl shadow-black/30" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-black tracking-tight cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Head<span className="text-[var(--color-primary)]">room</span>
          </span>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            {[["Product","#product"],["How it works","#how"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l, h]) => (
              <a key={l} href={h} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">{l}</a>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate("/login")} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors px-3 py-2">Sign in</button>
            <button onClick={() => navigate("/login")} className="text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-[var(--color-primary)]/20">
              Start free →
            </button>
          </div>
          <button className="md:hidden p-2 text-[var(--color-muted)]" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 py-4 flex flex-col gap-4 text-sm">
            {[["Product","#product"],["How it works","#how"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l, h]) => (
              <a key={l} href={h} onClick={() => setMenuOpen(false)} className="text-[var(--color-muted)]">{l}</a>
            ))}
            <button onClick={() => navigate("/login")} className="mt-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-3 rounded-xl">Start free →</button>
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section className="relative pt-40 pb-20 px-6 overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[var(--color-primary)]/8 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute top-60 right-0 w-[400px] h-[400px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <div>
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-1.5 rounded-full mb-6">
                <span className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-pulse" />
                Financial OS for Indian SMBs
              </span>
            </div>
            <h1 className="text-5xl sm:text-6xl font-black leading-[1.08] tracking-tight mb-6 animate-fade-up delay-100">
              Stop guessing.<br />
              Start knowing<br />
              <span className="text-[var(--color-primary)]">your cash flow.</span>
            </h1>
            <p className="text-lg text-[var(--color-muted)] leading-relaxed mb-8 max-w-lg animate-fade-up delay-200">
              Headroom gives SMB founders a real-time dashboard for cash flow forecasting, embedded credit, and capital raising — all from your actual bank data.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-10 animate-fade-up delay-300">
              <button onClick={() => navigate("/login")} className="flex items-center gap-2 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-7 py-3.5 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-xl shadow-[var(--color-primary)]/25">
                Open dashboard free <ArrowRight size={15} />
              </button>
              <a href="#product" className="flex items-center gap-2 border border-[var(--color-border)] text-[var(--color-muted)] px-7 py-3.5 rounded-xl hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text)] transition-all text-sm font-medium">
                See how it works
              </a>
            </div>
            <div className="flex flex-wrap gap-5 text-xs text-[var(--color-muted)] animate-fade-up delay-400">
              {["Free to start", "No credit card", "Setup in 5 minutes", "Bank-level encryption"].map(t => (
                <span key={t} className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-400" />{t}</span>
              ))}
            </div>
          </div>

          {/* Right — product mockup */}
          <div className="animate-fade-up delay-200">
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-2xl bg-[var(--color-primary)]/5 blur-2xl scale-110 pointer-events-none" />
            <div className="relative">
              <ProductMockup />
              {/* Floating badges */}
              <div className="absolute -top-4 -right-4 bg-green-900/80 border border-green-700/50 text-green-400 text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg backdrop-blur animate-fade-in delay-500">
                ✓ 156 days runway
              </div>
              <div className="absolute -bottom-4 -left-4 bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-semibold px-3 py-2 rounded-xl shadow-lg animate-fade-in delay-600">
                <span className="text-[var(--color-muted)]">New offer from </span>
                <span className="text-[var(--color-primary)]">Lendingkart — ₹20L</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF BAR ─── */}
      <Reveal>
        <div className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="max-w-5xl mx-auto px-6 py-8">
            <p className="text-xs text-center text-[var(--color-muted)] uppercase tracking-widest mb-6">Trusted by growing Indian businesses</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              {[
                { v: "₹2.4Cr+", l: "Credit facilitated" },
                { v: "90 days",  l: "Forecast horizon"   },
                { v: "< 5 min",  l: "Time to first insight" },
                { v: "4 roles",  l: "Access control levels" },
              ].map(({ v, l }) => (
                <div key={l}>
                  <p className="text-2xl font-black text-[var(--color-primary)]">{v}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {/* ─── PROBLEM SECTION ─── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">The problem</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Most SMBs fly blind on cash flow</h2>
            <p className="text-[var(--color-muted)] max-w-xl mx-auto text-sm leading-relaxed">
              82% of small business failures are caused by cash flow problems — not bad products. The tools exist to prevent this. They just weren't built for founders.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PAIN_POINTS.map(({ before, after }, i) => (
            <Reveal key={before} delay={i * 80}>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-xs bg-red-950/40 text-red-400 border border-red-800/30 px-2 py-0.5 rounded-full shrink-0 mt-0.5">Before</span>
                  <p className="text-sm text-[var(--color-muted)] line-through decoration-red-500/40">{before}</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xs bg-green-950/40 text-green-400 border border-green-800/30 px-2 py-0.5 rounded-full shrink-0 mt-0.5">After</span>
                  <p className="text-sm font-medium">{after}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── PRODUCT / FEATURES ─── */}
      <section id="product" className="border-t border-[var(--color-border)]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-3">The product</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Six modules. One dashboard.</h2>
              <p className="text-[var(--color-muted)] max-w-xl mx-auto text-sm leading-relaxed">
                Everything your finance operation needs, purpose-built for lean SMBs. No integrations to configure. No consultants needed.
              </p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 70}>
                  <div className="group h-full flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)]/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 transition-all duration-250">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${f.bg} group-hover:scale-110 transition-transform`}>
                      <Icon size={20} className={f.color} />
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)] mb-1">{f.tagline}</p>
                    <h3 className="text-base font-bold mb-3">{f.title}</h3>
                    <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-5 flex-1">{f.desc}</p>
                    <ul className="space-y-1.5 border-t border-[var(--color-border)] pt-4">
                      {f.points.map(p => (
                        <li key={p} className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
                          <CheckCircle2 size={11} className={`mt-0.5 shrink-0 ${f.color}`} />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how" className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-3">Simple setup</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Live in under 5 minutes</h2>
              <p className="text-[var(--color-muted)] text-sm">No onboarding call. No 30-page setup guide.</p>
            </div>
          </Reveal>
          <div className="relative">
            {/* Connector line */}
            <div className="hidden lg:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-[var(--color-primary)]/30 to-transparent" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { n: "01", t: "Connect your bank",       d: "Link accounts securely. Headroom imports real transaction history automatically."          },
                { n: "02", t: "See your numbers",         d: "Your dashboard fills with live burn rate, runway, and 90-day forecast instantly."           },
                { n: "03", t: "Forecast & scenario-plan", d: "Model hires, contracts, and loans before committing. See the runway impact live."           },
                { n: "04", t: "Access capital",           d: "Apply for credit or launch a capital raise directly from your dashboard — no paperwork."    },
              ].map(({ n, t, d }, i) => (
                <Reveal key={n} delay={i * 100}>
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/25 flex items-center justify-center mx-auto mb-4">
                      <span className="text-lg font-black text-[var(--color-primary)]">{n}</span>
                    </div>
                    <h3 className="font-bold mb-2 text-sm">{t}</h3>
                    <p className="text-xs text-[var(--color-muted)] leading-relaxed">{d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── WHO IT'S FOR ─── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-3">Access control</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">One workspace, four roles</h2>
            <p className="text-[var(--color-muted)] text-sm">Invite your whole team. Everyone sees only what they need.</p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { role: "Founder / Owner", icon: Building2, color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20", tabs: ["Dashboard","Forecast","Credit","Capital","Admin"], note: "Full access" },
            { role: "Accountant / CA",  icon: FileText,   color: "text-blue-400",              bg: "bg-blue-950/30 border-blue-800/20",                              tabs: ["Dashboard","Forecast"],                              note: "Finance view" },
            { role: "Investor",         icon: Users,      color: "text-purple-400",            bg: "bg-purple-950/30 border-purple-800/20",                          tabs: ["Dashboard","Capital"],                               note: "Portfolio view" },
            { role: "Super Admin",      icon: ShieldCheck,color: "text-green-400",             bg: "bg-green-950/30 border-green-800/20",                            tabs: ["All tabs","User management","Audit log"],            note: "Platform admin" },
          ].map(({ role, icon: Icon, color, bg, tabs, note }, i) => (
            <Reveal key={role} delay={i * 80}>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 h-full">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${bg}`}>
                  <Icon size={16} className={color} />
                </div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${color}`}>{note}</p>
                <h3 className="font-bold text-sm mb-3">{role}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tabs.map(t => (
                    <span key={t} className="text-[10px] bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 rounded-full text-[var(--color-muted)]">{t}</span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-3">Social proof</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Founders trust their numbers again</h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col h-full">
                  <Quote size={20} className="text-[var(--color-primary)]/40 mb-4" />
                  <p className="text-sm text-[var(--color-muted)] leading-relaxed flex-1 mb-5">"{t.quote}"</p>
                  <div>
                    <div className="flex gap-0.5 mb-2">
                      {Array.from({ length: t.stars }).map((_, s) => (
                        <Star key={s} size={11} className="text-[var(--color-primary)] fill-[var(--color-primary)]" />
                      ))}
                    </div>
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{t.co}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-24">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Simple, transparent pricing</h2>
            <p className="text-[var(--color-muted)] text-sm">Start free. Upgrade when you need more. Cancel any time.</p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 80}>
              <div className={`relative rounded-2xl p-6 border flex flex-col ${plan.highlight ? "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/50 shadow-xl shadow-[var(--color-primary)]/10" : "bg-[var(--color-surface)] border-[var(--color-border)]"}`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--color-primary)] text-[var(--color-bg)] text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                    Most popular
                  </div>
                )}
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-muted)] mb-1">{plan.name}</p>
                  <p className="text-3xl font-black">{plan.price}<span className="text-sm font-normal text-[var(--color-muted)]"> {plan.sub}</span></p>
                  <p className="text-xs text-[var(--color-muted)] mt-2 leading-relaxed">{plan.desc}</p>
                </div>
                <ul className="space-y-2.5 mb-6 flex-1 border-t border-[var(--color-border)] pt-5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 size={12} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
                      <span className="text-[var(--color-muted)]">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate("/login")}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${plan.highlight ? "bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 shadow-lg shadow-[var(--color-primary)]/20" : "border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]/40"}`}
                >
                  {plan.cta}
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-2xl mx-auto px-6 py-24">
          <Reveal>
            <div className="text-center mb-12">
              <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-3">FAQ</p>
              <h2 className="text-3xl font-black">Common questions</h2>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl px-6">
              {FAQS.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <Reveal>
        <section className="relative overflow-hidden border-b border-[var(--color-border)]">
          <div className="absolute inset-0 bg-[var(--color-primary)]/4 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-[var(--color-primary)]/10 blur-[130px] rounded-full pointer-events-none" />
          <div className="relative max-w-2xl mx-auto px-6 py-28 text-center">
            <p className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-4">Get started today</p>
            <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight">
              Your cash flow.<br />
              <span className="text-[var(--color-primary)]">Your decisions.</span>
            </h2>
            <p className="text-[var(--color-muted)] mb-10 text-sm leading-relaxed max-w-md mx-auto">
              Join founders who replaced guesswork with real-time financial intelligence. Free to start. No credit card. Up in 5 minutes.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button onClick={() => navigate("/login")} className="flex items-center gap-2 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-9 py-4 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-2xl shadow-[var(--color-primary)]/25">
                Open dashboard free <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ─── FOOTER ─── */}
      <footer className="py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[var(--color-muted)]">
          <span className="text-base font-black">Head<span className="text-[var(--color-primary)]">room</span></span>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {[["Cash Flow","#product"],["Credit","#product"],["Capital","#product"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l, h]) => (
              <a key={l} href={h} className="hover:text-[var(--color-text)] transition-colors">{l}</a>
            ))}
          </div>
          <span>© {new Date().getFullYear()} Headroom. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
