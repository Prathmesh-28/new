import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { initHero3D } from "@/animations/hero3d";
import Logo from "@/components/Logo";

/* ─── Colour tokens ─── */
const C = {
  deepest: "#1C2209", deep: "#2E3A10", mid: "#4A5E1A",
  bright: "#6B8526", light: "#96B83D", pale: "#C4D97A",
  wash: "#E8F0C2", cream: "#F4F1E4", creamW: "#FDFAF0",
  gold: "#C9A227", goldL: "#E8C84A",
  txt: "#1A1F0A", txtMid: "#3D4A1E", txtMut: "#6B7A3D",
};
const serif = "Georgia,'Times New Roman',serif";
const sans  = "system-ui,-apple-system,'Segoe UI',sans-serif";
const mono  = "'Space Mono',ui-monospace,'SF Mono',Menlo,monospace"; // HUD / terminal accents

/* India-first by default (→ ₹). We only switch to USD (→ $) when the visitor is
   clearly in the US, detected from their timezone/locale. Instant + free + no API
   key, so there's no network flash or geo-IP dependency. India + rest-of-world → ₹. */
function detectUS(): boolean {
  if (typeof window === "undefined") return false; // SSR / unknown → India default
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    // US timezones: America/* (excl. non-US like America/Sao_Paulo) + Pacific/Honolulu
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana|Kentucky|Boise|Juneau|Sitka|Nome|Adak|Menominee|North_Dakota)/.test(tz)) return true;
    if (/Pacific\/(Honolulu|Pago_Pago)/.test(tz)) return true;
    const lang = (navigator.language || (navigator.languages && navigator.languages[0]) || "").toLowerCase();
    if (lang === "en-us" || lang === "es-us") return true;
  } catch { /* ignore */ }
  return false; // default → India (₹) for India + everywhere else
}

/* ─── Scroll reveal ─── */
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold });
    io.observe(el); return () => io.disconnect();
  }, [threshold]);
  return { ref, vis };
}
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, vis } = useInView();
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}>
      {children}
    </div>
  );
}

/* ─── Bar chart hero mockup ─── */
const BARS = [82,78,85,75,70,62,55,48,40,35,42,50,58,65,70,68,72,78,80,76];

function DashMockup({ inr }: { inr: boolean }) {
  return (
    <div style={{ background: C.deep, border: `1px solid rgba(196,217,122,0.15)`, borderRadius: 14, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
      <div style={{ background: "rgba(0,0,0,0.35)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
        {["#E24B4A","#EF9F27","#6B8526"].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }} />)}
        <span style={{ fontFamily: sans, fontSize: 11, color: "rgba(196,217,122,0.45)", marginLeft: 6 }}>Headroom — 90-day forecast</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Current Balance", val: inr ? "₹4.2L"  : "$52K", sub: "+8% vs last month", subC: C.light },
            { label: "Runway",          val: "68 days", sub: "at current burn",   subC: C.light },
            { label: "Low Point",       val: "Day 41",  sub: inr ? "₹80K warning" : "$10K warning", subC: C.gold  },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(196,217,122,0.08)", borderRadius: 8, padding: "11px 12px" }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: "rgba(196,217,122,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontFamily: sans, fontSize: 19, fontWeight: 600, color: C.pale }}>{s.val}</div>
              <div style={{ fontFamily: sans, fontSize: 9, color: s.subC, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(196,217,122,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontFamily: sans, fontSize: 9, color: "rgba(196,217,122,0.38)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Cash position — next 90 days</div>
          <div data-h3d="cashbars" style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 58 }}>
            {BARS.map((h, i) => (
              <div key={i} style={{ flex: 1, borderRadius: "2px 2px 0 0", minWidth: 7, height: `${Math.round(h * 0.72)}%`, background: h < 50 ? "#E24B4A" : h < 65 ? C.gold : C.bright, opacity: i < 10 ? 0.5 : 0.85 }} />
            ))}
          </div>
        </div>
        <div style={{ background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.22)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(201,162,39,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.gold, flexShrink: 0, marginTop: 1 }}>!</div>
          <div style={{ fontFamily: sans, fontSize: 11, color: C.goldL, lineHeight: 1.45 }}>
            You go below your safety threshold in <strong>41 days</strong>. A {inr ? "₹1.5L" : "$18K"} revenue advance would keep you positive through October. <span style={{ textDecoration: "underline" }}>See options →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ ─── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid rgba(74,94,26,0.12)` }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left", gap: 16 }}>
        <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 500, color: C.txt }}>{q}</span>
        <ChevronDown size={15} style={{ flexShrink: 0, color: C.txtMut, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      <div style={{ overflow: "hidden", maxHeight: open ? 200 : 0, transition: "max-height 0.3s ease", paddingBottom: open ? 16 : 0 }}>
        <p style={{ fontFamily: sans, fontSize: 13, color: C.txtMut, lineHeight: 1.7 }}>{a}</p>
      </div>
    </div>
  );
}

/* ─── Section label ─── */
function Label({ text, dark = false }: { text: string; dark?: boolean }) {
  // Mono "terminal" eyebrow with a bracket accent — the futuristic HUD signature.
  return (
    <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: dark ? C.pale : C.bright, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: C.gold }}>▚</span>{text}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [inr] = useState(() => !detectUS()); // India-first: ₹ by default, $ only for US visitors

  // Pricing CTA: a logged-in visitor goes straight to Stripe Checkout for a paid
  // plan; everyone else lands on signup. Free always → signup.
  const goPlan = (id: "free" | "growth" | "pro") => {
    const loggedIn = typeof window !== "undefined" && !!localStorage.getItem("hr_access");
    // Logged-in visitors upgrade from Settings → Plan & Billing (Razorpay checkout there).
    if (id !== "free" && loggedIn) { navigate("/settings"); return; }
    navigate(id === "free" ? "/signup" : `/signup?plan=${id}`);
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Decorative 3D/WebGL hero background layers (behind all content, reduced-motion aware)
  useEffect(() => initHero3D(), []);

  return (
    <div className="hr-landing" style={{ background: C.creamW, color: C.txt, fontFamily: sans, overflowX: "hidden" }}>

      {/* Mobile responsiveness for the inline-styled landing page. Scoped to
          .hr-landing so it never leaks into the app. Collapses multi-column
          grids, trims the 48px gutters, and shrinks oversized headings on phones. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');

        /* Subtle CRT scan-line texture over the whole landing (above content,
           below the fixed nav). Pointer-events off so it never blocks clicks. */
        .hr-landing::before {
          content:''; position:fixed; inset:0; z-index:60; pointer-events:none;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.022) 2px,rgba(0,0,0,0.022) 4px);
          mix-blend-mode:multiply;
        }
        /* Angular clip-path on the gold CTA buttons → techy, machined corners. */
        .hr-landing button[style*="201, 162, 39"] {
          clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px);
        }
        /* Scrolling ticker tape. */
        .hr-ticker { display:flex; width:max-content; animation:hr-tk 30s linear infinite; }
        @keyframes hr-tk { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        /* Live status dot. */
        .hr-blink { animation:hr-blink 2s infinite; }
        @keyframes hr-blink { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
        /* Animated underline that sweeps in on stat hover. */
        .hr-stat { position:relative; }
        .hr-stat::after {
          content:''; position:absolute; left:24px; right:24px; bottom:-12px; height:1px;
          background:linear-gradient(90deg,transparent,${C.light},transparent);
          opacity:0; transform:scaleX(0.4); transition:opacity .3s, transform .3s;
        }
        .hr-stat:hover::after { opacity:1; transform:scaleX(1); }
        @media (prefers-reduced-motion: reduce) { .hr-ticker { animation:none; } }

        /* In the native shell the nav links always collapse so the Sign in /
           Try-14-days buttons are never crowded off-screen. */
        html.capacitor-native .hr-landing nav ul { display: none !important; }
        @media (max-width: 1024px) {
          .hr-landing [style*="grid-template-columns"] { grid-template-columns: 1fr !important; gap: 16px !important; }
          .hr-landing [style*="px 48px"] { padding-left: 20px !important; padding-right: 20px !important; }
          .hr-landing [style*="padding-left: 48px"] { padding-left: 20px !important; }
          .hr-landing [style*="padding-right: 48px"] { padding-right: 20px !important; }
          .hr-landing [style*="font-size: 56px"] { font-size: 34px !important; }
          .hr-landing [style*="font-size: 50px"] { font-size: 32px !important; line-height: 1.1 !important; }
          .hr-landing [style*="font-size: 40px"] { font-size: 26px !important; }
        }
        @media (max-width: 420px) {
          .hr-landing [style*="font-size: 50px"] { font-size: 27px !important; }
        }
      `}</style>

      {/* ═══ NAV ══════════════════════════════════════════════════════════════ */}
      <nav style={{ background: scrolled ? `${C.deepest}f0` : C.deepest, backdropFilter: scrolled ? "blur(16px)" : "none", padding: "0 48px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, transition: "all 0.3s", borderBottom: scrolled ? `1px solid rgba(196,217,122,0.1)` : "none" }}>
        <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ color: C.creamW, cursor: "pointer", display: "flex", alignItems: "center" }} aria-label="Headroom home">
          <Logo variant="horizontal" size={22} />
        </div>
        <ul style={{ display: "flex", gap: 28, listStyle: "none", margin: 0, padding: 0 }} className="hidden lg:flex">
          {[["Features","#features"],["Credit","#credit"],["Capital","#capital"],["Advisors","#advisors"],["Pricing","#pricing"]].map(([l,h]) => (
            <li key={l}><a href={h} style={{ fontFamily: sans, fontSize: 13, color: "rgba(196,217,122,0.7)", textDecoration: "none" }}
              onMouseOver={e => (e.currentTarget.style.color = C.pale)} onMouseOut={e => (e.currentTarget.style.color = "rgba(196,217,122,0.7)")}>{l}</a></li>
          ))}
        </ul>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/login")} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.pale, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Sign in</button>
          <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 6, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Try 14 days free</button>
        </div>
      </nav>

      {/* ═══ HERO ═════════════════════════════════════════════════════════════ */}
      <section data-h3d="hero" style={{ background: C.deepest, paddingTop: 128, paddingBottom: 80, paddingLeft: 48, paddingRight: 48, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: "50%", height: "100%", background: C.deep, clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0% 100%)", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div className="animate-fade-up">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.3)", borderRadius: 20, padding: "5px 14px", marginBottom: 28 }}>
              <span className="hr-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, display: "inline-block" }} />
              <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.goldL }}>[ 10-layer cash flow intelligence ]</span>
            </div>
            <h1 style={{ fontFamily: serif, fontSize: 50, lineHeight: 1.05, color: C.creamW, marginBottom: 20, letterSpacing: -1.5 }}>
              Know your cash.<br /><em style={{ fontStyle: "normal", color: C.pale }}>Before</em> it matters.
            </h1>
            <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.65, color: "rgba(244,241,228,0.65)", marginBottom: 36, maxWidth: 420 }}>
              Headroom helps businesses forecast cash with more honesty, detect risk earlier, and access the right capital path when timing gets tight.
            </p>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 32 }}>
              <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "14px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>Get your forecast free</button>
              <a href="#features" style={{ fontFamily: sans, fontSize: 14, color: C.pale, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                See how it works
                <span style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.light}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>▶</span>
              </a>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {["Free for first 90 days","No credit card","Setup in 3 minutes"].map(t => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.5)" }}>
                  <CheckCircle2 size={12} style={{ color: C.light }} />{t}
                </span>
              ))}
            </div>
          </div>
          <div className="animate-fade-up delay-200" data-h3d="dash" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(196,217,122,0.55)", marginBottom: 8 }}>
              <span>CASH_CORE v2.4.1</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="hr-blink" style={{ width: 5, height: 5, borderRadius: "50%", background: C.light, display: "inline-block" }} />SIGNAL: ACTIVE · 10/10</span>
            </div>
            <DashMockup inr={inr} />
          </div>
        </div>
      </section>

      {/* ═══ TICKER ═══════════════════════════════════════════════════════════ */}
      <div style={{ background: C.deep, borderTop: "1px solid rgba(196,217,122,0.12)", borderBottom: "1px solid rgba(196,217,122,0.12)", overflow: "hidden", padding: "12px 0" }}>
        <div className="hr-ticker">
          {[0, 1].map(dup => (
            <div key={dup} style={{ display: "flex", gap: 56, paddingLeft: 56 }} aria-hidden={dup === 1}>
              {["Free for 90 days","No credit card required","Setup in 3 minutes","10-layer cash intelligence","91% forecast accuracy at 30 days","Capital access network"].map((t, i) => (
                <span key={i} style={{ fontFamily: mono, fontSize: 11, color: "rgba(196,217,122,0.6)", whiteSpace: "nowrap", letterSpacing: 2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: C.gold, fontSize: 13 }}>◆</span>{t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ STATS STRIP ══════════════════════════════════════════════════════ */}
      <div data-h3d="stats" style={{ background: C.mid, padding: "28px 48px", display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>
        {[
          { n:inr ? "₹340Cr+" : "$40M+",  d:"Forecasted cash tracked"     },
          { n:"12,000+",  d:"SMBs on the platform"         },
          { n:"91%",      d:"Forecast accuracy at 30 days" },
          { n:"4.8 days", d:"Avg time to first insight"    },
        ].map(({ n, d }, i) => (
          <div key={d} className="hr-stat" style={{ textAlign: "center", padding: "0 24px", borderRight: i < 3 ? "1px solid rgba(196,217,122,0.15)" : "none" }}>
            <div style={{ fontFamily: serif, fontSize: 32, color: C.pale, letterSpacing: -1 }}>{n}</div>
            <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.55)", marginTop: 3 }}>{d}</div>
          </div>
        ))}
      </div>

      {/* ═══ FEATURES — 10 LAYERS ════════════════════════════════════════════ */}
      <section id="features" data-h3d-deco="shapes-light" style={{ background: C.creamW, padding: "88px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto 52px" }}>
            <Label text="Platform architecture" />
            <h2 style={{ fontFamily: serif, fontSize: 40, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>
              Built as one operating system,<br />not a stack of disconnected tools.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, maxWidth: 560, lineHeight: 1.7 }}>
              Designed for SMB operators who need a truthful picture of cash — not another dashboard full of vanity signals. Instead of pretending every projection is exact, Headroom uses confidence bands and scenarios to show where outcomes may land.
            </p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
          {[
            { n:"01", t:"Live data ingestion",      d:"Bank feeds and accounting connectors sync continuously. No manual uploads." },
            { n:"02", t:"Normalisation",            d:"Transactions categorised and merchant-normalised automatically on every sync." },
            { n:"03", t:"90-day forecast engine",   d:"Daily P10/P50/P90 cash position. Recurring and variable spend modelled separately." },
            { n:"04", t:"Confidence bands",         d:"Every forecast shows best, expected, and worst case — never a single deceptive line." },
            { n:"05", t:"Alert & insight engine",   d:"Alerts fire 45 days before pressure hits. Specific, actionable, and early." },
            { n:"06", t:"Operator-first dashboard", d:"One screen shows balance, runway, alerts, and forecast. No setup needed." },
            { n:"07", t:"Scenario planner",         d:"Model a hire, slow month, or contract win and see the cash impact instantly." },
            { n:"08", t:"Embedded credit rescue",   d:"Credit options appear in-context when a forecast shows real pressure." },
            { n:"09", t:"Silent underwriting",      d:"Pre-qualification runs in the background from your own data. No bureau pulls." },
            { n:"10", t:"Community capital",        d:"Revenue-share, Reg CF, and Reg A+ raises built directly into the platform." },
          ].map(({ n, t, d }, i) => (
            <Reveal key={n} delay={i * 40}>
              <div data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 12, padding: "20px 18px", height: "100%", transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s" }}
                onMouseOver={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(107,133,38,0.4)"; el.style.boxShadow = "0 8px 24px rgba(44,58,16,0.07)"; }}
                onMouseOut={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(74,94,26,0.12)"; el.style.boxShadow = "none"; }}>
                <div style={{ fontFamily: sans, fontSize: 10, color: C.bright, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 10 }}>{n}</div>
                <h4 style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.txt, marginBottom: 8, lineHeight: 1.3 }}>{t}</h4>
                <p style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, lineHeight: 1.6 }}>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* signal → action bar */}
        <Reveal>
          <div data-h3d-deco="orbs" style={{ maxWidth: 1100, margin: "52px auto 0", background: C.deepest, borderRadius: 16, padding: "36px 48px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", position: "relative" }}>
            <div style={{ position: "absolute", top: "50%", left: "12.5%", right: "12.5%", height: 1, background: "rgba(196,217,122,0.1)" }} />
            {[
              { step:"Detect",   icon:"📡", desc:"Live signals from bank + books" },
              { step:"Forecast", icon:"📈", desc:"90-day P10/P50/P90 model runs" },
              { step:"Alert",    icon:"🔔", desc:"Plain-language warning, 45 days early" },
              { step:"Act",      icon:"⚡", desc:"Credit or capital options, in context" },
            ].map(({ step, icon, desc }, i) => (
              <div key={step} style={{ textAlign: "center", padding: "0 24px", borderRight: i < 3 ? "1px solid rgba(196,217,122,0.08)" : "none", position: "relative", zIndex: 1 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.deep, border: "1px solid rgba(196,217,122,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 20 }}>{icon}</div>
                <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: C.pale, marginBottom: 6 }}>{step}</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(196,217,122,0.4)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ═══ CREDIT RESCUE ════════════════════════════════════════════════════ */}
      <section id="credit" data-h3d-deco="shapes-light" style={{ background: C.cream, padding: "88px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal>
            <Label text="Credit rescue" />
            <h2 style={{ fontFamily: serif, fontSize: 38, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>
              Credit support that appears inside<br />the cash flow workflow.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, maxWidth: 540, lineHeight: 1.7, marginBottom: 52 }}>
              When a forecast shows real pressure, the platform surfaces rescue options in context — evaluates fit with silent underwriting, and models repayment impact before a business commits.
            </p>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 52 }}>
            {[
              { n:"1", icon:"📊", t:"Forecast identifies pressure",    d:"The 90-day model spots a cash gap weeks before it arrives." },
              { n:"2", icon:"🔔", t:"Alerts explain what changed",     d:"Plain-language notification tells you exactly what the risk is and when." },
              { n:"3", icon:"🔍", t:"Silent underwriting runs",        d:"Pre-qualification happens in the background from your own data. No forms, no bureau pull." },
              { n:"4", icon:"✅", t:"Repayment simulated first",       d:"See exactly how any option affects your forecast before you accept a single rupee." },
            ].map(({ n, icon, t, d }, i) => (
              <Reveal key={n} delay={i * 80}>
                <div data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: 24, position: "relative" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.mid, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 13, fontWeight: 700, color: "#fff", position: "absolute", top: -13, left: 20 }}>{n}</div>
                  <div style={{ fontSize: 22, marginBottom: 12, marginTop: 10 }}>{icon}</div>
                  <h4 style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.txt, marginBottom: 8 }}>{t}</h4>
                  <p style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, lineHeight: 1.6 }}>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "start" }}>
              <div>
                <h3 style={{ fontFamily: serif, fontSize: 26, color: C.txt, marginBottom: 10 }}>Repayment simulation changes the decision quality.</h3>
                <p style={{ fontFamily: sans, fontSize: 14, color: C.txtMut, lineHeight: 1.7, marginBottom: 24 }}>
                  Traditional credit is a separate conversation. Headroom embeds it directly — so you see what borrowing costs in the context of your own forecast, not a generic APR table.
                </p>
                <div style={{ display: "flex", gap: 24, marginBottom: 28 }}>
                  {[{ n:"48 hrs", d:"Avg to first offer"}, { n:"0", d:"Bureau pulls"}, { n:"3 types", d:"Capital available"}].map(({ n, d }, i) => (
                    <div key={d} style={{ paddingRight: i < 2 ? 24 : 0, borderRight: i < 2 ? `1px solid rgba(74,94,26,0.15)` : "none" }}>
                      <div style={{ fontFamily: serif, fontSize: 28, color: C.mid }}>{n}</div>
                      <div style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, marginTop: 2 }}>{d}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>Check my eligibility</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { icon:"📈", t:"Revenue-based advance",  d:"Repay as % of monthly revenue. No fixed EMI.",         amt:"Up to 3× monthly revenue" },
                  { icon:"📄", t:"Invoice financing",      d:"Get paid on outstanding invoices today.",               amt:"Up to 90% of invoice value" },
                  { icon:"🔒", t:"Revolving credit line",  d:"Draw what you need. Pay interest only on usage.",       amt:inr ? "Up to ₹50L" : "Up to $60K" },
                ].map(({ icon, t, d, amt }) => (
                  <div key={t} data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 9, background: C.wash, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>{icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.txt, marginBottom: 2 }}>{t}</div>
                      <div style={{ fontFamily: sans, fontSize: 12, color: C.txtMut }}>{d}</div>
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: C.mid, whiteSpace: "nowrap" }}>{amt}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ CAPITAL ══════════════════════════════════════════════════════════ */}
      <section id="capital" data-h3d-deco="orbs" style={{ background: C.deepest, padding: "88px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto 52px" }}>
            <Label text="Community capital" dark />
            <h2 style={{ fontFamily: serif, fontSize: 40, color: C.creamW, letterSpacing: -1, marginBottom: 14 }}>
              Raise from the people who already<br />believe in your business.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: "rgba(196,217,122,0.55)", maxWidth: 520, lineHeight: 1.7 }}>
              Headroom extends cash flow intelligence into capital formation — with live operating data, repayment progress, and raise readiness built in from day one.
            </p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {(inr ? [
            {
              track:"Track A", badge:"Revenue-based", title:"Revenue-based financing",
              range:"₹5L – ₹2Cr",
              best:"Restaurants, retail, D2C, and service businesses with steady revenue.",
              features:["Repay as % of monthly revenue","No equity dilution","No collateral, no EMI lock-in","Live investor portal"],
              featured: false,
            },
            {
              track:"Track B", badge:"Angel / AIF", title:"Angel & AIF round",
              range:"₹50L – ₹5Cr",
              best:"Businesses ready for institutional angels and AIF participation.",
              features:["Private-placement framework","Companies Act 2013 compliant","Investor & cap-table dashboard","SEBI-registered AIF network"],
              featured: true,
            },
            {
              track:"Track C", badge:"SME IPO", title:"SME IPO listing",
              range:"₹5Cr – ₹50Cr+",
              best:"Growth-stage SMBs ready to list on NSE Emerge / BSE SME.",
              features:["NSE Emerge / BSE SME platform","Merchant-banker support included","Shares tradeable after listing","Full SEBI compliance layer"],
              featured: false,
            },
          ] : [
            {
              track:"Track A", badge:"Revenue-share", title:"Crowdfunding raise",
              range:"$10K – $500K",
              best:"Restaurants, retail, and service businesses with loyal communities.",
              features:["Revenue-share repayment","No equity dilution","Live investor portal","Campaign page included"],
              featured: false,
            },
            {
              track:"Track B", badge:"Reg CF equity", title:"Community equity raise",
              range:"Up to $5M / year",
              best:"Businesses ready for broader community participation.",
              features:["Equity crowdfunding framework","SEC Reg CF compliant","Investor dashboard","Cap table management"],
              featured: true,
            },
            {
              track:"Track C", badge:"Reg A+ mini-IPO", title:"Public mini-IPO",
              range:"Up to $75M / year",
              best:"Growth-stage businesses with strong revenue and a credible public story.",
              features:["Broadest investor pool","Shares tradeable after close","Full compliance layer","Dedicated raise support"],
              featured: false,
            },
          ]).map(({ track, badge, title, range, best, features, featured }, i) => (
            <Reveal key={track} delay={i * 80}>
              <div data-h3d-tilt style={{ background: featured ? C.deep : "rgba(255,255,255,0.04)", border: `1px solid ${featured ? "rgba(196,217,122,0.2)" : "rgba(196,217,122,0.08)"}`, borderRadius: 16, padding: 28, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: C.bright, letterSpacing: "0.8px", textTransform: "uppercase" }}>{track}</span>
                  <span style={{ fontFamily: sans, fontSize: 10, background: "rgba(196,217,122,0.08)", border: "1px solid rgba(196,217,122,0.14)", color: C.pale, padding: "2px 10px", borderRadius: 12 }}>{badge}</span>
                </div>
                <h3 style={{ fontFamily: serif, fontSize: 20, color: C.creamW, marginBottom: 6 }}>{title}</h3>
                <div style={{ fontFamily: serif, fontSize: 28, color: C.gold, letterSpacing: -1, marginBottom: 10 }}>{range}</div>
                <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.45)", lineHeight: 1.6, marginBottom: 20, flex: 1 }}>Best for: {best}</p>
                <ul style={{ listStyle: "none", margin: "0 0 24px" }}>
                  {features.map(f => (
                    <li key={f} style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.6)", padding: "5px 0", borderBottom: "1px solid rgba(196,217,122,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 13, height: 13, borderRadius: "50%", background: "rgba(107,133,38,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: C.pale, flexShrink: 0 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate("/signup")} style={{ width: "100%", padding: "11px 0", borderRadius: 8, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer", background: featured ? C.gold : "transparent", border: `1px solid ${featured ? C.gold : "rgba(196,217,122,0.2)"}`, color: featured ? C.deepest : C.pale }}>
                  Explore {track}
                </button>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div style={{ maxWidth: 1100, margin: "40px auto 0", background: C.deep, border: "1px solid rgba(196,217,122,0.1)", borderRadius: 12, padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.pale, marginBottom: 4 }}>Compliance first.</div>
              <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(196,217,122,0.45)", lineHeight: 1.6, maxWidth: 480 }}>All capital tracks are built with compliance infrastructure included. {inr ? "Revenue-based financing, private placement, and SME IPO frameworks (SEBI / Companies Act)" : "Revenue-share, Reg CF, and Reg A+ frameworks"} are handled by Headroom — you focus on the raise.</p>
            </div>
            <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 13, fontWeight: 700, padding: "12px 24px", borderRadius: 8, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>See launch requirements →</button>
          </div>
        </Reveal>
      </section>

      {/* ═══ ADVISORS ═════════════════════════════════════════════════════════ */}
      <section id="advisors" data-h3d-deco="shapes-light" style={{ background: C.creamW, padding: "88px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto 52px" }}>
            <Label text="For advisors" />
            <h2 style={{ fontFamily: serif, fontSize: 40, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>
              Your clients' cash flow,<br />always in view.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, maxWidth: 500, lineHeight: 1.7 }}>
              Replace quarterly check-ins with a live cash dashboard. Spot tax obligations, vendor payments, and low-balance risks weeks in advance — for every client, in one portfolio view.
            </p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 1100, margin: "0 auto 48px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }}>
          {[
            { role:"Chartered Accountant", emoji:"📋", tagline:"Replace quarterly check-ins with a live cash dashboard.", perks:["Spot tax obligations early","Vendor payment visibility","Low-balance risk alerts","Multi-client view"] },
            { role:"Fractional CFO",        emoji:"📊", tagline:"Serve more clients without hiring analysts.",           perks:["Auto forecast generation","Scenario modelling","Weekly narrative summary","Board-ready language"] },
            { role:"Business Banker",       emoji:"🏦", tagline:"Identify credit needs before clients ask.",             perks:["Pre-qualification signals","Lead with the right product","Live cash visibility","Credit rescue context"] },
            { role:"Startup Advisor",       emoji:"🚀", tagline:"Monitor burn and runway across your portfolio.",        perks:["Burn rate tracking","Runway visibility","Capital readiness scoring","Investor dashboard"] },
          ].map(({ role, emoji, tagline, perks }, i) => (
            <Reveal key={role} delay={i * 80}>
              <div data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: 24, height: "100%", transition: "border-color 0.2s, box-shadow 0.2s" }}
                onMouseOver={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(107,133,38,0.35)"; el.style.boxShadow = "0 8px 28px rgba(44,58,16,0.07)"; }}
                onMouseOut={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(74,94,26,0.12)"; el.style.boxShadow = "none"; }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: C.wash, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>{emoji}</div>
                <h4 style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.txt, marginBottom: 6 }}>{role}</h4>
                <p style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, lineHeight: 1.6, marginBottom: 16 }}>{tagline}</p>
                <ul style={{ listStyle: "none", margin: 0 }}>
                  {perks.map(p => (
                    <li key={p} style={{ fontFamily: sans, fontSize: 11, color: C.txtMut, padding: "4px 0", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.bright, flexShrink: 0, display: "inline-block" }} />{p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 40 }}>
            {[
              { icon:"👥", t:"Client portfolio view",     d:"All clients in one list with current balance, runway, and latest alert." },
              { icon:"📈", t:"Live 90-day forecasts",     d:"Every client's forecast refreshed automatically. No manual data pulls." },
              { icon:"🔔", t:"Alert feed",                d:"One feed across all clients, sorted by severity — act on the right thing first." },
              { icon:"💳", t:"Credit rescue context",     d:"See which clients are pre-qualified and for how much before they ask." },
              { icon:"🏆", t:"Capital readiness scoring", d:"Know which clients are raise-ready and which track suits them best." },
              { icon:"🎨", t:"White-label ready",         d:"Your brand, your portal. Headroom powers it behind the scenes." },
            ].map(({ icon, t, d }) => (
              <div key={t} data-h3d-tilt style={{ background: C.wash, border: "1px solid rgba(74,94,26,0.1)", borderRadius: 12, padding: "20px 20px" }}>
                <div style={{ fontSize: 20, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.txt, marginBottom: 6 }}>{t}</div>
                <div style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, lineHeight: 1.6 }}>{d}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "center", gap: 16 }}>
            <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>Start free 14-day trial</button>
            <a href="#pricing" style={{ fontFamily: sans, fontSize: 14, color: C.mid, textDecoration: "none", padding: "13px 28px", border: `1px solid rgba(74,94,26,0.2)`, borderRadius: 8, display: "inline-flex", alignItems: "center" }}>View pricing</a>
          </div>
        </Reveal>
      </section>

      {/* ═══ TESTIMONIALS ═════════════════════════════════════════════════════ */}
      <section data-h3d-deco="orbs" style={{ background: C.deep, padding: "80px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto 48px" }}>
            <Label text="What owners say" dark />
            <h2 style={{ fontFamily: serif, fontSize: 36, color: C.creamW, letterSpacing: -1 }}>The tool I wish I had in year one.</h2>
          </div>
        </Reveal>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            { initials:"RK", name:"Rajiv Kumar",  biz:"Spice Route Restaurant, Mumbai",      quote:"I knew something was wrong in March but I couldn't see it until it hit. Headroom showed me the problem in January. I had two months to fix it." },
            { initials:"AP", name:"Aditi Patel",  biz:"Meridian Creative Agency, Bangalore", quote:"We were running the business like a guessing game. Clients pay in 60 days, payroll every two weeks. Headroom made that manageable." },
            { initials:"VS", name:"Vikram Shah",  biz:"Shah Construction, Pune",             quote:"The credit feature saved us during the monsoon gap. Headroom offered us options before it hit, and we got through it clean." },
          ].map(({ initials, name, biz, quote }, i) => (
            <Reveal key={name} delay={i * 80}>
              <div data-h3d-tilt style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(196,217,122,0.1)", borderRadius: 14, padding: 24 }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
                  {Array.from({length:5}).map((_,s) => <span key={s} style={{ width: 11, height: 11, background: C.gold, clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)", display: "inline-block" }} />)}
                </div>
                <p style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.65, color: "rgba(244,241,228,0.8)", fontStyle: "italic", marginBottom: 20 }}>"{quote}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.mid, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.pale, flexShrink: 0 }}>{initials}</div>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.pale }}>{name}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(196,217,122,0.4)" }}>{biz}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ PRICING ══════════════════════════════════════════════════════════ */}
      <section id="pricing" data-h3d-deco="shapes-light" style={{ background: C.creamW, padding: "88px 48px", textAlign: "center" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <Label text="Pricing" />
            <h2 style={{ fontFamily: serif, fontSize: 38, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>
              Choose the operating layer<br />your cash flow needs.
            </h2>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(201,162,39,0.08)", border: "1px solid rgba(201,162,39,0.2)", borderRadius: 20, padding: "5px 14px", marginBottom: 12 }}>
              <span style={{ fontFamily: sans, fontSize: 12, color: C.gold }}>✦ Free for 90 days · no card · 🔥 founding price locked for the first 1,000 SMBs</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.txtMut, marginBottom: 52 }}>
              Showing prices in {inr ? "₹ INR (India)" : "$ USD"} · detected from your location
            </div>
          </div>
        </Reveal>

        <div style={{ maxWidth: 940, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            {
              id:"free" as const,
              name:"Free", price:inr ? "₹0" : "$0", period:"forever", featured: false,
              note:inr ? "Free for SMBs under ₹25L turnover · no card ever" : "For early-stage businesses · no card ever",
              desc:"See your cash truth — free for life.",
              features:["30-day cash forecast","Confidence bands","Plain-language alerts","WhatsApp morning brief","1 connected account"],
              disabled:["90-day forecast","Scenario planner","Credit rescue","Advisor access"],
              cta:"Start free",
            },
            {
              id:"growth" as const,
              name:"Growth", price:inr ? "₹999" : "$39", period:"/mo", featured: true,
              note:inr ? "billed yearly · ₹1,499 monthly · 🔥 founding price locked for life" : "billed yearly · $59 monthly · 🔥 founding price locked for life",
              desc:inr ? "For growing SMBs that need full visibility and credit. Cheaper than a half-day of an accountant." : "For growing businesses that need full visibility and credit access.",
              features:["Everything in Free","90-day P10/P50/P90 forecast","Unlimited bank accounts","Scenario planner","AI cash insights","WhatsApp commands + alerts","Embedded credit rescue","Silent underwriting"],
              disabled:[],
              cta:"Get my forecast",
            },
            {
              id:"pro" as const,
              name:"Pro", price:inr ? "₹2,999" : "$99", period:"/mo", featured: false,
              note:inr ? "billed yearly · ₹3,999 monthly" : "billed yearly · $129 monthly",
              desc:"For businesses raising capital or managing investors.",
              features:["Everything in Growth","Investor dashboard","Multi-entity support","Capital raise tools","API access","Priority support","Advisor access"],
              disabled:[],
              cta:"Go Pro →",
            },
          ].map(({ id, name, price, period, note, featured, desc, features, disabled, cta }, i) => (
            <Reveal key={name} delay={i * 80}>
              <div data-h3d-tilt style={{ background: featured ? C.deepest : "#fff", border: `1px solid ${featured ? C.mid : "rgba(74,94,26,0.12)"}`, borderRadius: 16, padding: "32px 28px", textAlign: "left", display: "flex", flexDirection: "column" }}>
                {featured && <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", background: C.gold, color: C.deepest, padding: "3px 12px", borderRadius: 12, display: "inline-block", marginBottom: 16 }}>Most popular</div>}
                <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 600, color: featured ? C.pale : C.txt, marginBottom: 6 }}>{name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2, margin: "12px 0 4px" }}>
                  <span style={{ fontFamily: serif, fontSize: 36, color: featured ? C.gold : C.mid, letterSpacing: -1 }}>{price}</span>
                  <span style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(196,217,122,0.45)" : C.txtMut }}>{period}</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: featured ? "rgba(196,217,122,0.4)" : C.txtMut, marginBottom: 8 }}>{note}</div>
                <div style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(196,217,122,0.55)" : C.txtMut, marginBottom: 24, lineHeight: 1.5 }}>{desc}</div>
                <ul style={{ listStyle: "none", marginBottom: 28, flex: 1 }}>
                  {features.map(f => (
                    <li key={f} style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(196,217,122,0.7)" : C.txtMut, padding: "6px 0", borderBottom: `1px solid ${featured ? "rgba(196,217,122,0.08)" : "rgba(74,94,26,0.06)"}`, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: featured ? "rgba(107,133,38,0.3)" : C.wash, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: featured ? C.pale : C.mid }}>✓</span>{f}
                    </li>
                  ))}
                  {disabled.map(f => (
                    <li key={f} style={{ fontFamily: sans, fontSize: 13, color: "rgba(150,150,150,0.4)", padding: "6px 0", borderBottom: "1px solid rgba(74,94,26,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(200,200,200,0.1)", flexShrink: 0 }} />{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => goPlan(id)} style={{ width: "100%", padding: 12, borderRadius: 8, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer", background: featured ? C.gold : "transparent", border: `1px solid ${featured ? C.gold : "rgba(74,94,26,0.2)"}`, color: featured ? C.deepest : C.mid }}>
                  {cta}
                </button>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Capital add-on card */}
        <Reveal>
          <div style={{ maxWidth: 940, margin: "20px auto 0", background: C.deepest, border: "1px solid rgba(196,217,122,0.12)", borderRadius: 14, padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20, textAlign: "left" }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: C.bright, marginBottom: 6 }}>Capital raise add-on</div>
              <div style={{ fontFamily: serif, fontSize: 22, color: C.creamW, marginBottom: 4 }}>{inr ? "₹4,999" : "$299"} <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(196,217,122,0.4)" }}>/ mo while your raise is live</span></div>
              <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(196,217,122,0.45)", maxWidth: 460 }}>Add a community capital raise (Track A, B, or C) to any Pro plan. Includes investor portal, compliance layer, and campaign page.</p>
            </div>
            <button onClick={() => navigate("/signup")} style={{ background: "transparent", border: `1px solid rgba(196,217,122,0.2)`, color: C.pale, fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "12px 24px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}>
              Explore capital raise →
            </button>
          </div>
        </Reveal>
      </section>

      {/* ═══ FAQ ══════════════════════════════════════════════════════════════ */}
      <Reveal>
        <section data-h3d-deco="shapes-light" style={{ background: C.cream, padding: "72px 48px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <Label text="FAQ" />
            <h2 style={{ fontFamily: serif, fontSize: 34, color: C.txt, letterSpacing: -1, marginBottom: 40 }}>Common questions</h2>
            <div style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: "0 24px" }}>
              {[
                { q:"Do I need an accountant to use Headroom?",            a:"No. Headroom is built for founders. It translates raw transactions into plain language — runway, burn, risk. Your CA can also get their own login with accountant-level access." },
                { q:"Which accounting software does Headroom connect to?",  a:"Tally ERP, Zoho Books, QuickBooks, Xero, and 50+ others. Bank feeds work with most Indian and international banks through secure open-banking APIs." },
                { q:"What does 'confidence bands' mean?",                   a:"Instead of one forecast line, Headroom shows P10 (worst case), P50 (expected), and P90 (best case) for every day. This is more honest than a single-point projection." },
                { q:"How does silent underwriting work?",                   a:"Headroom computes a live credit score from your monthly revenue, burn, runway, and business age — using your own data. No bureau pull. The higher your score, the better the offers." },
                { q:"Can investors see my full financial data?",            a:"No. Investors get a dedicated portal showing only the raise they're part of — their investment, equity %, and progress. All other financials are invisible." },
                { q:"Is there a free trial?",                               a:"Yes — all plans include a free 90-day trial with no credit card required. You keep your data if you downgrade after the trial." },
              ].map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ═══ CTA ══════════════════════════════════════════════════════════════ */}
      <section data-h3d-deco="wire" style={{ background: C.deepest, padding: "96px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(107,133,38,0.25) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <h2 style={{ fontFamily: serif, fontSize: 44, color: C.creamW, letterSpacing: -1.5, marginBottom: 16 }}>Get your first Headroom forecast.</h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(196,217,122,0.55)", marginBottom: 40 }}>Free for 90 days. No credit card. Connect your bank in under 3 minutes.</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <input type="email" placeholder="your@email.com" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,217,122,0.2)", borderRadius: 8, padding: "13px 18px", fontFamily: sans, fontSize: 14, color: C.creamW, width: 280, outline: "none" }} />
            <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>Start free trial →</button>
          </div>
          <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.25)", marginTop: 20 }}>
            Trusted by 12,000+ SMBs &nbsp;·&nbsp; Free for 90 days &nbsp;·&nbsp; No credit card required
          </p>
        </div>
      </section>

      {/* ═══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer style={{ background: C.deepest, borderTop: "1px solid rgba(196,217,122,0.08)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 48px 0", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48, paddingBottom: 48 }}>
          <div>
            <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ color: C.creamW, marginBottom: 10, cursor: "pointer", display: "inline-flex" }} aria-label="Headroom home">
              <Logo variant="horizontal" size={20} />
            </div>
            <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.35)", lineHeight: 1.6, maxWidth: 200 }}>A 10-layer cash flow intelligence platform for modern SMB operators.</p>
          </div>
          {[
            { h:"Platform",    links:["Features","Forecasting","Credit rescue","Community capital","Scenario planner"] },
            { h:"For advisors",links:["Chartered Accountants","Fractional CFOs","Business Bankers","Startup Advisors","White-label"] },
            { h:"Company",     links:["Pricing","About","Blog","Careers","Contact"] },
          ].map(({ h, links }) => (
            <div key={h}>
              <h5 style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(196,217,122,0.4)", marginBottom: 16 }}>{h}</h5>
              {links.map(l => (
                <a key={l} href="#" onClick={e => { e.preventDefault(); navigate("/signup"); }} style={{ display: "block", fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.5)", textDecoration: "none", marginBottom: 10 }}
                  onMouseOver={e => (e.currentTarget.style.color = C.pale)} onMouseOut={e => (e.currentTarget.style.color = "rgba(196,217,122,0.5)")}>{l}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(196,217,122,0.06)", padding: "18px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1100, margin: "0 auto" }}>
          <span style={{ fontFamily: sans, fontSize: 11, color: "rgba(196,217,122,0.25)" }}>© {new Date().getFullYear()} Headroom Technologies Pvt. Ltd.</span>
          <div style={{ display: "flex", gap: 24 }}>
            {["Privacy","Terms","Security"].map(l => (
              <a key={l} href="#" style={{ fontFamily: sans, fontSize: 11, color: "rgba(196,217,122,0.25)", textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
