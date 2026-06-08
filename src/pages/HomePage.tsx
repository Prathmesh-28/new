import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3, CreditCard, Rocket, ShieldCheck, Zap,
  CheckCircle2, ChevronDown, ArrowRight, Building2, Users,
  FileText, Cpu, Menu, X,
} from "lucide-react";

/* ─── Intersection observer hook for scroll animations ─── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Data ─── */
const SERVICES = [
  {
    icon: BarChart3,
    color: "text-[var(--color-primary)]",
    bg:    "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20",
    title: "Cash Flow Forecasting",
    tagline: "See 90 days ahead with confidence",
    desc: "Probabilistic P10/P50/P90 projections built from your real transaction history. Model scenarios — new hire, contract won, loan draw — before you commit.",
    bullets: ["P10/P50/P90 probability bands", "Scenario builder (stack what-ifs)", "Cash obligation tracking", "Daily burn & runway counter"],
  },
  {
    icon: CreditCard,
    color: "text-blue-400",
    bg:    "bg-blue-950/30 border-blue-800/20",
    title: "Embedded Credit",
    tagline: "Get funded without paperwork",
    desc: "Your transactions become your credit score. Submit once, get competing loan offers from multiple lenders in seconds. No branch visits. No waiting.",
    bullets: ["Live underwriting from your own data", "Multiple lender offers instantly", "Terms from 3 to 36 months", "Score improves as cash flow improves"],
  },
  {
    icon: Rocket,
    color: "text-purple-400",
    bg:    "bg-purple-950/30 border-purple-800/20",
    title: "Capital Raising",
    tagline: "Raise from investors on your terms",
    desc: "Choose your track — Revenue Share, Reg CF equity, or Reg A+ mini-IPO. Manage the full investor lifecycle from commitment to cap-table in one place.",
    bullets: ["3 raise tracks: Rev Share, Reg CF, Reg A+", "Investor portal with progress bar", "Equity % calculated automatically", "Commitment → confirmation workflow"],
  },
  {
    icon: ShieldCheck,
    color: "text-green-400",
    bg:    "bg-green-950/30 border-green-800/20",
    title: "Role-Based Access",
    tagline: "Everyone sees only what they need",
    desc: "Owners see everything. Accountants see cash flow and forecasts. Investors see capital and their holdings. Data is namespace-isolated at the DB level.",
    bullets: ["4 roles: super_admin, owner, accountant, investor", "Namespace-isolated KV store", "Per-tab permission enforcement", "Invite team members by email"],
  },
  {
    icon: Zap,
    color: "text-yellow-400",
    bg:    "bg-yellow-950/30 border-yellow-800/20",
    title: "Real-Time Sync",
    tagline: "Instant writes, live collaboration",
    desc: "Local-first architecture means your writes are instant. Changes sync to the server in 400ms and poll every 5 seconds so your whole team stays in sync.",
    bullets: ["Local-first: no loading spinners", "400ms debounced backend sync", "5-second multi-user poll", "Works offline, syncs on reconnect"],
  },
  {
    icon: Cpu,
    color: "text-orange-400",
    bg:    "bg-orange-950/30 border-orange-800/20",
    title: "AI Financial Assistant",
    tagline: "Ask questions about your own numbers",
    desc: "Powered by Claude. Ask anything about your cash flow, burn rate, or credit position in plain language. Get actionable answers, not just charts.",
    bullets: ["Powered by Claude (Anthropic)", "Context-aware of your data", "Suggest actions, not just insights", "Optional — enable with your API key"],
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Connect your accounts",    desc: "Link your bank accounts. Headroom reads your real transaction history — no manual entry." },
  { step: "02", title: "See your runway instantly", desc: "Your dashboard shows burn rate, cash balance, and days of runway the moment you land." },
  { step: "03", title: "Forecast & scenario-plan",  desc: "Model what happens if you hire, win a contract, or take a loan — before committing." },
  { step: "04", title: "Access capital when needed",desc: "Get credit offers or launch a capital raise directly from your dashboard." },
];

const ROLES = [
  { role: "Owner / Founder", icon: Building2, tabs: ["Dashboard", "Forecast", "Credit", "Capital", "Admin"], color: "text-[var(--color-primary)]" },
  { role: "Accountant / CFO",  icon: FileText,    tabs: ["Dashboard", "Forecast"],                               color: "text-blue-400"                },
  { role: "Investor",          icon: Users,       tabs: ["Dashboard", "Capital"],                                color: "text-purple-400"              },
];

const FAQS = [
  { q: "Is my financial data secure?",            a: "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Role-based access ensures each user sees only their allowed namespace." },
  { q: "Do I need to be an accountant to use this?", a: "No. Headroom is built for founders. The UI translates raw transactions into plain-language insights — runway, burn, and risk scores." },
  { q: "What lenders are in the credit marketplace?", a: "Offers come from multiple lenders (Stripe Capital, OnDeck, Lendingkart, and more) based on your underwriting score. You pick the best offer." },
  { q: "Can I raise capital for any type of business?", a: "Yes — revenue share suits any recurring-revenue business. Reg CF and Reg A+ are equity tracks open to most incorporated SMBs." },
  { q: "How does the AI assistant work?",          a: "It uses Claude by Anthropic with your financial context pre-loaded. Your data never trains the model. Requires your own API key to enable." },
];

/* ─── Sub-components ─── */
function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}>
      {children}
    </div>
  );
}

function ServiceCard({ s, idx }: { s: typeof SERVICES[0]; idx: number }) {
  const { ref, inView } = useInView(0.1);
  const Icon = s.icon;
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${idx * 80}ms` }}
      className={`group flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
    >
      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${s.bg}`}>
        <Icon size={20} className={s.color} />
      </div>
      <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1">{s.tagline}</p>
      <h3 className="text-lg font-bold mb-3">{s.title}</h3>
      <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-5 flex-1">{s.desc}</p>
      <ul className="space-y-1.5">
        {s.bullets.map(b => (
          <li key={b} className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
            <CheckCircle2 size={12} className={`mt-0.5 shrink-0 ${s.color}`} />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--color-border)] last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-4 text-left text-sm font-medium hover:text-[var(--color-primary)] transition-colors gap-4"
      >
        <span>{q}</span>
        <ChevronDown size={16} className={`shrink-0 text-[var(--color-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-40 pb-4" : "max-h-0"}`}>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function HomePage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-x-hidden">

      {/* ── Sticky nav ── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur-lg shadow-lg shadow-black/20" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Head<span className="text-[var(--color-primary)]">room</span>
          </span>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-[var(--color-muted)]">
            {[["Services", "#services"], ["How it works", "#how"], ["Pricing", "#pricing"], ["FAQ", "#faq"]].map(([label, href]) => (
              <a key={label} href={href} className="hover:text-[var(--color-text)] transition-colors">{label}</a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate("/login")} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors px-3 py-1.5">
              Sign in
            </button>
            <button onClick={() => navigate("/login")} className="text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2 rounded-xl hover:opacity-90 active:scale-95 transition-all">
              Start free →
            </button>
          </div>

          {/* Mobile menu toggle */}
          <button className="md:hidden text-[var(--color-muted)]" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 py-4 flex flex-col gap-3 text-sm animate-fade-in">
            {[["Services", "#services"], ["How it works", "#how"], ["FAQ", "#faq"]].map(([label, href]) => (
              <a key={label} href={href} onClick={() => setMenuOpen(false)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">{label}</a>
            ))}
            <button onClick={() => navigate("/login")} className="mt-2 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-xl text-sm">
              Open dashboard →
            </button>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative pt-40 pb-28 px-6 text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[var(--color-primary)]/8 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-[300px] h-[300px] bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative max-w-4xl mx-auto">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[var(--color-primary)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-1.5 rounded-full mb-8">
              <span className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-pulse" />
              Financial OS for Indian SMBs
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-6 animate-fade-up delay-100">
            Know where your<br />
            <span className="text-[var(--color-primary)]">cash is going</span><br />
            before it does
          </h1>

          <p className="text-lg sm:text-xl text-[var(--color-muted)] max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up delay-200">
            Headroom gives founders a single dashboard for cash flow forecasting, embedded credit, and capital raising — built around your actual transaction data.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap animate-fade-up delay-300">
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-2 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-8 py-3.5 rounded-xl hover:opacity-90 active:scale-95 transition-all text-sm shadow-lg shadow-[var(--color-primary)]/20"
            >
              Open your dashboard <ArrowRight size={15} />
            </button>
            <a href="#services" className="flex items-center gap-2 border border-[var(--color-border)] text-[var(--color-muted)] font-medium px-8 py-3.5 rounded-xl hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text)] transition-all text-sm">
              See all features
            </a>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 flex-wrap mt-12 animate-fade-up delay-400">
            {["No credit card required", "Free to start", "Data encrypted at rest"].map(t => (
              <span key={t} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                <CheckCircle2 size={12} className="text-green-400" />{t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <Section>
        <div className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {[
              { v: "90-day",  l: "Forecast horizon"       },
              { v: "< 400ms", l: "Sync latency"           },
              { v: "4 roles", l: "Access control levels"  },
              { v: "3 tracks",l: "Capital raising options" },
            ].map(({ v, l }) => (
              <div key={l}>
                <p className="text-3xl font-bold text-[var(--color-primary)]">{v}</p>
                <p className="text-xs text-[var(--color-muted)] mt-1.5 uppercase tracking-wider">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Services ── */}
      <section id="services" className="max-w-6xl mx-auto px-6 py-24">
        <Section>
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-widest mb-3">What we do</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything your business finances need</h2>
            <p className="text-[var(--color-muted)] max-w-xl mx-auto text-sm leading-relaxed">
              Six integrated modules — one dashboard. No third-party integrations to manage, no context switching.
            </p>
          </div>
        </Section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SERVICES.map((s, i) => <ServiceCard key={s.title} s={s} idx={i} />)}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <Section>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-widest mb-3">Simple process</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Up and running in minutes</h2>
              <p className="text-[var(--color-muted)] text-sm">No setup. No integrations. No onboarding calls.</p>
            </div>
          </Section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ step, title, desc }, i) => {
              const { ref, inView } = useInView(0.1);
              return (
                <div
                  key={step}
                  ref={ref}
                  style={{ transitionDelay: `${i * 100}ms` }}
                  className={`transition-all duration-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                >
                  <div className="text-4xl font-black text-[var(--color-primary)]/20 mb-3">{step}</div>
                  <h3 className="font-semibold mb-2 text-sm">{title}</h3>
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed">{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Who is it for ── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <Section>
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-widest mb-3">Access control</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built for your whole team</h2>
            <p className="text-[var(--color-muted)] text-sm">Each role sees exactly what they need — nothing more.</p>
          </div>
        </Section>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {ROLES.map(({ role, icon: Icon, tabs, color }) => {
            const { ref, inView } = useInView();
            return (
              <div
                key={role}
                ref={ref}
                className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 transition-all duration-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              >
                <div className={`w-10 h-10 rounded-xl bg-current/10 flex items-center justify-center mb-4 ${color}`}>
                  <Icon size={18} />
                </div>
                <h3 className="font-bold mb-3">{role}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tabs.map(t => (
                    <span key={t} className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 rounded-full text-[var(--color-muted)]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <Section>
            <p className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Start free. Pay as you grow.</h2>
            <p className="text-[var(--color-muted)] text-sm mb-12">No credit card required to explore. Full features on day one.</p>
          </Section>
          <Section>
            <div className="bg-[var(--color-bg)] border border-[var(--color-primary)]/30 rounded-2xl p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[var(--color-primary)] text-[var(--color-bg)] text-xs font-bold px-3 py-1 rounded-bl-xl">
                MOST POPULAR
              </div>
              <p className="text-4xl font-black mb-1">Free<span className="text-lg text-[var(--color-muted)] font-normal"> to start</span></p>
              <p className="text-sm text-[var(--color-muted)] mb-8">All features included. Revenue-based pricing unlocks as you scale.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mb-8">
                {[
                  "Cash flow dashboard", "90-day forecasting", "Scenario builder",
                  "Credit marketplace", "Capital raising", "AI assistant",
                  "Role-based access", "Multi-bank accounts",
                ].map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={14} className="text-[var(--color-primary)] shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/login")}
                className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-3.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Get started free →
              </button>
            </div>
          </Section>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-2xl mx-auto px-6 py-24">
        <Section>
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl font-bold">Common questions</h2>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-6">
            {FAQS.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </Section>
      </section>

      {/* ── Final CTA ── */}
      <Section>
        <section className="border-t border-[var(--color-border)] relative overflow-hidden">
          <div className="absolute inset-0 bg-[var(--color-primary)]/5 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[var(--color-primary)]/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="relative max-w-2xl mx-auto px-6 py-24 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to get headroom?</h2>
            <p className="text-[var(--color-muted)] mb-8 text-sm leading-relaxed max-w-md mx-auto">
              Sign in and every screen is pre-populated with seed data. Explore the full platform — no setup, no commitment.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-10 py-4 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-xl shadow-[var(--color-primary)]/20"
            >
              Open dashboard →
            </button>
          </div>
        </section>
      </Section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--color-border)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-muted)]">
          <span className="font-bold text-sm">Head<span className="text-[var(--color-primary)]">room</span></span>
          <div className="flex items-center gap-6">
            {["Cash Flow", "Credit", "Capital", "Admin"].map(t => (
              <span key={t} className="hover:text-[var(--color-text)] cursor-pointer transition-colors" onClick={() => navigate("/login")}>{t}</span>
            ))}
          </div>
          <span>© {new Date().getFullYear()} Headroom · Built for founders</span>
        </div>
      </footer>
    </div>
  );
}
