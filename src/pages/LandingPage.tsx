// Headroom marketing landing page (route: /landing).
// A standalone, video-atmosphere landing that adapts a premium reference aesthetic
// (glass nav, scramble-in headline, node-network canvas, scroll-driven cinematic text,
// metrics band, module grid, layered "how it works", video footer) to Headroom's real
// navy+green brand and honest product copy. Self-contained: does NOT touch HomePage.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionTemplate,
} from "motion/react";
import {
  ArrowRight,
  Wallet,
  LineChart,
  ShieldCheck,
  ReceiptText,
  Landmark,
  Activity,
  Plug,
  BrainCircuit,
  Rocket,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Shared assets + tokens                                             */
/* ------------------------------------------------------------------ */

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/";
const VIDEO = {
  hero: CDN + "hf_20260622_092455_089c54f8-3b03-4966-9df1-e9746063d0ef.mp4",
  cinematic: CDN + "hf_20260622_095750_32a52ce0-2005-45c9-9093-41f03fde9530.mp4",
  metrics: CDN + "hf_20260622_095810_ecea3dd2-8f6e-4696-8bd8-4219290b6589.mp4",
  footer: CDN + "hf_20260622_080203_fd7f4f85-3a86-4837-8192-85e7bfe68e75.mp4",
};

const EASE = [0.215, 0.61, 0.355, 1] as const;

/* ------------------------------------------------------------------ */
/*  ScrambleIn — left-to-right character reveal (no dependency)        */
/* ------------------------------------------------------------------ */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><";

function useScrambleIn(text: string, start: boolean, delay = 0): string {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!start) {
      setOut("");
      return;
    }
    let revealed = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      revealed += 0.5;
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === " ") {
          s += " ";
        } else if (i < revealed) {
          s += ch;
        } else if (i < revealed + 3) {
          s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      }
      setOut(s);
      if (revealed < text.length) timer = setTimeout(tick, 25);
      else setOut(text);
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [text, start, delay]);
  return out || " ";
}

function ScrambleIn({ text, start, delay = 0 }: { text: string; start: boolean; delay?: number }) {
  return <>{useScrambleIn(text, start, delay)}</>;
}

/* ------------------------------------------------------------------ */
/*  NodeField — living data / neural-network canvas backdrop           */
/* ------------------------------------------------------------------ */

function NodeField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };
    type P = { x: number; y: number; vx: number; vy: number };
    let pts: P[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(28, Math.min(96, Math.floor((w * h) / 16000)));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
      }));
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i];
          const b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 118) {
            ctx.strokeStyle = `rgba(95,190,124,${(1 - d / 118) * 0.16})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        const near = Math.hypot(p.x - mouse.x, p.y - mouse.y) < 130;
        ctx.beginPath();
        ctx.arc(p.x, p.y, near ? 2.4 : 1.3, 0, Math.PI * 2);
        ctx.fillStyle = near ? "rgba(123,209,148,0.9)" : "rgba(232,237,246,0.4)";
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };

    resize();
    frame();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);
  return <canvas ref={ref} className="hl-nodefield" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function TintedVideo({ src, opacity = 0.5 }: { src: string; opacity?: number }) {
  return (
    <video
      className="hl-bgvideo"
      style={{ opacity }}
      src={src}
      muted
      loop
      autoPlay
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  );
}

const reveal = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
} as const;

/* ------------------------------------------------------------------ */
/*  Navbar                                                             */
/* ------------------------------------------------------------------ */

function Nav({ entered }: { entered: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <motion.nav
      className={`hl-nav ${scrolled ? "hl-nav-solid" : ""}`}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: entered ? 1 : 0, y: entered ? 0 : -12 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div className="hl-nav-inner hl-glass">
        <button className="hl-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="hl-brand-mark" aria-hidden="true" />
          <span className="hl-brand-name">headroom</span>
        </button>
        <div className="hl-nav-links">
          <button onClick={() => go("modules")}>Modules</button>
          <button onClick={() => go("how")}>How it works</button>
          <button onClick={() => go("metrics")}>Why Headroom</button>
        </div>
        <div className="hl-nav-cta">
          <Link to="/login" className="hl-link-ghost">
            Log in
          </Link>
          <Link to="/signup" className="hl-btn hl-btn-primary">
            Start free <ArrowRight size={15} strokeWidth={2.5} />
          </Link>
          <button
            className="hl-burger"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={open ? "on" : ""} />
            <span className={open ? "on" : ""} />
            <span className={open ? "on" : ""} />
          </button>
        </div>
      </div>
      {open && (
        <div className="hl-mobile-menu hl-glass">
          <button onClick={() => go("modules")}>Modules</button>
          <button onClick={() => go("how")}>How it works</button>
          <button onClick={() => go("metrics")}>Why Headroom</button>
          <Link to="/login" onClick={() => setOpen(false)}>
            Log in
          </Link>
          <Link to="/signup" className="hl-btn hl-btn-primary" onClick={() => setOpen(false)}>
            Start free <ArrowRight size={15} strokeWidth={2.5} />
          </Link>
        </div>
      )}
    </motion.nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function Hero({ entered }: { entered: boolean }) {
  return (
    <section className="hl-hero" id="top">
      <TintedVideo src={VIDEO.hero} opacity={0.42} />
      <div className="hl-hero-tint" aria-hidden="true" />
      <NodeField />
      <div className="hl-dotgrid" aria-hidden="true" />
      <span className="hl-watermark" aria-hidden="true">
        CASHFLOW
      </span>

      <div className="hl-hero-body">
        <div className="hl-hero-spacer" />
        <div className="hl-hero-row">
          <div className="hl-hero-left">
            <motion.p
              className="hl-eyebrow"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: entered ? 1 : 0, y: entered ? 0 : 12 }}
              transition={{ duration: 0.9, ease: EASE }}
            >
              <span className="hl-eyebrow-dot" /> THE FINANCE OS FOR INDIAN SMBs
            </motion.p>
            <h1 className="hl-h1">
              <span className="hl-h1-line">
                <ScrambleIn text="Know your cash." start={entered} delay={200} />
              </span>
              <span className="hl-h1-line hl-h1-accent">
                <ScrambleIn text="Before it knows you." start={entered} delay={520} />
              </span>
            </h1>
            <motion.p
              className="hl-hero-desc"
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: entered ? 1 : 0, y: entered ? 0 : 25 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
            >
              Headroom turns your bank feeds, invoices, GST filings and payroll into one live
              picture of your money — a runway clock, a 13-week forecast, and a health score that
              updates as you trade. Built India-first, for your whole team.
            </motion.p>
            <motion.div
              className="hl-hero-ctas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: entered ? 1 : 0, y: entered ? 0 : 20 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.45 }}
            >
              <Link to="/signup" className="hl-btn hl-btn-primary hl-btn-lg">
                Start free <ArrowRight size={17} strokeWidth={2.5} />
              </Link>
              <button
                className="hl-btn hl-btn-ghost hl-btn-lg"
                onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
              >
                See how it works
              </button>
            </motion.div>
          </div>

          <motion.div
            className="hl-hero-chip hl-glass"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: entered ? 1 : 0, y: entered ? 0 : 24 }}
            transition={{ duration: 1, ease: EASE, delay: 0.7 }}
          >
            <div className="hl-chip-row">
              <span className="hl-chip-label">RUNWAY</span>
              <span className="hl-chip-live">
                <span className="hl-pulse" /> live
              </span>
            </div>
            <div className="hl-chip-big">7.4 months</div>
            <div className="hl-chip-bar">
              <span style={{ width: "62%" }} />
            </div>
            <div className="hl-chip-foot">
              <span>Cash ₹42.6L</span>
              <span className="hl-chip-up">▲ health 78</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="hl-scrolldown" aria-hidden="true">
        <span />
      </div>
    </section>
  );
}

function Cinematic() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 15, damping: 32, mass: 1.8 });
  const y = useTransform(smooth, [0, 1], [60, -120]);
  const opacity = useTransform(smooth, [0.28, 0.5], [0, 1]);
  const transform = useMotionTemplate`perspective(400px) rotateX(24deg) translateY(${y}px) translateZ(15px)`;
  return (
    <section className="hl-cinematic" ref={ref}>
      <TintedVideo src={VIDEO.cinematic} opacity={0.34} />
      <div className="hl-top-fade" aria-hidden="true" />
      <div className="hl-cinematic-wrap">
        <motion.p className="hl-cinematic-text" style={{ transform, opacity }}>
          A business rarely fails because the work dried up. It fails because the cash ran out while
          no one was watching. Headroom watches the money the way you can’t — every rupee in and out,
          reconciled, forecast, and flagged <em>before</em> it becomes a problem.
        </motion.p>
      </div>
    </section>
  );
}

const METRICS = [
  { value: "13-week", label: "Rolling cash forecast, updated as you trade" },
  { value: "GST + TDS", label: "Returns reconciled against your books, India-first" },
  { value: "One ledger", label: "A single source of truth behind every module" },
];

function Metrics() {
  return (
    <section className="hl-metrics" id="metrics">
      <TintedVideo src={VIDEO.metrics} opacity={0.28} />
      <div className="hl-metrics-inner">
        <motion.p
          className="hl-section-eyebrow"
          {...reveal}
          transition={{ duration: 1.1, ease: EASE }}
        >
          WHY HEADROOM
        </motion.p>
        <div className="hl-metrics-grid">
          {METRICS.map((m, i) => (
            <motion.div
              key={m.value}
              className="hl-metric"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.8, ease: EASE, delay: i * 0.15 }}
            >
              <div className="hl-metric-value">{m.value}</div>
              <div className="hl-metric-label">{m.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const MODULES = [
  {
    icon: Wallet,
    title: "Cash & Runway",
    body: "Live balance across every bank and wallet, with a runway clock that counts down in real rupees — not last month’s spreadsheet.",
  },
  {
    icon: LineChart,
    title: "13-Week Forecast",
    body: "See the crunch three weeks before it lands. Model salaries, GST outflows, and the big invoice that hasn’t been paid yet.",
  },
  {
    icon: ShieldCheck,
    title: "GST & TDS Compliance",
    body: "Returns reconciled against your books. ITC leakage, IMS mismatches, and 43B(h) exposure surfaced before the deadline.",
  },
  {
    icon: ReceiptText,
    title: "Invoicing & Receivables",
    body: "Raise GST invoices, chase what’s overdue automatically, and turn your best receivables into working capital.",
  },
  {
    icon: Landmark,
    title: "Credit & Financing",
    body: "An in-house scorecard reads your cash and GST history to size a fair offer — then puts the financing in reach.",
  },
  {
    icon: Activity,
    title: "Analytics & Health",
    body: "One health score, plus the dashboards your CA and your board actually ask for — no exports, no reconciling by hand.",
  },
];

function Modules() {
  return (
    <section className="hl-modules" id="modules">
      <div className="hl-modules-inner">
        <motion.div className="hl-modules-head" {...reveal} transition={{ duration: 1, ease: EASE }}>
          <div>
            <p className="hl-section-eyebrow">ONE PLATFORM</p>
            <h2 className="hl-h2">
              Every part of your money, <span className="hl-accent-text">on one screen.</span>
            </h2>
          </div>
          <p className="hl-modules-sub">
            Eleven modules, one shared ledger. Nothing gets exported, re-keyed, or lost between tools —
            because it was never in separate tools to begin with.
          </p>
        </motion.div>
        <div className="hl-module-grid">
          {MODULES.map((m, i) => {
            const Icon = m.icon;
            return (
              <motion.article
                key={m.title}
                className="hl-card hl-glass"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, ease: EASE, delay: (i % 3) * 0.1 }}
              >
                <span className="hl-card-icon">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className="hl-card-title">{m.title}</h3>
                <p className="hl-card-body">{m.body}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const LAYERS = [
  {
    icon: Plug,
    step: "LAYER 1",
    title: "Connect",
    body: "Bank feeds, the GST portal, your invoices and payroll — pulled in and reconciled automatically, on day one.",
  },
  {
    icon: BrainCircuit,
    step: "LAYER 2",
    title: "Understand",
    body: "Every signal becomes a live ledger: runway, a 13-week forecast, a health score, and your real compliance status.",
  },
  {
    icon: Rocket,
    step: "LAYER 3",
    title: "Act",
    body: "Chase a payment, file a return, raise financing, or fire off an automation — all from the same picture of the truth.",
  },
];

function HowItWorks() {
  return (
    <section className="hl-how" id="how">
      <div className="hl-how-inner">
        <motion.div className="hl-how-head" {...reveal} transition={{ duration: 1, ease: EASE }}>
          <p className="hl-section-eyebrow">HOW IT WORKS</p>
          <h2 className="hl-h2">Three layers. Zero re-keying.</h2>
          <p className="hl-how-sub">
            Headroom sits on top of the systems you already use and turns raw financial noise into a
            single, decision-ready view of the business.
          </p>
        </motion.div>
        <div className="hl-how-grid">
          {LAYERS.map((l, i) => {
            const Icon = l.icon;
            return (
              <motion.div
                key={l.title}
                className="hl-layer hl-glass"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.8, ease: EASE, delay: i * 0.12 }}
              >
                <div className="hl-layer-top">
                  <span className="hl-layer-step">{l.step}</span>
                  <span className="hl-layer-icon">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                </div>
                <h3 className="hl-layer-title">{l.title}</h3>
                <p className="hl-layer-body">{l.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="hl-ctaband">
      <motion.div
        className="hl-ctaband-inner"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1, ease: EASE }}
      >
        <h2 className="hl-cta-h">
          Ready to see <span className="hl-accent-text">your runway?</span>
        </h2>
        <p className="hl-cta-sub">
          Set up your first live cash picture in minutes. No card, no data lock-in.
        </p>
        <div className="hl-hero-ctas hl-center">
          <Link to="/signup" className="hl-btn hl-btn-primary hl-btn-lg">
            Start free <ArrowRight size={17} strokeWidth={2.5} />
          </Link>
          <Link to="/login" className="hl-btn hl-btn-ghost hl-btn-lg">
            Log in
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="hl-footer">
      <div className="hl-footer-video">
        <TintedVideo src={VIDEO.footer} opacity={0.5} />
        <div className="hl-footer-video-tint" aria-hidden="true" />
      </div>
      <div className="hl-footer-body">
        <div>
          <div className="hl-brand hl-brand-static">
            <span className="hl-brand-mark" aria-hidden="true" />
            <span className="hl-brand-name">headroom</span>
          </div>
          <p className="hl-footer-tag">
            The finance OS for lean Indian businesses. Know your cash before it knows you.
          </p>
        </div>
        <div className="hl-footer-cols">
          <div>
            <span className="hl-footer-coltitle">PRODUCT</span>
            <button onClick={() => document.getElementById("modules")?.scrollIntoView({ behavior: "smooth" })}>
              Modules
            </button>
            <button onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
              How it works
            </button>
            <Link to="/signup">Get started</Link>
          </div>
          <div>
            <span className="hl-footer-coltitle">ACCOUNT</span>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
            <Link to="/signup-advisor">For CAs & advisors</Link>
          </div>
        </div>
        <div className="hl-footer-legal">© 2026 Headroom. Built India-first.</div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    document.title = "Headroom — Know your cash before it knows you";
    // Ensure the display + mono faces are present (Inter + Space Grotesk ship in index.html;
    // Space Mono is the data/terminal face this page adds). Injected, so nothing global changes.
    const id = "hl-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap";
      document.head.appendChild(link);
    }
    const t = setTimeout(() => setEntered(true), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="hl-root">
      <style>{CSS}</style>
      <Nav entered={entered} />
      <Hero entered={entered} />
      <Cinematic />
      <Metrics />
      <Modules />
      <HowItWorks />
      <CtaBand />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scoped styles (hl- prefix; no global bleed, HomePage untouched)    */
/* ------------------------------------------------------------------ */

const CSS = `
.hl-root {
  --nv0: #070b16; --nv1: #0a0f1e; --nv2: #101830; --nv3: #18233f;
  --grn: #5fbe7c; --grn-l: #7bd194; --grn-d: #3d9a60;
  --txt: #e8edf6; --mut: #9aa6be; --faint: rgba(232,237,246,0.55);
  --line: rgba(255,255,255,0.09);
  position: relative;
  background: var(--nv1);
  color: var(--txt);
  font-family: "Inter", system-ui, sans-serif;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}
.hl-root *, .hl-root *::before, .hl-root *::after { box-sizing: border-box; }
.hl-root button { font-family: inherit; cursor: pointer; background: none; border: none; color: inherit; }
.hl-root a { text-decoration: none; color: inherit; }
.hl-display, .hl-h1, .hl-h2, .hl-cta-h { font-family: "Space Grotesk", "Inter", sans-serif; }
.hl-mono, .hl-eyebrow, .hl-section-eyebrow, .hl-metric-value, .hl-layer-step, .hl-footer-coltitle,
.hl-chip-label, .hl-chip-big, .hl-brand-name { font-family: "Space Mono", ui-monospace, monospace; }

/* Glass */
.hl-glass {
  background: rgba(255,255,255,0.045);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--line);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.08), 0 24px 60px -30px rgba(0,0,0,0.7);
}

/* Buttons */
.hl-btn { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 999px;
  font-weight: 600; font-size: 0.86rem; padding: 0.6rem 1.15rem; transition: all 0.2s ease; white-space: nowrap; }
.hl-btn-lg { padding: 0.85rem 1.5rem; font-size: 0.95rem; }
.hl-btn-primary { background: var(--grn); color: #07130c; }
.hl-btn-primary:hover { background: var(--grn-l); transform: translateY(-1px); box-shadow: 0 12px 30px -12px rgba(95,190,124,0.6); }
.hl-btn-ghost { border: 1px solid var(--line); color: var(--txt); background: rgba(255,255,255,0.03); }
.hl-btn-ghost:hover { background: rgba(255,255,255,0.09); }
.hl-link-ghost { font-size: 0.86rem; color: var(--faint); font-weight: 500; padding: 0 0.4rem; }
.hl-link-ghost:hover { color: var(--txt); }
.hl-accent-text { color: var(--grn-l); }

/* Nav */
.hl-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 50; padding: 1rem 1.25rem; }
.hl-nav-inner { max-width: 76rem; margin: 0 auto; height: 60px; border-radius: 16px;
  display: flex; align-items: center; justify-content: space-between; padding: 0 0.7rem 0 1.1rem;
  transition: background 0.3s ease; }
.hl-nav-solid .hl-nav-inner { background: rgba(10,15,30,0.72); }
.hl-brand { display: inline-flex; align-items: center; gap: 0.55rem; }
.hl-brand-mark { width: 15px; height: 15px; border-radius: 5px;
  background: linear-gradient(135deg, var(--grn-l), var(--grn-d)); box-shadow: 0 0 14px rgba(95,190,124,0.55); }
.hl-brand-name { font-size: 1.02rem; font-weight: 700; letter-spacing: -0.01em; }
.hl-nav-links { display: flex; align-items: center; gap: 1.7rem; }
.hl-nav-links button { font-size: 0.86rem; color: var(--faint); font-weight: 500; }
.hl-nav-links button:hover { color: var(--txt); }
.hl-nav-cta { display: flex; align-items: center; gap: 0.6rem; }
.hl-burger { display: none; width: 34px; height: 34px; flex-direction: column; justify-content: center;
  align-items: center; gap: 4px; border-radius: 9px; }
.hl-burger span { width: 17px; height: 1.6px; background: var(--txt); border-radius: 2px; transition: all 0.25s ease; }
.hl-burger span.on:nth-child(1) { transform: translateY(5.6px) rotate(45deg); }
.hl-burger span.on:nth-child(2) { opacity: 0; }
.hl-burger span.on:nth-child(3) { transform: translateY(-5.6px) rotate(-45deg); }
.hl-mobile-menu { max-width: 76rem; margin: 0.5rem auto 0; border-radius: 16px; padding: 0.8rem; display: none;
  flex-direction: column; gap: 0.35rem; }
.hl-mobile-menu button, .hl-mobile-menu a { text-align: left; padding: 0.7rem 0.8rem; border-radius: 10px;
  font-size: 0.95rem; color: var(--faint); }
.hl-mobile-menu button:hover, .hl-mobile-menu a:hover { background: rgba(255,255,255,0.06); color: var(--txt); }
.hl-mobile-menu .hl-btn { justify-content: center; margin-top: 0.3rem; color: #07130c; }

/* Hero */
.hl-hero { position: relative; min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column;
  overflow: hidden; }
.hl-bgvideo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.hl-hero-tint { position: absolute; inset: 0; z-index: 1;
  background:
    radial-gradient(1100px 620px at 72% 18%, rgba(95,190,124,0.16), transparent 60%),
    linear-gradient(180deg, rgba(7,11,22,0.72) 0%, rgba(10,15,30,0.55) 40%, rgba(10,15,30,0.94) 100%); }
.hl-nodefield { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; }
.hl-dotgrid { position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0.06;
  background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 24px 24px; }
.hl-watermark { position: absolute; left: 50%; top: 50%; transform: translate(-50%, calc(-50% + 40px));
  z-index: 1; font-family: "Space Grotesk", sans-serif; font-weight: 700; text-transform: uppercase;
  font-size: clamp(90px, 24vw, 440px); letter-spacing: -0.04em; line-height: 1; white-space: nowrap;
  color: rgba(142,127,148,0.10); pointer-events: none; user-select: none; }
.hl-hero-body { position: relative; z-index: 10; flex: 1; display: flex; flex-direction: column;
  max-width: 76rem; width: 100%; margin: 0 auto; padding: 6rem 1.5rem 3rem; }
.hl-hero-spacer { flex: 1; min-height: 3rem; }
.hl-hero-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 2.5rem; }
.hl-hero-left { display: flex; flex-direction: column; gap: 1.3rem; max-width: 42rem; }
.hl-eyebrow { display: inline-flex; align-items: center; gap: 0.6rem; font-size: 0.72rem;
  letter-spacing: 0.22em; color: var(--faint); }
.hl-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--grn); box-shadow: 0 0 8px var(--grn); }
.hl-h1 { display: flex; flex-direction: column; font-weight: 500; line-height: 0.98; letter-spacing: -0.03em;
  font-size: clamp(40px, 7.5vw, 86px); }
.hl-h1-line { display: block; }
.hl-h1-accent { color: var(--grn-l); }
.hl-hero-desc { max-width: 33rem; font-size: 0.98rem; line-height: 1.65; color: var(--faint); }
.hl-hero-ctas { display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap; margin-top: 0.4rem; }
.hl-center { justify-content: center; }

/* Hero chip */
.hl-hero-chip { width: 260px; border-radius: 18px; padding: 1.15rem 1.25rem; display: flex; flex-direction: column; gap: 0.7rem; }
.hl-chip-row { display: flex; align-items: center; justify-content: space-between; }
.hl-chip-label { font-size: 0.68rem; letter-spacing: 0.2em; color: var(--mut); }
.hl-chip-live { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; color: var(--grn-l);
  font-family: "Space Mono", monospace; }
.hl-pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--grn); animation: hl-pulse 1.6s infinite; }
@keyframes hl-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(95,190,124,0.5); } 50% { box-shadow: 0 0 0 6px rgba(95,190,124,0); } }
.hl-chip-big { font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; }
.hl-chip-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
.hl-chip-bar span { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--grn-d), var(--grn-l)); }
.hl-chip-foot { display: flex; align-items: center; justify-content: space-between; font-size: 0.74rem; color: var(--mut); }
.hl-chip-up { color: var(--grn-l); }

.hl-scrolldown { position: absolute; bottom: 1.4rem; left: 50%; transform: translateX(-50%); z-index: 10; }
.hl-scrolldown span { display: block; width: 22px; height: 34px; border: 1.5px solid rgba(255,255,255,0.25); border-radius: 12px; position: relative; }
.hl-scrolldown span::after { content: ""; position: absolute; left: 50%; top: 7px; transform: translateX(-50%);
  width: 3px; height: 6px; border-radius: 2px; background: var(--grn-l); animation: hl-scroll 1.6s infinite; }
@keyframes hl-scroll { 0% { opacity: 0; top: 6px; } 40% { opacity: 1; } 80% { opacity: 0; top: 16px; } 100% { opacity: 0; } }

/* Section shared */
.hl-section-eyebrow { font-size: 0.72rem; letter-spacing: 0.22em; color: var(--mut); margin-bottom: 1rem; }
.hl-h2 { font-size: clamp(28px, 5vw, 52px); font-weight: 500; letter-spacing: -0.025em; line-height: 1.08; }

/* Cinematic */
.hl-cinematic { position: relative; min-height: 100vh; min-height: 100dvh; display: flex; align-items: center;
  justify-content: center; overflow: hidden; background: var(--nv0); }
.hl-top-fade { position: absolute; top: 0; left: 0; right: 0; height: 180px; z-index: 5;
  background: linear-gradient(180deg, var(--nv1), transparent); }
.hl-cinematic-wrap { position: relative; z-index: 10; max-width: 62rem; padding: 0 1.5rem; perspective: 400px; }
.hl-cinematic-text { font-size: clamp(22px, 4vw, 40px); font-weight: 400; line-height: 1.34; letter-spacing: -0.02em;
  text-align: center; color: var(--txt); }
.hl-cinematic-text em { font-style: italic; color: var(--grn-l); }

/* Metrics */
.hl-metrics { position: relative; overflow: hidden; background: var(--nv1); padding: 8rem 1.5rem; }
.hl-metrics-inner { position: relative; z-index: 10; max-width: 72rem; margin: 0 auto; text-align: center; }
.hl-metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5rem; margin-top: 2.5rem; }
.hl-metric { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
.hl-metric-value { font-size: clamp(40px, 7vw, 74px); font-weight: 700; letter-spacing: -0.03em; line-height: 1;
  color: var(--txt); }
.hl-metric-label { font-size: 0.92rem; color: var(--faint); max-width: 15rem; line-height: 1.5; }

/* Modules */
.hl-modules { background: var(--nv1); padding: 6rem 1.5rem; }
.hl-modules-inner { max-width: 76rem; margin: 0 auto; }
.hl-modules-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 2rem; margin-bottom: 3rem; flex-wrap: wrap; }
.hl-modules-sub { max-width: 24rem; font-size: 0.95rem; line-height: 1.6; color: var(--faint); }
.hl-module-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem; }
.hl-card { border-radius: 18px; padding: 1.6rem; display: flex; flex-direction: column; gap: 0.8rem;
  transition: transform 0.25s ease, border-color 0.25s ease; }
.hl-card:hover { transform: translateY(-4px); border-color: rgba(95,190,124,0.4); }
.hl-card-icon { display: inline-flex; width: 42px; height: 42px; border-radius: 12px; align-items: center; justify-content: center;
  background: rgba(95,190,124,0.12); color: var(--grn-l); border: 1px solid rgba(95,190,124,0.22); }
.hl-card-title { font-size: 1.12rem; font-weight: 600; letter-spacing: -0.01em; }
.hl-card-body { font-size: 0.9rem; line-height: 1.6; color: var(--faint); }

/* How it works */
.hl-how { background: var(--nv0); padding: 7rem 1.5rem; }
.hl-how-inner { max-width: 72rem; margin: 0 auto; }
.hl-how-head { text-align: center; max-width: 40rem; margin: 0 auto 3.5rem; }
.hl-how-head .hl-h2 { margin-bottom: 1rem; }
.hl-how-sub { font-size: 0.98rem; line-height: 1.6; color: var(--faint); }
.hl-how-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem; }
.hl-layer { border-radius: 18px; padding: 1.8rem; display: flex; flex-direction: column; gap: 0.7rem; }
.hl-layer-top { display: flex; align-items: center; justify-content: space-between; }
.hl-layer-step { font-size: 0.7rem; letter-spacing: 0.18em; color: var(--mut); }
.hl-layer-icon { display: inline-flex; width: 38px; height: 38px; border-radius: 11px; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); color: var(--grn-l); border: 1px solid var(--line); }
.hl-layer-title { font-size: 1.5rem; font-weight: 500; letter-spacing: -0.02em; font-family: "Space Grotesk", sans-serif; }
.hl-layer-body { font-size: 0.92rem; line-height: 1.6; color: var(--faint); }

/* CTA band */
.hl-ctaband { background: var(--nv1); padding: 7rem 1.5rem; }
.hl-ctaband-inner { max-width: 44rem; margin: 0 auto; text-align: center; display: flex; flex-direction: column; gap: 1.2rem; align-items: center;
  background: radial-gradient(700px 300px at 50% 0%, rgba(95,190,124,0.12), transparent 70%); }
.hl-cta-h { font-size: clamp(30px, 6vw, 60px); font-weight: 500; letter-spacing: -0.025em; line-height: 1.05; }
.hl-cta-sub { font-size: 1rem; color: var(--faint); max-width: 30rem; }

/* Footer */
.hl-footer { position: relative; display: flex; min-height: 380px; background: var(--nv0); overflow: hidden; }
.hl-footer-video { position: relative; width: 42%; min-height: 380px; overflow: hidden; }
.hl-footer-video-tint { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--nv0) 92%); }
.hl-footer-body { flex: 1; display: flex; flex-direction: column; gap: 2rem; padding: 3.5rem clamp(1.5rem, 4vw, 4rem); }
.hl-brand-static { display: inline-flex; align-items: center; gap: 0.55rem; opacity: 0.85; }
.hl-footer-tag { margin-top: 1rem; max-width: 26rem; font-size: 0.95rem; line-height: 1.6; color: var(--faint); }
.hl-footer-cols { display: flex; gap: 4rem; flex-wrap: wrap; }
.hl-footer-cols > div { display: flex; flex-direction: column; gap: 0.6rem; }
.hl-footer-coltitle { font-size: 0.68rem; letter-spacing: 0.2em; color: var(--mut); margin-bottom: 0.3rem; }
.hl-footer-cols button, .hl-footer-cols a { text-align: left; font-size: 0.9rem; color: var(--faint); }
.hl-footer-cols button:hover, .hl-footer-cols a:hover { color: var(--txt); }
.hl-footer-legal { margin-top: auto; font-size: 0.78rem; color: rgba(232,237,246,0.35); }

/* Responsive */
@media (max-width: 900px) {
  .hl-metrics-grid, .hl-module-grid, .hl-how-grid { grid-template-columns: 1fr; }
  .hl-module-grid { gap: 1rem; }
}
@media (max-width: 768px) {
  .hl-nav-links { display: none; }
  .hl-nav-cta .hl-link-ghost { display: none; }
  .hl-burger { display: flex; }
  .hl-mobile-menu { display: flex; }
  .hl-hero-row { flex-direction: column; align-items: flex-start; }
  .hl-hero-chip { width: 100%; max-width: 320px; }
  .hl-footer { flex-direction: column; }
  .hl-footer-video { width: 100%; min-height: 220px; }
  .hl-footer-video-tint { background: linear-gradient(180deg, transparent, var(--nv0) 92%); }
  .hl-metrics, .hl-modules, .hl-how, .hl-ctaband { padding-left: 1.25rem; padding-right: 1.25rem; }
}
@media (prefers-reduced-motion: reduce) {
  .hl-pulse, .hl-scrolldown span::after { animation: none; }
}
`;
