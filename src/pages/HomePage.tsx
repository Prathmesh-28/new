import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";

/* ─── Colour tokens matching the mockup ─── */
const C = {
  deepest: "#1C2209", deep: "#2E3A10", mid: "#4A5E1A",
  bright: "#6B8526", light: "#96B83D", pale: "#C4D97A",
  wash: "#E8F0C2",   cream: "#F4F1E4", creamW: "#FDFAF0",
  gold: "#C9A227",   goldL: "#E8C84A",
  txt: "#1A1F0A",    txtMid: "#3D4A1E", txtMut: "#6B7A3D",
};

/* ─── Scroll-reveal ─── */
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

/* ─── Bar chart data for hero mockup ─── */
const BAR_DATA = [82,78,85,75,70,62,55,48,40,35,42,50,58,65,70,68,72,78,80,76];
const AREA_DATA = Array.from({ length: 45 }, (_, i) => ({
  i, p50: 28 + Math.sin(i*0.18)*5 + i*0.14,
  p90: 35 + Math.sin(i*0.18)*5 + i*0.14,
  p10: 21 + Math.sin(i*0.18)*5 + i*0.14,
}));

/* ─── Dashboard hero mockup ─── */
function DashMockup() {
  return (
    <div style={{ background: C.deep, border: `1px solid rgba(196,217,122,0.15)`, borderRadius: 14, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
      {/* window chrome */}
      <div style={{ background: "rgba(0,0,0,0.35)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
        {["#E24B4A","#EF9F27","#6B8526"].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }} />)}
        <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: "rgba(196,217,122,0.45)", marginLeft: 6 }}>Headroom — 90-day forecast</span>
      </div>

      <div style={{ padding: 18 }}>
        {/* stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Current Balance", val: "₹4.2L",  sub: "+8% vs last month",  subC: C.light },
            { label: "Runway",          val: "68 days", sub: "at current burn",    subC: C.light },
            { label: "Low Point",       val: "Day 41",  sub: "₹80K warning",       subC: C.gold  },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(196,217,122,0.08)", borderRadius: 8, padding: "11px 12px" }}>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 9, color: "rgba(196,217,122,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 19, fontWeight: 600, color: C.pale }}>{s.val}</div>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 9, color: s.subC, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* bar chart */}
        <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(196,217,122,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 9, color: "rgba(196,217,122,0.38)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Cash position — next 90 days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 58 }}>
            {BAR_DATA.map((h, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: "2px 2px 0 0", minWidth: 7,
                height: `${Math.round(h * 0.72)}%`,
                background: h < 50 ? "#E24B4A" : h < 65 ? C.gold : C.bright,
                opacity: i < 10 ? 0.5 : 0.85,
              }} />
            ))}
          </div>
        </div>

        {/* alert */}
        <div style={{ background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.22)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(201,162,39,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.gold, flexShrink: 0, marginTop: 1 }}>!</div>
          <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 11, color: C.goldL, lineHeight: 1.45 }}>
            You go below your safety threshold in <strong>41 days</strong>. A ₹1.5L revenue advance would keep you positive through October. <span style={{ color: C.goldL, textDecoration: "underline" }}>See options →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ accordion ─── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid rgba(74,94,26,0.12)` }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left", gap: 16 }}>
        <span style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, fontWeight: 500, color: C.txt }}>{q}</span>
        <ChevronDown size={15} style={{ flexShrink: 0, color: C.txtMut, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      <div style={{ overflow: "hidden", maxHeight: open ? 160 : 0, transition: "max-height 0.3s ease", paddingBottom: open ? 16 : 0 }}>
        <p style={{ fontFamily: "system-ui,sans-serif", fontSize: 13, color: C.txtMut, lineHeight: 1.7 }}>{a}</p>
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

  const serif  = "Georgia,'Times New Roman',serif";
  const sans   = "system-ui,-apple-system,'Segoe UI',sans-serif";

  return (
    <div style={{ background: C.creamW, color: C.txt, fontFamily: sans, overflowX: "hidden" }}>

      {/* ═══════════ NAV ═══════════ */}
      <nav style={{
        background: scrolled ? `${C.deepest}f0` : C.deepest,
        backdropFilter: scrolled ? "blur(16px)" : "none",
        padding: "0 48px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 64,
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        transition: "all 0.3s",
        borderBottom: scrolled ? `1px solid rgba(196,217,122,0.1)` : "none",
      }}>
        <div style={{ fontFamily: serif, fontSize: 22, color: C.pale, letterSpacing: -0.5, cursor: "pointer" }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Head<span style={{ color: C.gold }}>room</span>
        </div>

        {/* desktop links */}
        <ul style={{ display: "flex", gap: 32, listStyle: "none", margin: 0, padding: 0 }} className="hidden md:flex">
          {[["Product","#product"],["Features","#features"],["Credit","#credit"],["Pricing","#pricing"],["For Accountants","#roles"]].map(([l,h]) => (
            <li key={l}><a href={h} style={{ fontFamily: sans, fontSize: 13, color: "rgba(196,217,122,0.7)", textDecoration: "none", letterSpacing: 0.3 }}
              onMouseOver={e => (e.currentTarget.style.color = C.pale)}
              onMouseOut={e  => (e.currentTarget.style.color = "rgba(196,217,122,0.7)")}>{l}</a></li>
          ))}
        </ul>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/login")}
            style={{ fontFamily: sans, fontSize: 13, color: "rgba(196,217,122,0.6)", background: "none", border: "none", cursor: "pointer" }}>
            Sign in
          </button>
          <button onClick={() => navigate("/login")}
            style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 13, fontWeight: 700, padding: "9px 20px", borderRadius: 6, border: "none", cursor: "pointer", letterSpacing: 0.2 }}>
            Start free trial
          </button>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section style={{ background: C.deepest, paddingTop: 128, paddingBottom: 80, paddingLeft: 48, paddingRight: 48, position: "relative", overflow: "hidden" }}>
        {/* geometric right panel */}
        <div style={{ position: "absolute", top: 0, right: 0, width: "50%", height: "100%", background: C.deep, clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0% 100%)", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          {/* Left copy */}
          <div className="animate-fade-up">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.3)", borderRadius: 20, padding: "5px 14px", marginBottom: 28 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, display: "inline-block" }} />
              <span style={{ fontFamily: sans, fontSize: 12, color: C.goldL, letterSpacing: 0.4 }}>Now live in India &amp; US</span>
            </div>

            <h1 style={{ fontFamily: serif, fontSize: 52, lineHeight: 1.05, color: C.creamW, marginBottom: 20, letterSpacing: -1.5 }}>
              Know your cash.<br /><em style={{ fontStyle: "normal", color: C.pale }}>Before</em> it matters.
            </h1>

            <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.65, color: "rgba(244,241,228,0.65)", marginBottom: 36, maxWidth: 420 }}>
              Headroom connects your bank and accounting software to show you exactly where your cash will be in 90 days — and what to do about it.
            </p>

            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 32 }}>
              <button onClick={() => navigate("/login")}
                style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "14px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>
                Get your forecast free
              </button>
              <a href="#product" style={{ fontFamily: sans, fontSize: 14, color: C.pale, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                Watch 2-min demo
                <span style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.light}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>▶</span>
              </a>
            </div>

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {["No credit card required", "Setup in 3 minutes", "SOC 2 certified"].map(t => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.5)" }}>
                  <CheckCircle2 size={12} style={{ color: C.light }} />{t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — product mockup */}
          <div className="animate-fade-up delay-200">
            <DashMockup />
          </div>
        </div>
      </section>

      {/* ═══════════ STATS STRIP ═══════════ */}
      <div style={{ background: C.mid, padding: "28px 48px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
        {[
          { n: "₹340Cr+",  d: "Forecasted cash flow tracked" },
          { n: "12,000+",  d: "SMBs on the platform"         },
          { n: "91%",      d: "Forecast accuracy at 30 days" },
          { n: "4.8 days", d: "Avg time to first insight"    },
        ].map(({ n, d }, i) => (
          <div key={d} style={{ textAlign: "center", padding: "0 24px", borderRight: i < 3 ? "1px solid rgba(196,217,122,0.15)" : "none" }}>
            <div style={{ fontFamily: serif, fontSize: 32, color: C.pale, letterSpacing: -1 }}>{n}</div>
            <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.55)", marginTop: 3 }}>{d}</div>
          </div>
        ))}
      </div>

      {/* ═══════════ PROBLEM ═══════════ */}
      <section style={{ background: C.cream, padding: "72px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#C0392B", marginBottom: 14 }}>The problem</div>
            <h2 style={{ fontFamily: serif, fontSize: 36, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>82% of SMBs fail because of cash flow — not bad products.</h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, maxWidth: 560, lineHeight: 1.7, marginBottom: 48 }}>The tools to prevent this exist. They just weren't built for founders. Headroom changes that.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
              {[
                { before: "Spreadsheet updated once a month", after: "Live cash position, refreshed every 5 seconds" },
                { before: '"How much runway?" takes a phone call', after: "Runway on your dashboard, always visible" },
                { before: "Bank loan process takes 4–6 weeks", after: "Competing credit offers in 48 hours from your own data" },
                { before: "Investors ask for updates by email", after: "Investors get a live portal with their own login" },
              ].map(({ before, after }) => (
                <div key={before} style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 12, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, background: "#FEE2E2", color: "#C0392B", padding: "2px 8px", borderRadius: 12, flexShrink: 0, marginTop: 1 }}>Before</span>
                    <p style={{ fontFamily: sans, fontSize: 13, color: C.txtMut, textDecoration: "line-through", lineHeight: 1.5, opacity: 0.7 }}>{before}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, background: C.wash, color: C.mid, padding: "2px 8px", borderRadius: 12, flexShrink: 0, marginTop: 1 }}>After</span>
                    <p style={{ fontFamily: sans, fontSize: 13, color: C.txt, fontWeight: 500, lineHeight: 1.5 }}>{after}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section id="features" style={{ background: C.creamW, padding: "80px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.bright, marginBottom: 14 }}>What Headroom does</div>
            <h2 style={{ fontFamily: serif, fontSize: 38, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>Every tool your cash needs.</h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, maxWidth: 480, lineHeight: 1.7 }}>From 90-day forecasts to instant credit to raising money from your community — all in one dashboard.</p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 1100, margin: "48px auto 0", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {[
            { icon: "📈", title: "90-day cash forecast",       tag: "Core feature", tagStyle: { background: C.wash, color: "#3D5010" },        desc: "See your exact cash position for every day of the next 90 days. Recurring expenses auto-detected. Confidence bands show best and worst case." },
            { icon: "📊", title: "Scenario planner",           tag: "Growth tool",  tagStyle: { background: "rgba(107,133,38,0.12)", color: "#3D5010" }, desc: "Model what happens if you hire, win a contract, or hit a slow month. See the impact instantly — before you commit." },
            { icon: "🔄", title: "Live bank + books sync",     tag: "Automated",    tagStyle: { background: C.wash, color: "#3D5010" },        desc: "Connects to Tally, Zoho Books, QuickBooks, Xero and 50+ platforms. Real-time sync. No manual uploads. No spreadsheets." },
            { icon: "🔔", title: "Smart alert engine",         tag: "AI-powered",   tagStyle: { background: "rgba(201,162,39,0.12)", color: "#7A5A0A" }, desc: 'Alerts that say "you go negative in 18 days" — not just "cash flow warning." Specific. Actionable. Sent 45 days before the problem.' },
            { icon: "💳", title: "Credit rescue",              tag: "Instant",      tagStyle: { background: "rgba(201,162,39,0.12)", color: "#7A5A0A" }, desc: "When a gap approaches, Headroom shows pre-approved credit options and the repayment impact on your forecast before you accept." },
            { icon: "🚀", title: "Community capital",          tag: "Reg CF ready", tagStyle: { background: "rgba(107,133,38,0.12)", color: "#3D5010" }, desc: "Raise from your customers and community. Revenue-share, equity, or mini-IPO. Investors see your live dashboard. Trust built in." },
          ].map(({ icon, title, tag, tagStyle, desc }, i) => (
            <Reveal key={title} delay={i * 60}>
              <div style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: 28, height: "100%", cursor: "default", transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s" }}
                onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(107,133,38,0.4)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 32px rgba(44,58,16,0.08)"; }}
                onMouseOut={e  => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(74,94,26,0.12)";  (e.currentTarget as HTMLDivElement).style.transform = "none";             (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: C.wash, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, fontSize: 20 }}>{icon}</div>
                <h3 style={{ fontFamily: serif, fontSize: 18, color: C.txt, marginBottom: 8, letterSpacing: -0.3 }}>{title}</h3>
                <p style={{ fontFamily: sans, fontSize: 13, color: C.txtMut, lineHeight: 1.65 }}>{desc}</p>
                <span style={{ display: "inline-block", fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: "3px 10px", borderRadius: 12, marginTop: 14, ...tagStyle }}>{tag}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="product" style={{ background: C.deepest, padding: "80px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.pale, marginBottom: 14 }}>How it works</div>
            <h2 style={{ fontFamily: serif, fontSize: 38, color: C.creamW, letterSpacing: -1, marginBottom: 14 }}>Up and running in 10 minutes.</h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: "rgba(196,217,122,0.5)", maxWidth: 440, lineHeight: 1.7 }}>No onboarding call. No accountant needed. Connect your bank and get your first forecast immediately.</p>
          </div>
        </Reveal>
        <div style={{ maxWidth: 1100, margin: "56px auto 0", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, position: "relative" }}>
          {/* connector line */}
          <div style={{ position: "absolute", top: 28, left: "12.5%", right: "12.5%", height: 1, background: "rgba(196,217,122,0.12)" }} />
          {[
            { n:"1", t:"Connect",   d:"Link your bank and Tally/Zoho/QuickBooks. Headroom imports 12 months of history automatically." },
            { n:"2", t:"Forecast",  d:"Your 90-day cash forecast is built and updated live. Confidence bands show best and worst case." },
            { n:"3", t:"Act early", d:"Receive alerts 45 days before a cash gap. Model scenarios. Access credit before you need it." },
            { n:"4", t:"Grow",      d:"Raise capital from your community. Build credit history. Unlock better rates over time." },
          ].map(({ n, t, d }, i) => (
            <Reveal key={n} delay={i * 100}>
              <div style={{ textAlign: "center", padding: "0 20px" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", border: "1px solid rgba(196,217,122,0.2)", background: C.deep, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontFamily: sans, fontSize: 15, fontWeight: 600, color: C.pale, position: "relative", zIndex: 1 }}>{n}</div>
                <h4 style={{ fontFamily: serif, fontSize: 16, color: C.pale, marginBottom: 8 }}>{t}</h4>
                <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.45)", lineHeight: 1.6 }}>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════ CREDIT SECTION ═══════════ */}
      <section id="credit" style={{ background: C.cream, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
          <Reveal>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.bright, marginBottom: 14 }}>Credit rescue</div>
            <h2 style={{ fontFamily: serif, fontSize: 36, color: C.txt, letterSpacing: -1, lineHeight: 1.15, marginBottom: 16 }}>Money when you need it.<br />Terms you can see.</h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, lineHeight: 1.7, marginBottom: 32 }}>When Headroom detects a cash gap, it pre-qualifies you instantly from your own financial data — then shows exactly how repayment affects your forecast before you accept a rupee.</p>
            <div style={{ display: "flex", gap: 24, marginBottom: 36 }}>
              {[{ n:"48 hrs", d:"Avg to first offer"},{ n:"₹5L", d:"Starting amount"},{ n:"0", d:"Bureau pulls"}].map(({ n, d }, i) => (
                <div key={d} style={{ display: "flex", flexDirection: "column", paddingRight: i < 2 ? 24 : 0, borderRight: i < 2 ? `1px solid rgba(74,94,26,0.15)` : "none" }}>
                  <span style={{ fontFamily: serif, fontSize: 28, color: C.mid }}>{n}</span>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, marginTop: 2 }}>{d}</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/login")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>
              Check my eligibility
            </button>
          </Reveal>

          <Reveal delay={100}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: C.txtMut, marginBottom: 4 }}>Your pre-approved options</div>
              {[
                { icon: "📈", bg: C.wash,     title: "Revenue-based advance", desc: "Repay as % of monthly revenue. No fixed EMI.",    amount: "₹8L",      iconC: "#3D5010" },
                { icon: "📄", bg: "#FFF9E6",  title: "Invoice financing",      desc: "Get paid on outstanding invoices today.",          amount: "₹3.2L",    iconC: "#7A5A0A" },
                { icon: "🔒", bg: C.wash,     title: "Revolving credit line",  desc: "Draw what you need. Pay interest only on usage.", amount: "₹5L limit", iconC: "#3D5010" },
              ].map(({ icon, bg, title, desc, amount }) => (
                <div key={title} style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.txt, marginBottom: 2 }}>{title}</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, lineHeight: 1.4 }}>{desc}</div>
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.mid, whiteSpace: "nowrap" }}>{amount}</div>
                </div>
              ))}
              <div style={{ background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.2)", borderRadius: 12, padding: "13px 16px" }}>
                <p style={{ fontFamily: sans, fontSize: 12, color: "#7A5A0A", lineHeight: 1.5 }}>Taking ₹8L now keeps you positive for <strong>74 days</strong> and costs ₹96K total (12% effective rate). Repayment shown in your forecast.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════ ROLES ═══════════ */}
      <section id="roles" style={{ background: C.deepest, padding: "80px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.pale, marginBottom: 14 }}>Access control</div>
            <h2 style={{ fontFamily: serif, fontSize: 36, color: C.creamW, letterSpacing: -1, marginBottom: 14 }}>One platform. Four roles.</h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: "rgba(196,217,122,0.5)", maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>Invite your whole team. Everyone sees only what they need to.</p>
          </div>
        </Reveal>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {[
            { role: "Founder / Owner",  emoji: "🏢", tabs: ["Dashboard","Forecast","Credit","Capital","Admin"],   note: "Full access"    },
            { role: "Accountant / CA",  emoji: "📋", tabs: ["Dashboard","Forecast"],                               note: "Finance view"   },
            { role: "Investor",         emoji: "👥", tabs: ["Dashboard","Capital"],                                note: "Portfolio view" },
            { role: "Super Admin",      emoji: "🛡", tabs: ["All tabs","User mgmt","Audit log"],                  note: "Platform admin" },
          ].map(({ role, emoji, tabs, note }, i) => (
            <Reveal key={role} delay={i * 80}>
              <div style={{ background: C.deep, border: "1px solid rgba(196,217,122,0.1)", borderRadius: 14, padding: 22 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(196,217,122,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 14 }}>{emoji}</div>
                <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, color: C.bright, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>{note}</div>
                <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.pale, marginBottom: 12 }}>{role}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tabs.map(t => <span key={t} style={{ fontFamily: sans, fontSize: 10, background: "rgba(196,217,122,0.06)", border: "1px solid rgba(196,217,122,0.1)", padding: "2px 8px", borderRadius: 10, color: "rgba(196,217,122,0.5)" }}>{t}</span>)}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════ TESTIMONIALS ═══════════ */}
      <section style={{ background: C.deep, padding: "80px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto 48px" }}>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.pale, marginBottom: 14 }}>What owners say</div>
            <h2 style={{ fontFamily: serif, fontSize: 36, color: C.creamW, letterSpacing: -1 }}>The tool I wish I had in year one.</h2>
          </div>
        </Reveal>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            { initials:"RK", name:"Rajiv Kumar",    biz:"Spice Route Restaurant, Mumbai",         quote:"I knew something was wrong in March but I couldn't see it until it hit. Headroom showed me the problem in January. I had two months to fix it." },
            { initials:"AP", name:"Aditi Patel",    biz:"Meridian Creative Agency, Bangalore",    quote:"We run the business like it was a guessing game. Clients pay in 60 days, payroll every two weeks. Headroom made that manageable." },
            { initials:"VS", name:"Vikram Shah",    biz:"Shah Construction, Pune",                quote:"The credit feature saved us during the monsoon gap. Headroom offered us options before it hit, and we got through it clean." },
          ].map(({ initials, name, biz, quote }, i) => (
            <Reveal key={name} delay={i * 80}>
              <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(196,217,122,0.1)", borderRadius: 14, padding: 24 }}>
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

      {/* ═══════════ PRICING ═══════════ */}
      <section id="pricing" style={{ background: C.creamW, padding: "80px 48px", textAlign: "center" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.bright, marginBottom: 14 }}>Pricing</div>
            <h2 style={{ fontFamily: serif, fontSize: 38, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>Simple. No surprises.</h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, marginBottom: 52, maxWidth: 440, margin: "0 auto 52px" }}>Start free. Upgrade when you need credit access or raise capital. No hidden fees, no per-seat nonsense.</p>
          </div>
        </Reveal>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            {
              name:"Starter", price:"₹0", period:"forever free", featured: false,
              desc: "For founders exploring their numbers.",
              features:["90-day cash forecast","2 bank accounts","Basic email alerts","Tally + Zoho Books"],
              disabled:["Scenario planner","Credit access"],
              cta:"Get started free",
            },
            {
              name:"Growth", price:"₹2,999", period:"per month, billed annually", featured: true,
              desc: "For growing SMBs that need full visibility and credit.",
              features:["Everything in Starter","Unlimited accounts","Scenario planner","AI weekly insights","Credit rescue access","50+ integrations"],
              disabled:[],
              cta:"Start 14-day trial",
            },
            {
              name:"Pro", price:"₹5,999", period:"per month, billed annually", featured: false,
              desc: "For businesses raising capital or managing investors.",
              features:["Everything in Growth","Community capital raise","Investor portal","Accountant dashboard","API access","Priority support"],
              disabled:[],
              cta:"Contact sales",
            },
          ].map(({ name, price, period, featured, desc, features, disabled, cta }, i) => (
            <Reveal key={name} delay={i * 80}>
              <div style={{ background: featured ? C.deepest : "#fff", border: `1px solid ${featured ? C.mid : "rgba(74,94,26,0.12)"}`, borderRadius: 16, padding: "32px 28px", textAlign: "left", display: "flex", flexDirection: "column", position: "relative" }}>
                {featured && <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", background: C.gold, color: C.deepest, padding: "3px 12px", borderRadius: 12, display: "inline-block", marginBottom: 16 }}>Most popular</div>}
                <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 600, color: featured ? C.pale : C.txt, marginBottom: 6 }}>{name}</div>
                <div style={{ fontFamily: serif, fontSize: 36, color: featured ? C.gold : C.mid, letterSpacing: -1, margin: "12px 0 4px" }}>{price}</div>
                <div style={{ fontFamily: sans, fontSize: 12, color: featured ? "rgba(196,217,122,0.45)" : C.txtMut, marginBottom: 8 }}>{period}</div>
                <div style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(196,217,122,0.55)" : C.txtMut, marginBottom: 24, lineHeight: 1.5 }}>{desc}</div>
                <ul style={{ listStyle: "none", marginBottom: 28, flex: 1 }}>
                  {features.map(f => (
                    <li key={f} style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(196,217,122,0.7)" : C.txtMut, padding: "6px 0", borderBottom: `1px solid ${featured ? "rgba(196,217,122,0.08)" : "rgba(74,94,26,0.06)"}`, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: featured ? "rgba(107,133,38,0.3)" : C.wash, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: featured ? C.pale : C.mid }}>✓</span>{f}
                    </li>
                  ))}
                  {disabled.map(f => (
                    <li key={f} style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(196,217,122,0.25)" : "rgba(107,107,107,0.4)", padding: "6px 0", borderBottom: "1px solid rgba(74,94,26,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(200,200,200,0.15)", flexShrink: 0, display: "inline-block" }} />{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate("/login")} style={{ width: "100%", padding: 12, borderRadius: 8, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer", background: featured ? C.gold : "transparent", border: `1px solid ${featured ? C.gold : "rgba(74,94,26,0.2)"}`, color: featured ? C.deepest : C.mid }}>
                  {cta}
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <Reveal>
        <section style={{ background: C.cream, padding: "72px 48px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.bright, marginBottom: 14 }}>FAQ</div>
            <h2 style={{ fontFamily: serif, fontSize: 34, color: C.txt, letterSpacing: -1, marginBottom: 40 }}>Common questions</h2>
            <div style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: "0 24px" }}>
              {[
                { q: "Do I need an accountant to use Headroom?",        a: "No. Headroom is built for founders. It translates raw transactions into plain language — runway, burn, risk. Your CA can also get their own login with accountant-level access." },
                { q: "Which accounting software does Headroom connect to?", a: "Tally ERP, Zoho Books, QuickBooks, Xero, and 50+ others via direct API. Bank feeds work with most Indian and international banks through secure open-banking APIs." },
                { q: "How does the credit eligibility work?",           a: "Headroom computes a live underwriting score from your monthly revenue, burn rate, runway, and business age — using your own data. No bureau pull. The higher your score, the better the offers." },
                { q: "Can investors see my sensitive financial data?",   a: "No. Investors get a dedicated portal showing only the capital raise they're part of — their investment, equity %, and progress. All other financials are invisible to them." },
                { q: "Is there a free trial for paid plans?",           a: "Yes — Growth comes with a 14-day free trial, no credit card required. You keep your data and forecast history if you downgrade to Starter." },
              ].map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ═══════════ CTA ═══════════ */}
      <section style={{ background: C.deepest, padding: "96px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(107,133,38,0.25) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <h2 style={{ fontFamily: serif, fontSize: 44, color: C.creamW, letterSpacing: -1.5, marginBottom: 16 }}>See your next 90 days.<br />Start free today.</h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(196,217,122,0.55)", marginBottom: 40 }}>No credit card. No accountant needed. Connect your bank in under 3 minutes.</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <input type="email" placeholder="your@email.com" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,217,122,0.2)", borderRadius: 8, padding: "13px 18px", fontFamily: sans, fontSize: 14, color: C.creamW, width: 280, outline: "none" }} />
            <button onClick={() => navigate("/login")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>
              Get my forecast →
            </button>
          </div>
          <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.25)", marginTop: 20 }}>
            Trusted by 12,000+ SMBs across India and US &nbsp;·&nbsp; SOC 2 Type II certified &nbsp;·&nbsp; RBI LSP registered
          </p>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer style={{ background: C.deepest, borderTop: "1px solid rgba(196,217,122,0.08)", padding: 48, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48 }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20, color: C.pale, marginBottom: 10 }}>Head<span style={{ color: C.gold }}>room</span></div>
          <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.35)", lineHeight: 1.6, maxWidth: 200 }}>Cash flow intelligence for the businesses that keep the world running.</p>
        </div>
        {[
          { h:"Product",      links:["Forecasting","Scenario planner","Alert engine","Credit rescue","Community capital"] },
          { h:"Integrations", links:["Tally ERP","Zoho Books","QuickBooks","Xero","All integrations"] },
          { h:"Company",      links:["About","Blog","Careers","Press","Contact"] },
        ].map(({ h, links }) => (
          <div key={h}>
            <h5 style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(196,217,122,0.4)", marginBottom: 16 }}>{h}</h5>
            {links.map(l => (
              <a key={l} href="#" onClick={e => { e.preventDefault(); navigate("/login"); }}
                style={{ display: "block", fontFamily: sans, fontSize: 12, color: "rgba(196,217,122,0.5)", textDecoration: "none", marginBottom: 10 }}
                onMouseOver={e => (e.currentTarget.style.color = C.pale)}
                onMouseOut={e  => (e.currentTarget.style.color = "rgba(196,217,122,0.5)")}>{l}</a>
            ))}
          </div>
        ))}
      </footer>
      <div style={{ background: C.deepest, borderTop: "1px solid rgba(196,217,122,0.06)", padding: "18px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: sans, fontSize: 11, color: "rgba(196,217,122,0.25)" }}>© {new Date().getFullYear()} Headroom Technologies Pvt. Ltd.</span>
        <div style={{ display: "flex", gap: 24 }}>
          {["Privacy","Terms","Security"].map(l => (
            <a key={l} href="#" style={{ fontFamily: sans, fontSize: 11, color: "rgba(196,217,122,0.25)", textDecoration: "none" }}>{l}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
