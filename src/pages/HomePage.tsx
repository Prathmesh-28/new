import { useState, useEffect, useRef } from "react";
import { useSeo } from "@/lib/seo";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, ChevronDown, Radar, LineChart, Bell, Zap, Activity, ScanSearch,
  ReceiptText, TrendingUp, RefreshCw, Calculator, Briefcase, Landmark, Rocket,
  Users, CreditCard, Award, Palette, type LucideIcon,
} from "lucide-react";
import { initHero3D } from "@/animations/hero3d";
import ScrambleIn from "@/components/ScrambleIn";
import AnimatedNumber from "@/components/AnimatedNumber";
import Odometer from "@/components/Odometer";
import Logo from "@/components/Logo";
import SocialLinks from "@/components/SocialLinks";
import { usePlatformSettings } from "@/lib/usePlatformSettings";
import { API_BASE } from "@/lib/apiBase";

/* Real trial length, plan pricing, and founding-member terms - read directly from
   the constants that actually govern checkout/enforcement (backend routes/billing.js),
   never a second hand-typed copy that can drift from what's actually charged. Falls
   back to sane placeholders (hidden, not fabricated numbers) until the fetch resolves. */
interface BillingPlanInfo { monthlyInr: number; annualInr: number; annualMonthlyEquivalentInr: number }
interface BillingPlans {
  trialDays: number;
  trialPlan: string;
  plans: { starter: BillingPlanInfo; growth: BillingPlanInfo; pro: BillingPlanInfo };
  annualMonthsCharged: number;
  foundingMemberCap: number;
  foundingDiscountPct: number;
}
function useBillingPlans(): BillingPlans | null {
  const [plans, setPlans] = useState<BillingPlans | null>(null);
  useEffect(() => {
    let on = true;
    fetch(`${API_BASE}/api/billing/plans`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (on && d) setPlans(d); })
      .catch(() => { /* keep null - callers fall back gracefully */ });
    return () => { on = false; };
  }, []);
  return plans;
}

/* ─── Colour tokens ─── */
const C = {
  deepest: "#101830", deep: "#18233F", mid: "#2A3654",
  bright: "#3D9A60", light: "#5FBE7C", pale: "#A9D9BC",
  wash: "#E8F5EE", cream: "#F7F8FB", creamW: "#FFFFFF",
  gold: "#3D9A60", goldL: "#5FBE7C",
  txt: "#1C2535", txtMid: "#3A4661", txtMut: "#6B7384",
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

/* Real cash-tracked stat is a sum of tenants' own bank balances (always INR - this
   is an India-first ledger, not a currency-converted marketing figure), formatted
   in Cr/L the way an Indian SMB owner reads it regardless of the visitor's detected
   locale used for the (cosmetic) $ vs ₹ toggle elsewhere on this page. */
function formatCr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n / 1e7 >= 10 ? 0 : 1)}Cr+`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n / 1e5 >= 10 ? 0 : 1)}L+`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
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
  const [go, setGo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGo(true), 450);
    return () => clearTimeout(t);
  }, []);
  return (
    <div data-h3d-tilt style={{ background: C.deep, border: `1px solid rgba(169,217,188,0.15)`, borderRadius: 14, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
      <div style={{ background: "rgba(0,0,0,0.35)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
        {["#E24B4A","#EF9F27","#3D9A60"].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }} />)}
        <span style={{ fontFamily: sans, fontSize: 11, color: "rgba(169,217,188,0.45)", marginLeft: 6 }}>Headroom - 90-day forecast</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Current Balance", val: inr ? "₹4.2L"  : "$52K", sub: "+8% vs last month", subC: C.light },
            { label: "Runway",          val: "68 days", sub: "at current burn",   subC: C.light },
            { label: "Low Point",       val: "Day 41",  sub: inr ? "₹80K warning" : "$10K warning", subC: C.gold  },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(169,217,188,0.08)", borderRadius: 8, padding: "11px 12px" }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: "rgba(169,217,188,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontFamily: sans, fontSize: 19, fontWeight: 600, color: C.pale }}><AnimatedNumber value={s.val} start={go} /></div>
              <div style={{ fontFamily: sans, fontSize: 9, color: s.subC, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(169,217,188,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontFamily: sans, fontSize: 9, color: "rgba(169,217,188,0.38)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Cash position - next 90 days</div>
          <div data-h3d="cashbars" style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 3, height: 58 }}>
            {BARS.map((h, i) => (
              <div key={i} style={{ flex: 1, borderRadius: "2px 2px 0 0", minWidth: 7, height: go ? `${Math.round(h * 0.72)}%` : "0%", background: h < 50 ? "#E24B4A" : h < 65 ? C.gold : C.bright, opacity: i < 10 ? 0.5 : 0.85, transition: "height 0.9s cubic-bezier(0.22,1,0.36,1)", transitionDelay: `${i * 22}ms` }} />
            ))}
            {/* Self-drawing P50 forecast line over the bars */}
            <svg viewBox="0 0 100 58" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }} aria-hidden="true">
              <polyline
                pathLength={100}
                points={BARS.map((h, i) => `${((i / (BARS.length - 1)) * 100).toFixed(2)},${(58 - (Math.round(h * 0.72) / 100) * 58).toFixed(2)}`).join(" ")}
                fill="none" stroke={C.pale} strokeWidth={1.6} vectorEffect="non-scaling-stroke"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 100, strokeDashoffset: go ? 0 : 100, transition: "stroke-dashoffset 1.8s ease 0.4s", opacity: 0.85 }}
              />
            </svg>
          </div>
        </div>
        <div style={{ background: "rgba(61,154,96,0.1)", border: "1px solid rgba(61,154,96,0.22)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(61,154,96,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.gold, flexShrink: 0, marginTop: 1 }}>!</div>
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
  // Mono "terminal" eyebrow with a bracket accent - the futuristic HUD signature.
  return (
    <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: dark ? C.pale : C.bright, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: C.gold }}>▚</span>{text}
    </div>
  );
}

/* Crafted icon tile - a soft olive→gold gradient chip with an inset top highlight,
   a hairline ring and a low drop shadow (premium "app-tile" depth). A tiny gold
   corner dot echoes the Headroom logo mark. One system, used across every section. */
function IconTile({ icon: Icon, size = 44, dark = false }: { icon: LucideIcon; size?: number; dark?: boolean }) {
  const r = Math.round(size * 0.3);
  const style: React.CSSProperties = dark
    ? {
        background: "linear-gradient(150deg, rgba(95,190,124,0.22), rgba(61,154,96,0.10))",
        border: "1px solid rgba(169,217,188,0.22)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 6px 18px rgba(0,0,0,0.35)",
      }
    : {
        background: "linear-gradient(150deg, #FCFDF6 0%, rgba(95,190,124,0.16) 100%)",
        border: "1px solid rgba(74,94,26,0.14)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 14px rgba(74,94,26,0.10)",
      };
  return (
    <div style={{ position: "relative", width: size, height: size, borderRadius: r, display: "grid", placeItems: "center", flexShrink: 0, ...style }}>
      <Icon size={Math.round(size * 0.44)} color={dark ? C.pale : C.mid} strokeWidth={1.85} />
      <span style={{ position: "absolute", top: Math.round(size * 0.16), right: Math.round(size * 0.16), width: Math.max(4, Math.round(size * 0.1)), height: Math.max(4, Math.round(size * 0.1)), borderRadius: "50%", background: C.gold, opacity: 0.9 }} />
    </div>
  );
}

/* ─── Scroll-pinned product walkthrough ─── */
const WALK = [
  { t: "Cash & runway", d: "Every bank, wallet and card in one live balance — with a runway clock counting down in real days, not last month's spreadsheet." },
  { t: "90-day forecast", d: "A daily P10 / P50 / P90 cash position. Recurring and variable spend are modelled separately, so the tight weeks surface early." },
  { t: "Alerts & insights", d: "Plain-language warnings fire the moment projected pressure appears anywhere in your 90-day forecast — specific, actionable, and never a wall of noise." },
  { t: "Credit & capital", d: "When a forecast shows real pressure, rescue options appear in context — pre-qualified silently from your own data." },
];

function WalkPanel({ i, active, inr }: { i: number; active: number; inr: boolean }) {
  const on = i === active;
  const base: React.CSSProperties = {
    border: `1px solid ${on ? "rgba(95,190,124,0.5)" : "rgba(169,217,188,0.1)"}`,
    background: on ? "rgba(61,154,96,0.09)" : "rgba(0,0,0,0.25)",
    boxShadow: on ? "0 0 0 1px rgba(95,190,124,0.25), 0 20px 50px -24px rgba(61,154,96,0.6)" : "none",
    borderRadius: 12, padding: "14px 16px", minHeight: 118, display: "flex", flexDirection: "column", gap: 6,
    opacity: on ? 1 : 0.5, transition: "all 0.45s ease",
  };
  const lbl = (s: string) => <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.12em", color: "rgba(169,217,188,0.5)", textTransform: "uppercase" }}>{s}</div>;
  const big = (s: React.ReactNode, c: string = C.pale) => <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 700, color: c, letterSpacing: -0.5 }}>{s}</div>;
  const mini = (s: string) => <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(169,217,188,0.5)", marginTop: "auto" }}>{s}</div>;
  if (i === 0) return <div style={base}>{lbl("Cash on hand")}{big(<AnimatedNumber value={inr ? "₹4.2L" : "$52K"} start={on} />)}<div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 30, marginTop: "auto" }}>{[0.5,0.7,0.45,0.8,0.6,0.9,0.75].map((b, k) => <span key={k} style={{ flex: 1, height: `${b*100}%`, background: `linear-gradient(180deg, ${C.light}, ${C.bright})`, borderRadius: 2 }} />)}</div></div>;
  if (i === 1) return <div style={base}>{lbl("Runway")}{big(<AnimatedNumber value="68 days" start={on} />)}<svg viewBox="0 0 120 30" preserveAspectRatio="none" style={{ width: "100%", height: 30, marginTop: "auto" }} aria-hidden="true"><polyline points="0,20 20,17 40,22 60,25 80,15 100,9 120,4" fill="none" stroke={C.light} strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg></div>;
  if (i === 2) return <div style={base}>{lbl("Alert")}<div style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", fontFamily: sans, fontSize: 12, color: C.goldL, background: "rgba(61,154,96,0.14)", border: "1px solid rgba(61,154,96,0.3)", borderRadius: 999, padding: "3px 10px" }}><span className="hr-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, display: "inline-block" }} />Low point in 41 days</div>{mini("A revenue advance keeps you positive")}</div>;
  return <div style={base}>{lbl("Capital")}{big(<AnimatedNumber value={inr ? "₹1.5L" : "$18K"} start={on} />, C.goldL)}{mini("Advance pre-qualified · 0 bureau pulls")}</div>;
}

function Walkthrough({ inr }: { inr: boolean }) {
  const { ref, vis } = useInView(0.3);
  const [active, setActive] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [interacted, setInteracted] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const onM = () => setMobile(mq.matches);
    onM();
    mq.addEventListener?.("change", onM);
    return () => mq.removeEventListener?.("change", onM);
  }, []);
  // Auto-advance through the steps once the section is in view. Pauses after a
  // manual click, and is skipped entirely under prefers-reduced-motion.
  useEffect(() => {
    if (!vis || interacted) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % WALK.length), 3200);
    return () => clearInterval(id);
  }, [vis, interacted]);
  const pick = (i: number) => {
    setActive(i);
    setInteracted(true);
  };

  const dash = (
    <div style={{ background: C.deep, border: "1px solid rgba(169,217,188,0.15)", borderRadius: 16, padding: 16, boxShadow: "0 32px 80px rgba(0,0,0,0.5)", width: "100%", maxWidth: 440 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 12, borderBottom: "1px solid rgba(169,217,188,0.12)", marginBottom: 14 }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: `linear-gradient(135deg, ${C.light}, ${C.bright})` }} />
        <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.creamW }}>Headroom</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 9, letterSpacing: "0.1em", color: C.pale }}><span className="hr-blink" style={{ width: 5, height: 5, borderRadius: "50%", background: C.light, display: "inline-block" }} />LIVE · 10/10</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {WALK.map((_, i) => <WalkPanel key={i} i={i} active={active} inr={inr} />)}
      </div>
    </div>
  );

  return (
    <section id="walkthrough" ref={ref} style={{ background: C.deepest, padding: mobile ? "64px 24px" : "88px 48px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Label text="Product walkthrough" dark />
        <h2 style={{ fontFamily: serif, fontSize: mobile ? 30 : 40, color: C.creamW, letterSpacing: -1, marginBottom: mobile ? 28 : 44 }}>Your whole business, in one view.</h2>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: mobile ? 32 : 56, alignItems: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", order: mobile ? 1 : 2 }}>{dash}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, order: mobile ? 2 : 1 }}>
            {WALK.map((s, i) => (
              <div key={s.t} onClick={() => pick(i)} style={{ display: "flex", gap: 16, padding: "16px 18px", borderRadius: 12, cursor: "pointer", opacity: i === active ? 1 : 0.45, background: i === active ? "rgba(255,255,255,0.05)" : "transparent", transition: "all 0.4s ease" }}>
                <span style={{ width: 3, borderRadius: 3, flexShrink: 0, background: i === active ? C.light : "rgba(169,217,188,0.15)", boxShadow: i === active ? `0 0 12px ${C.light}` : "none", transition: "all 0.4s ease" }} />
                <div>
                  <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 700, color: C.pale, marginBottom: 4 }}>{s.t}</div>
                  <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(169,217,188,0.55)", lineHeight: 1.55 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 3D flip card (Credit section): front = card art, back = terms ─── */
function FlipCard() {
  const { ref, vis } = useInView(0.4);
  const [hover, setHover] = useState(false);
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const showBack = reduce ? false : hover ? false : vis; // in view → back; hover peeks front
  const face: React.CSSProperties = {
    position: "absolute", inset: 0, borderRadius: 16, padding: 22,
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
    boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
  };
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ perspective: 1100, width: 300, height: 189, flexShrink: 0 }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: reduce ? "none" : "transform 1s cubic-bezier(0.22,1,0.36,1)", transform: `rotateY(${showBack ? 180 : 0}deg)` }}>
        {/* front */}
        <div style={{ ...face, justifyContent: "space-between", background: `linear-gradient(135deg, ${C.deep}, ${C.mid})`, border: "1px solid rgba(169,217,188,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: sans, fontWeight: 700, color: C.creamW, fontSize: 15 }}>headroom</span>
            <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.15em", color: C.pale }}>CASH LINE</span>
          </div>
          <div style={{ width: 40, height: 29, borderRadius: 6, background: `linear-gradient(135deg, ${C.light}, ${C.gold})`, opacity: 0.9 }} />
          <div>
            <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.18em", color: C.pale }}>•••• •••• •••• 4210</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(169,217,188,0.5)", marginTop: 6 }}>Sized from your own cash-flow data</div>
          </div>
        </div>
        {/* back */}
        <div style={{ ...face, transform: "rotateY(180deg)", justifyContent: "center", gap: 12, background: `linear-gradient(135deg, ${C.mid}, ${C.deepest})`, border: "1px solid rgba(95,190,124,0.35)" }}>
          {[["Sized from data", "your cash flow sets the limit"], ["0 bureau pulls", "silent pre-qualification"], ["Repay on revenue", "no fixed EMI lock-in"]].map(([a, b]) => (
            <div key={a}>
              <div style={{ fontFamily: serif, fontSize: 20, color: C.goldL, letterSpacing: -0.5 }}>{a}</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(169,217,188,0.6)" }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  useSeo({ title: "Headroom - GST Billing, Accounting & Cash-Flow Software for Indian SMBs", description: "All-in-one finance platform for Indian SMBs - GST billing & e-invoicing, double-entry accounting, GST/TDS filing, invoicing, collections, payroll and 90-day cash-flow forecasts. Your CA works in it too. Free to start." });
  const navigate = useNavigate();
  const platform = usePlatformSettings(); // super-admin-controlled footer links, banner, contact, FAQs, real stats
  const billing = useBillingPlans(); // real trial length + plan pricing + founding-member terms
  const trialDays = billing?.trialDays ?? 14; // 14 = the real default (lib/billingLifecycle.js) shown only until the fetch resolves
  const stats = platform.stats;
  const visibleStats: { n: string; d: string }[] = [
    ...(stats.cashTrackedInr ? [{ n: formatCr(stats.cashTrackedInr), d: "Cash tracked" }] : []),
    ...(stats.smbCount ? [{ n: `${stats.smbCount.toLocaleString("en-IN")}+`, d: "SMBs on the platform" }] : []),
    ...(stats.forecastAccuracyPct != null ? [{ n: `${stats.forecastAccuracyPct}%`, d: "Forecast accuracy at 30 days" }] : []),
    ...(stats.avgDaysToFirstInsight != null ? [{ n: `${stats.avgDaysToFirstInsight} days`, d: "Avg time to first insight" }] : []),
  ];
  const [scrolled, setScrolled] = useState(false);
  const [ctaEmail, setCtaEmail] = useState(""); // bottom-CTA email, carried into /signup
  const [inr] = useState(() => !detectUS()); // India-first: ₹ by default, $ only for US visitors (cosmetic illustrations only - pricing is always the real INR)

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

  // Hero scroll parallax — the background panel and the dashboard column drift at
  // different rates for depth. Skipped under reduced-motion; only runs while the
  // hero is on screen. Applied to a wrapper, so it never fights the fade-in or tilt.
  const heroBgRef = useRef<HTMLDivElement>(null);
  const dashParallaxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (y > window.innerHeight * 1.3) return;
        if (heroBgRef.current) heroBgRef.current.style.transform = `translateY(${(y * 0.16).toFixed(1)}px)`;
        if (dashParallaxRef.current) dashParallaxRef.current.style.transform = `translateY(${(y * -0.07).toFixed(1)}px)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Trigger the hero headline scramble-in once mounted (reduced-motion aware inside ScrambleIn).
  const [heroIn, setHeroIn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHeroIn(true), 120);
    return () => clearTimeout(t);
  }, []);

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
      {/* padding written as "0px 48px" so the mobile override selector [style*="px 48px"]
          matches and trims the gutters on phones. */}
      <nav style={{ background: scrolled ? `${C.deepest}f0` : C.deepest, backdropFilter: scrolled ? "blur(16px)" : "none", padding: "0px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, transition: "all 0.3s", borderBottom: scrolled ? `1px solid rgba(169,217,188,0.1)` : "none" }}>
        <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ color: C.creamW, cursor: "pointer", display: "flex", alignItems: "center" }} aria-label="Headroom home">
          <Logo variant="horizontal" size={22} />
        </div>
        {/* No inline `display` here - it would beat the responsive Tailwind classes and
            keep all 5 links crowding the CTA off-screen on phones. */}
        <ul style={{ gap: 28, listStyle: "none", margin: 0, padding: 0 }} className="hidden lg:flex">
          {[["Features","#features"],["Credit","#credit"],["Capital","#capital"],["Advisors","#advisors"],["Pricing","#pricing"]].map(([l,h]) => (
            <li key={l}><a href={h} style={{ fontFamily: sans, fontSize: 13, color: "rgba(169,217,188,0.7)", textDecoration: "none" }}
              onMouseOver={e => (e.currentTarget.style.color = C.pale)} onMouseOut={e => (e.currentTarget.style.color = "rgba(169,217,188,0.7)")}>{l}</a></li>
          ))}
        </ul>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/login")} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.pale, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Sign in</button>
          <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 6, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Try {trialDays} days free</button>
        </div>
      </nav>

      {/* ═══ HERO ═════════════════════════════════════════════════════════════ */}
      <section data-h3d="hero" style={{ background: C.deepest, paddingTop: 128, paddingBottom: 80, paddingLeft: 48, paddingRight: 48, position: "relative", overflow: "hidden" }}>
        <div ref={heroBgRef} style={{ position: "absolute", top: 0, right: 0, width: "50%", height: "100%", background: C.deep, clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0% 100%)", zIndex: 0, willChange: "transform" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div className="animate-fade-up">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(61,154,96,0.15)", border: "1px solid rgba(61,154,96,0.3)", borderRadius: 20, padding: "5px 14px", marginBottom: 28 }}>
              <span className="hr-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, display: "inline-block" }} />
              <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.goldL }}>[ 10-layer cash flow intelligence ]</span>
            </div>
            <h1 aria-label="Know your cash. Before it matters." style={{ fontFamily: serif, fontSize: 50, lineHeight: 1.05, color: C.creamW, marginBottom: 20, letterSpacing: -1.5 }}>
              <ScrambleIn text="Know your cash." start={heroIn} delay={120} /><br />
              <em style={{ fontStyle: "normal", color: C.pale }}><ScrambleIn text="Before" start={heroIn} delay={440} /></em>{" "}
              <ScrambleIn text="it matters." start={heroIn} delay={600} />
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
              {[`Free for first ${trialDays} days`,"No credit card","Setup in 3 minutes"].map(t => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.5)" }}>
                  <CheckCircle2 size={12} style={{ color: C.light }} />{t}
                </span>
              ))}
            </div>
          </div>
          <div ref={dashParallaxRef} style={{ willChange: "transform" }}>
            <div className="animate-fade-up delay-200" data-h3d="dash" style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(169,217,188,0.55)", marginBottom: 8 }}>
                <span>CASH_CORE v2.4.1</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="hr-blink" style={{ width: 5, height: 5, borderRadius: "50%", background: C.light, display: "inline-block" }} />SIGNAL: ACTIVE · 10/10</span>
              </div>
              <DashMockup inr={inr} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TICKER ═══════════════════════════════════════════════════════════ */}
      <div style={{ background: C.deep, borderTop: "1px solid rgba(169,217,188,0.12)", borderBottom: "1px solid rgba(169,217,188,0.12)", overflow: "hidden", padding: "12px 0" }}>
        <div className="hr-ticker">
          {[0, 1].map(dup => (
            <div key={dup} style={{ display: "flex", gap: 56, paddingLeft: 56 }} aria-hidden={dup === 1}>
              {[
                `Free for ${trialDays} days`, "No credit card required", "Setup in 3 minutes", "10-layer cash intelligence",
                // Real backtested accuracy (lib/platformStats.js) - omitted, never faked, until enough matured samples exist.
                ...(platform.stats.forecastAccuracyPct != null ? [`${platform.stats.forecastAccuracyPct}% forecast accuracy at 30 days`] : []),
                "Capital access network",
              ].map((t, i) => (
                <span key={i} style={{ fontFamily: mono, fontSize: 11, color: "rgba(169,217,188,0.6)", whiteSpace: "nowrap", letterSpacing: 2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: C.gold, fontSize: 13 }}>◆</span>{t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ STATS STRIP ══════════════════════════════════════════════════════
          Every number here is computed server-side from real data (backend
          lib/platformStats.js) - never hand-typed. A stat with no real data yet
          (e.g. forecast accuracy needs 30-day-matured backtest samples) is simply
          omitted rather than shown as a placeholder. */}
      {visibleStats.length > 0 && (
        <div data-h3d="stats" style={{ background: C.mid, padding: "28px 48px", display: "grid", gridTemplateColumns: `repeat(${visibleStats.length},1fr)` }}>
          {visibleStats.map(({ n, d }, i) => (
            <div key={d} className="hr-stat" style={{ textAlign: "center", padding: "0 24px", borderRight: i < visibleStats.length - 1 ? "1px solid rgba(169,217,188,0.15)" : "none" }}>
              <div style={{ fontFamily: serif, fontSize: 32, color: C.pale, letterSpacing: -1 }}><Odometer value={n} depth3d /></div>
              <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.55)", marginTop: 3 }}>{d}</div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ PRODUCT WALKTHROUGH (scroll-pinned) ═════════════════════════════ */}
      <Walkthrough inr={inr} />

      {/* ═══ FEATURES - 10 LAYERS ════════════════════════════════════════════ */}
      <section id="features" data-h3d-deco="shapes-light" style={{ background: C.creamW, padding: "88px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto 52px" }}>
            <Label text="Platform architecture" />
            <h2 style={{ fontFamily: serif, fontSize: 40, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>
              Built as one operating system,<br />not a stack of disconnected tools.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, maxWidth: 560, lineHeight: 1.7 }}>
              Designed for SMB operators who need a truthful picture of cash - not another dashboard full of vanity signals. Instead of pretending every projection is exact, Headroom uses confidence bands and scenarios to show where outcomes may land.
            </p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
          {[
            { n:"01", t:"Live data ingestion",      d:"Bank feeds and accounting connectors sync continuously. No manual uploads." },
            { n:"02", t:"Normalisation",            d:"Transactions categorised and merchant-normalised automatically on every sync." },
            { n:"03", t:"90-day forecast engine",   d:"Daily P10/P50/P90 cash position. Recurring and variable spend modelled separately." },
            { n:"04", t:"Confidence bands",         d:"Every forecast shows best, expected, and worst case - never a single deceptive line." },
            { n:"05", t:"Alert & insight engine",   d:"Alerts fire as soon as pressure shows in the 90-day forecast. Specific, actionable, and early." },
            { n:"06", t:"Operator-first dashboard", d:"One screen shows balance, runway, alerts, and forecast. No setup needed." },
            { n:"07", t:"Scenario planner",         d:"Model a hire, slow month, or contract win and see the cash impact instantly." },
            { n:"08", t:"Embedded credit rescue",   d:"Credit options appear in-context when a forecast shows real pressure." },
            { n:"09", t:"Silent underwriting",      d:"Pre-qualification runs in the background from your own data. No bureau pulls." },
            { n:"10", t:"Community capital",        d:"Revenue-share, Reg CF, and Reg A+ raises built directly into the platform." },
          ].map(({ n, t, d }, i) => (
            <Reveal key={n} delay={i * 40}>
              <div data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 12, padding: "20px 18px", height: "100%", transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s" }}
                onMouseOver={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(61,154,96,0.4)"; el.style.boxShadow = "0 8px 24px rgba(44,58,16,0.07)"; }}
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
            <div style={{ position: "absolute", top: "50%", left: "12.5%", right: "12.5%", height: 1, background: "rgba(169,217,188,0.1)" }} />
            {[
              { step:"Detect",   icon:Radar,      desc:"Live signals from bank + books" },
              { step:"Forecast", icon:LineChart,  desc:"90-day P10/P50/P90 model runs" },
              { step:"Alert",    icon:Bell,       desc:"Plain-language warning, weeks ahead" },
              { step:"Act",      icon:Zap,        desc:"Credit or capital options, in context" },
            ].map(({ step, icon: Icon, desc }, i) => (
              <div key={step} style={{ textAlign: "center", padding: "0 24px", borderRight: i < 3 ? "1px solid rgba(169,217,188,0.08)" : "none", position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", justifyContent: "center", margin: "0 auto 14px" }}><IconTile icon={Icon} size={48} dark /></div>
                <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: C.pale, marginBottom: 6 }}>{step}</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(169,217,188,0.4)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ═══ CREDIT RESCUE ════════════════════════════════════════════════════ */}
      <section id="credit" data-h3d-deco="shapes-light" style={{ background: C.cream, padding: "88px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 48, flexWrap: "wrap", marginBottom: 52 }}>
              <div style={{ maxWidth: 540 }}>
                <Label text="Credit rescue" />
                <h2 style={{ fontFamily: serif, fontSize: 38, color: C.txt, letterSpacing: -1, marginBottom: 14 }}>
                  Credit support that appears inside<br />the cash flow workflow.
                </h2>
                <p style={{ fontFamily: sans, fontSize: 15, color: C.txtMut, lineHeight: 1.7 }}>
                  When a forecast shows real pressure, the platform surfaces rescue options in context - evaluates fit with silent underwriting, and models repayment impact before a business commits.
                </p>
              </div>
              <FlipCard />
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 52 }}>
            {[
              { n:"1", icon:Activity,    t:"Forecast identifies pressure",    d:"The 90-day model spots a cash gap weeks before it arrives." },
              { n:"2", icon:Bell,        t:"Alerts explain what changed",     d:"Plain-language notification tells you exactly what the risk is and when." },
              { n:"3", icon:ScanSearch,  t:"Silent underwriting runs",        d:"Pre-qualification happens in the background from your own data. No forms, no bureau pull." },
              { n:"4", icon:CheckCircle2, t:"Repayment simulated first",      d:"See exactly how any option affects your forecast before you accept a single rupee." },
            ].map(({ n, icon: Icon, t, d }, i) => (
              <Reveal key={n} delay={i * 80}>
                <div data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: 24, position: "relative" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.mid, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 13, fontWeight: 700, color: "#fff", position: "absolute", top: -13, left: 20 }}>{n}</div>
                  <div style={{ marginBottom: 12, marginTop: 10 }}><IconTile icon={Icon} size={44} /></div>
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
                  Traditional credit is a separate conversation. Headroom embeds it directly - so you see what borrowing costs in the context of your own forecast, not a generic APR table.
                </p>
                <div style={{ display: "flex", gap: 24, marginBottom: 28 }}>
                  {/* Every number here must be a real product fact, never an invented
                      stat - offers are recomputed daily from the tenant's own data
                      (refreshStandingOffers cron), zero bureau pulls, three products. */}
                  {[{ n:"Daily", d:"Offers refresh from your data"}, { n:"0", d:"Bureau pulls"}, { n:"3 types", d:"Capital available"}].map(({ n, d }, i) => (
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
                  // These three map 1:1 to the REAL lending products (invoice_finance
                  // bullet advances, working_capital EMI loans, revenue-linked offers)
                  // - no invented products or caps the engine doesn't actually have.
                  { icon:TrendingUp,  t:"Revenue-based advance",  d:"Repay as % of monthly revenue. No fixed EMI.",         amt:"Sized from your revenue" },
                  { icon:ReceiptText, t:"Invoice financing",      d:"Get paid on outstanding invoices today.",               amt:"Up to 90% of invoice value" },
                  { icon:RefreshCw,   t:"Working-capital loan",   d:"A lump sum repaid in monthly EMIs - terms simulated on your forecast first.", amt:"Limit sized from your cash flow" },
                ].map(({ icon: Icon, t, d, amt }) => (
                  <div key={t} data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                    <IconTile icon={Icon} size={42} />
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
            <p style={{ fontFamily: sans, fontSize: 15, color: "rgba(169,217,188,0.55)", maxWidth: 520, lineHeight: 1.7 }}>
              Headroom extends cash flow intelligence into capital formation - with live operating data, repayment progress, and raise readiness built in from day one.
            </p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {(inr ? [
            {
              track:"Track A", badge:"Revenue-based", title:"Revenue-based financing",
              range:"₹5L - ₹2Cr",
              best:"Restaurants, retail, D2C, and service businesses with steady revenue.",
              features:["Repay as % of monthly revenue","No equity dilution","No collateral, no EMI lock-in","Live investor portal"],
              featured: false,
            },
            {
              track:"Track B", badge:"Angel / AIF", title:"Angel & AIF round",
              range:"₹50L - ₹5Cr",
              best:"Businesses ready for institutional angels and AIF participation.",
              features:["Private-placement framework","Companies Act 2013 compliant","Investor & cap-table dashboard","Built for AIF participation"],
              featured: true,
            },
            {
              track:"Track C", badge:"SME IPO", title:"SME IPO listing",
              range:"₹5Cr - ₹50Cr+",
              best:"Growth-stage SMBs ready to list on NSE Emerge / BSE SME.",
              features:["Targets NSE Emerge / BSE SME","Merchant-banker-ready data room","Shares tradeable after listing","SEBI-compliance workflow"],
              featured: false,
            },
          ] : [
            {
              track:"Track A", badge:"Revenue-share", title:"Crowdfunding raise",
              range:"$10K - $500K",
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
              <div data-h3d-tilt style={{ background: featured ? C.deep : "rgba(255,255,255,0.04)", border: `1px solid ${featured ? "rgba(169,217,188,0.2)" : "rgba(169,217,188,0.08)"}`, borderRadius: 16, padding: 28, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: C.bright, letterSpacing: "0.8px", textTransform: "uppercase" }}>{track}</span>
                  <span style={{ fontFamily: sans, fontSize: 10, background: "rgba(169,217,188,0.08)", border: "1px solid rgba(169,217,188,0.14)", color: C.pale, padding: "2px 10px", borderRadius: 12 }}>{badge}</span>
                </div>
                <h3 style={{ fontFamily: serif, fontSize: 20, color: C.creamW, marginBottom: 6 }}>{title}</h3>
                <div style={{ fontFamily: serif, fontSize: 28, color: C.gold, letterSpacing: -1, marginBottom: 10 }}>{range}</div>
                <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.45)", lineHeight: 1.6, marginBottom: 20, flex: 1 }}>Best for: {best}</p>
                <ul style={{ listStyle: "none", margin: "0 0 24px" }}>
                  {features.map(f => (
                    <li key={f} style={{ fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.6)", padding: "5px 0", borderBottom: "1px solid rgba(169,217,188,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 13, height: 13, borderRadius: "50%", background: "rgba(61,154,96,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: C.pale, flexShrink: 0 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate("/signup")} style={{ width: "100%", padding: "11px 0", borderRadius: 8, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer", background: featured ? C.gold : "transparent", border: `1px solid ${featured ? C.gold : "rgba(169,217,188,0.2)"}`, color: featured ? C.deepest : C.pale }}>
                  Explore {track}
                </button>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div style={{ maxWidth: 1100, margin: "40px auto 0", background: C.deep, border: "1px solid rgba(169,217,188,0.1)", borderRadius: 12, padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.pale, marginBottom: 4 }}>Compliance first.</div>
              <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(169,217,188,0.45)", lineHeight: 1.6, maxWidth: 480 }}>All capital tracks are built with compliance infrastructure included. {inr ? "Revenue-based financing, private placement, and SME IPO frameworks (SEBI / Companies Act)" : "Revenue-share, Reg CF, and Reg A+ frameworks"} are handled by Headroom - you focus on the raise.</p>
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
              Replace quarterly check-ins with a live cash dashboard. Spot tax obligations, vendor payments, and low-balance risks weeks in advance - for every client, in one portfolio view.
            </p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 1100, margin: "0 auto 48px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }}>
          {[
            { role:"Chartered Accountant", emoji:Calculator, tagline:"Replace quarterly check-ins with a live cash dashboard.", perks:["Spot tax obligations early","Vendor payment visibility","Low-balance risk alerts","Multi-client view"] },
            { role:"Fractional CFO",        emoji:Briefcase,  tagline:"Serve more clients without hiring analysts.",           perks:["Auto forecast generation","Scenario modelling","Weekly narrative summary","Board-ready language"] },
            { role:"Business Banker",       emoji:Landmark,   tagline:"Identify credit needs before clients ask.",             perks:["Pre-qualification signals","Lead with the right product","Live cash visibility","Credit rescue context"] },
            { role:"Startup Advisor",       emoji:Rocket,     tagline:"Monitor burn and runway across your portfolio.",        perks:["Burn rate tracking","Runway visibility","Capital readiness scoring","Investor dashboard"] },
          ].map(({ role, emoji: Icon, tagline, perks }, i) => (
            <Reveal key={role} delay={i * 80}>
              <div data-h3d-tilt style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: 24, height: "100%", transition: "border-color 0.2s, box-shadow 0.2s" }}
                onMouseOver={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(61,154,96,0.35)"; el.style.boxShadow = "0 8px 28px rgba(44,58,16,0.07)"; }}
                onMouseOut={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(74,94,26,0.12)"; el.style.boxShadow = "none"; }}>
                <div style={{ marginBottom: 14 }}><IconTile icon={Icon} size={46} /></div>
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
              { icon:Users,      t:"Client portfolio view",     d:"All clients in one list with current balance, runway, and latest alert." },
              { icon:LineChart,  t:"Live 90-day forecasts",     d:"Every client's forecast refreshed automatically. No manual data pulls." },
              { icon:Bell,       t:"Alert feed",                d:"One feed across all clients, sorted by severity - act on the right thing first." },
              { icon:CreditCard, t:"Credit rescue context",     d:"See which clients are pre-qualified and for how much before they ask." },
              { icon:Award,      t:"Capital readiness scoring", d:"Know which clients are raise-ready and which track suits them best." },
              { icon:Palette,    t:"Your brand on reports",     d:"Client-facing reports and PDFs carry your letterhead and brand kit." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} data-h3d-tilt style={{ background: C.wash, border: "1px solid rgba(74,94,26,0.1)", borderRadius: 12, padding: "20px 20px" }}>
                <div style={{ marginBottom: 12 }}><IconTile icon={Icon} size={42} /></div>
                <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.txt, marginBottom: 6 }}>{t}</div>
                <div style={{ fontFamily: sans, fontSize: 12, color: C.txtMut, lineHeight: 1.6 }}>{d}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "center", gap: 16 }}>
            <button onClick={() => navigate("/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>Start free {trialDays}-day trial</button>
            <a href="#pricing" style={{ fontFamily: sans, fontSize: 14, color: C.mid, textDecoration: "none", padding: "13px 28px", border: `1px solid rgba(74,94,26,0.2)`, borderRadius: 8, display: "inline-flex", alignItems: "center" }}>View pricing</a>
          </div>
        </Reveal>
      </section>

      {/* ═══ TESTIMONIALS ═════════════════════════════════════════════════════ */}
      <section data-h3d-deco="orbs" style={{ background: C.deep, padding: "80px 48px" }}>
        <Reveal>
          <div style={{ maxWidth: 1100, margin: "0 auto 48px" }}>
            {/* These are ILLUSTRATIVE scenarios, not real customer endorsements - an
                audit flagged the old version (invented named businesses + 5-star rows)
                as fabricated testimonials. Swap in real, permissioned quotes when they
                exist; until then the section is honestly labelled. */}
            <Label text="How operators use Headroom" dark />
            <h2 style={{ fontFamily: serif, fontSize: 36, color: C.creamW, letterSpacing: -1 }}>The tool built for year one.</h2>
            <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.4)", marginTop: 10 }}>Illustrative scenarios of the problems Headroom is built to catch - not customer endorsements.</p>
          </div>
        </Reveal>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            { label:"A restaurant", scenario:"A slow quarter that only becomes visible in March. The 90-day forecast surfaces the dip in January - two months of room to fix it instead of a crisis." },
            { label:"A creative agency", scenario:"Clients pay in 60 days, payroll leaves every two weeks. The weekly cash calendar shows exactly which weeks are tight before they arrive." },
            { label:"A construction firm", scenario:"A seasonal monsoon gap in collections. Pre-qualified credit options appear in the forecast before the gap hits, priced from the firm's own data." },
          ].map(({ label, scenario }, i) => (
            <Reveal key={label} delay={i * 80}>
              <div data-h3d-tilt style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(169,217,188,0.1)", borderRadius: 14, padding: 24 }}>
                <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.goldL, marginBottom: 12 }}>{label}</div>
                <p style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.65, color: "rgba(244,241,228,0.8)", marginBottom: 4 }}>{scenario}</p>
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
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(61,154,96,0.08)", border: "1px solid rgba(61,154,96,0.2)", borderRadius: 20, padding: "5px 14px", marginBottom: 12 }}>
              <span style={{ fontFamily: sans, fontSize: 12, color: C.gold }}>✦ Free for {trialDays} days · no card{billing ? ` · 🔥 founding price locked for the first ${billing.foundingMemberCap} SMBs` : ""}</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.txtMut, marginBottom: 52 }}>
              {/* Pricing is ALWAYS the real INR the product actually charges (Razorpay) -
                  hand-typed $ figures used to drift from what checkout billed. */}
              Prices in ₹ INR · billed via Razorpay
            </div>
          </div>
        </Reveal>

        <div style={{ maxWidth: 940, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            {
              id:"free" as const,
              name:"Free", price:"₹0", period:"forever", featured: false,
              note:"For early-stage businesses · no card ever",
              desc:"See your cash truth - free for life.",
              features:["30-day cash forecast","Confidence bands","Plain-language alerts","WhatsApp morning brief","1 connected account"],
              disabled:["90-day forecast","Scenario planner","Credit rescue","Advisor access"],
              cta:"Start free",
            },
            {
              id:"growth" as const,
              name:"Growth",
              // Real price, read from the same constants Razorpay checkout charges
              // (backend routes/billing.js PLAN_PRICING) - never a second hardcoded
              // number. Always INR: the hand-typed $ variants used to promise prices
              // the product cannot actually charge.
              price: billing ? `₹${billing.plans.growth.annualMonthlyEquivalentInr.toLocaleString("en-IN")}` : "…",
              period:"/mo", featured: true,
              note: billing ? `billed yearly · ₹${billing.plans.growth.monthlyInr.toLocaleString("en-IN")} monthly · 🔥 founding price locked for life` : "billed yearly",
              desc:"For growing SMBs that need full visibility and credit. Cheaper than a half-day of an accountant.",
              features:["Everything in Free","90-day P10/P50/P90 forecast","Unlimited bank accounts","Scenario planner","AI cash insights","WhatsApp commands + alerts","Embedded credit rescue","Silent underwriting"],
              disabled:[],
              cta:"Get my forecast",
            },
            {
              id:"pro" as const,
              name:"Pro",
              price: billing ? `₹${billing.plans.pro.annualMonthlyEquivalentInr.toLocaleString("en-IN")}` : "…",
              period:"/mo", featured: false,
              note: billing ? `billed yearly · ₹${billing.plans.pro.monthlyInr.toLocaleString("en-IN")} monthly` : "billed yearly",
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
                  <span style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(169,217,188,0.45)" : C.txtMut }}>{period}</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: featured ? "rgba(169,217,188,0.4)" : C.txtMut, marginBottom: 8 }}>{note}</div>
                <div style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(169,217,188,0.55)" : C.txtMut, marginBottom: 24, lineHeight: 1.5 }}>{desc}</div>
                <ul style={{ listStyle: "none", marginBottom: 28, flex: 1 }}>
                  {features.map(f => (
                    <li key={f} style={{ fontFamily: sans, fontSize: 13, color: featured ? "rgba(169,217,188,0.7)" : C.txtMut, padding: "6px 0", borderBottom: `1px solid ${featured ? "rgba(169,217,188,0.08)" : "rgba(74,94,26,0.06)"}`, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: featured ? "rgba(61,154,96,0.3)" : C.wash, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: featured ? C.pale : C.mid }}>✓</span>{f}
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
          <div style={{ maxWidth: 940, margin: "20px auto 0", background: C.deepest, border: "1px solid rgba(169,217,188,0.12)", borderRadius: 14, padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20, textAlign: "left" }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: C.bright, marginBottom: 6 }}>Capital raise add-on</div>
              {/* No invented price - this add-on isn't a chargeable SKU in billing yet. */}
              <div style={{ fontFamily: serif, fontSize: 22, color: C.creamW, marginBottom: 4 }}>Custom pricing <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(169,217,188,0.4)" }}>· while your raise is live</span></div>
              <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(169,217,188,0.45)", maxWidth: 460 }}>Add a community capital raise (Track A, B, or C) to any Pro plan. Includes investor portal, compliance layer, and campaign page.</p>
            </div>
            <button onClick={() => navigate("/signup")} style={{ background: "transparent", border: `1px solid rgba(169,217,188,0.2)`, color: C.pale, fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "12px 24px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}>
              Explore capital raise →
            </button>
          </div>
        </Reveal>
      </section>

      {/* ═══ FAQ ══════════════════════════════════════════════════════════════
          Real editorial content, super-admin editable anytime (platform_settings
          "faqs" group). The whole section is skipped until items load - a heading
          over an empty bordered box (cold backend / failed fetch) looks broken. */}
      {platform.faqs.items.length > 0 && (
        <Reveal>
          <section data-h3d-deco="shapes-light" style={{ background: C.cream, padding: "72px 48px" }}>
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              <Label text="FAQ" />
              <h2 style={{ fontFamily: serif, fontSize: 34, color: C.txt, letterSpacing: -1, marginBottom: 40 }}>Common questions</h2>
              <div style={{ background: "#fff", border: "1px solid rgba(74,94,26,0.12)", borderRadius: 14, padding: "0 24px" }}>
                {platform.faqs.items.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
              </div>
            </div>
          </section>
        </Reveal>
      )}

      {/* ═══ CTA ══════════════════════════════════════════════════════════════ */}
      <section data-h3d-deco="wire" style={{ background: C.deepest, padding: "96px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(61,154,96,0.25) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <h2 style={{ fontFamily: serif, fontSize: 44, color: C.creamW, letterSpacing: -1.5, marginBottom: 16 }}>Get your first Headroom forecast.</h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(169,217,188,0.55)", marginBottom: 40 }}>Free for {trialDays} days. No credit card. Connect your bank in under 3 minutes.</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            {/* Controlled + carried into signup - this input used to be dead decoration
                that silently discarded whatever the visitor typed. */}
            <input type="email" placeholder="your@email.com" value={ctaEmail} onChange={e => setCtaEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") navigate(ctaEmail ? `/signup?email=${encodeURIComponent(ctaEmail)}` : "/signup"); }}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(169,217,188,0.2)", borderRadius: 8, padding: "13px 18px", fontFamily: sans, fontSize: 14, color: C.creamW, width: 280, outline: "none" }} />
            <button onClick={() => navigate(ctaEmail ? `/signup?email=${encodeURIComponent(ctaEmail)}` : "/signup")} style={{ background: C.gold, color: C.deepest, fontFamily: sans, fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, border: "none", cursor: "pointer" }}>Start free trial →</button>
          </div>
          <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.25)", marginTop: 20 }}>
            {stats.smbCount ? <>Trusted by {stats.smbCount.toLocaleString("en-IN")}+ SMBs &nbsp;·&nbsp; </> : null}Free for {trialDays} days &nbsp;·&nbsp; No credit card required
          </p>
        </div>
      </section>

      {/* ═══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer style={{ background: C.deepest, borderTop: "1px solid rgba(169,217,188,0.08)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 48px 0", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48, paddingBottom: 48 }}>
          <div>
            <div onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ color: C.creamW, marginBottom: 10, cursor: "pointer", display: "inline-flex" }} aria-label="Headroom home">
              <Logo variant="horizontal" size={20} />
            </div>
            <p style={{ fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.35)", lineHeight: 1.6, maxWidth: 200 }}>A 10-layer cash flow intelligence platform for modern SMB operators.</p>
            <div style={{ marginTop: 18 }}>
              <SocialLinks size={18} color="rgba(169,217,188,0.5)" hoverColor={C.pale} />
            </div>
          </div>
          {/* Every footer link goes to a REAL destination (an on-page section, signup
              flavor, or contact email) - the old version silently dumped all 15 links,
              "Blog"/"Careers"/"Contact" included, into /signup. Links with no real
              destination were removed, not faked. */}
          {([
            { h:"Platform",    links:[["Features","#features"],["Forecasting","#walkthrough"],["Credit rescue","#credit"],["Community capital","#capital"],["Pricing","#pricing"]] },
            { h:"For advisors",links:[["Advisor overview","#advisors"],["Advisor signup","/signup-advisor"]] },
            { h:"Company",     links:[["Pricing","#pricing"],["Sign in","/login"],["Contact", `mailto:${platform.brand?.supportEmail || "support@headroom.app"}`]] },
          ] as { h: string; links: [string, string][] }[]).map(({ h, links }) => (
            <div key={h}>
              <h5 style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(169,217,188,0.4)", marginBottom: 16 }}>{h}</h5>
              {links.map(([l, dest]) => (
                <a key={l} href={dest.startsWith("/") ? undefined : dest}
                  onClick={dest.startsWith("/") ? (e => { e.preventDefault(); navigate(dest); }) : undefined}
                  style={{ display: "block", fontFamily: sans, fontSize: 12, color: "rgba(169,217,188,0.5)", textDecoration: "none", marginBottom: 10, cursor: "pointer" }}
                  onMouseOver={e => (e.currentTarget.style.color = C.pale)} onMouseOut={e => (e.currentTarget.style.color = "rgba(169,217,188,0.5)")}>{l}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(169,217,188,0.06)", padding: "18px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1100, margin: "0 auto" }}>
          <span style={{ fontFamily: sans, fontSize: 11, color: "rgba(169,217,188,0.25)" }}>© {new Date().getFullYear()} Headroom Technologies Pvt. Ltd.</span>
          <div style={{ display: "flex", gap: 24 }}>
            {/* Privacy always has a real, hosted destination now (D1) — the admin-configurable
                privacyUrl can still override it with an external policy if one is set.
                Terms/Security render ONLY when configured - an unconfigured "#" link that
                scrolls to the top is a trust-page promise that goes nowhere. */}
            {([["Privacy", platform.links?.privacyUrl || "/privacy-policy"], ["Terms", platform.links?.termsUrl], ["Security", platform.links?.securityUrl]] as [string, string | undefined][])
              .filter(([, url]) => !!url)
              .map(([l, url]) => (
              <a key={l} href={url} {...(url && url.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} style={{ fontFamily: sans, fontSize: 11, color: "rgba(169,217,188,0.25)", textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
