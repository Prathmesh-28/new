"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Site data pulled from the real pages ──────────────────────────────────

const PAGES = [
  { name: "Home", path: "/", description: "Hero, stats, features, credit section, how it works, testimonials, CTA" },
  { name: "Platform (Features)", path: "/features", description: "Full platform feature breakdown across 10 layers" },
  { name: "Pricing", path: "/pricing", description: "Starter $29, Growth $79, Pro $149 + capital raise add-on $299" },
  { name: "Credit Rescue", path: "/credit", description: "Embedded credit rescue — silent underwriting + repayment simulation" },
  { name: "Capital Raise", path: "/capital", description: "Three capital tracks: Rev-share, Reg CF (up to $5M), Reg A+ (up to $75M)" },
];

const PRICING_PLANS = [
  { plan: "Starter", price: "$29/mo", accounts: "2 accounts", highlight: false },
  { plan: "Growth",  price: "$79/mo", accounts: "Unlimited",  highlight: true  },
  { plan: "Pro",     price: "$149/mo", accounts: "Unlimited", highlight: false },
  { plan: "Capital add-on", price: "$299/mo", accounts: "Active raise only", highlight: false },
];

const CAPITAL_TRACKS = [
  { label: "Track A", title: "Revenue-share crowdfunding", range: "$10K – $500K" },
  { label: "Track B", title: "Reg CF equity raise",        range: "Up to $5M / year" },
  { label: "Track C", title: "Reg A+ mini-IPO",            range: "Up to $75M / year" },
];

const CREDIT_STEPS = [
  "Forecast identifies pressure",
  "Alerts explain what changed",
  "Silent underwriting runs in background",
  "Repayment impact simulated before acceptance",
];

const NAV_LINKS = [
  { label: "Platform", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Credit rescue", href: "/credit" },
  { label: "Capital raise", href: "/capital" },
  { label: "For advisors", href: "#" },
  { label: "Sign in", href: "#" },
  { label: "Start free trial", href: "/#trial" },
];

// ─── Component ─────────────────────────────────────────────────────────────

type Section = "overview" | "pages" | "pricing" | "capital" | "credit" | "nav";

export default function AdminDashboard() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0f1505", color: "#e8f0c2" }}>
      {/* Sidebar */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col"
        style={{ backgroundColor: "#1c2209", borderRight: "1px solid #2e3a10" }}
      >
        <div className="px-5 py-5 border-b" style={{ borderColor: "#2e3a10" }}>
          <span className="text-lg font-bold font-serif text-white" style={{ letterSpacing: "-0.02em" }}>
            Head<span style={{ color: "#c9a227" }}>room</span>
          </span>
          <p className="text-xs mt-0.5" style={{ color: "#6b8526" }}>Admin Portal</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "pages",    label: "Pages" },
              { id: "pricing",  label: "Pricing" },
              { id: "capital",  label: "Capital Tracks" },
              { id: "credit",   label: "Credit Rescue" },
              { id: "nav",      label: "Navigation" },
            ] as { id: Section; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className="text-left w-full px-3 py-2 rounded-lg text-sm transition-all"
              style={{
                backgroundColor: activeSection === id ? "#2e3a10" : "transparent",
                color: activeSection === id ? "#c4d97a" : "#96b83d",
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t" style={{ borderColor: "#2e3a10" }}>
          <Link
            href="/"
            target="_blank"
            className="block text-center w-full px-3 py-2 rounded-lg text-xs mb-2 transition-all"
            style={{ backgroundColor: "#2e3a10", color: "#c4d97a" }}
          >
            View site ↗
          </Link>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full px-3 py-2 rounded-lg text-xs transition-all hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "#4a1a1a", color: "#fca5a5" }}
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">
        {activeSection === "overview" && <OverviewSection />}
        {activeSection === "pages" && <PagesSection />}
        {activeSection === "pricing" && <PricingSection />}
        {activeSection === "capital" && <CapitalSection />}
        {activeSection === "credit" && <CreditSection />}
        {activeSection === "nav" && <NavSection />}
      </main>
    </div>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold font-serif text-white">{title}</h1>
      {subtitle && <p className="text-sm mt-1" style={{ color: "#6b8526" }}>{subtitle}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ backgroundColor: "#1c2209", border: "1px solid #2e3a10" }}
    >
      {children}
    </div>
  );
}

function Badge({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
      style={{
        backgroundColor: gold ? "rgba(201,162,39,0.2)" : "rgba(107,133,38,0.2)",
        color: gold ? "#c9a227" : "#96b83d",
      }}
    >
      {children}
    </span>
  );
}

function OverviewSection() {
  return (
    <>
      <SectionHeader title="Dashboard Overview" subtitle="Headroom — Cash Flow Intelligence for SMBs" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Pages", value: "5" },
          { label: "Pricing Plans", value: "4" },
          { label: "Capital Tracks", value: "3" },
          { label: "Nav Links", value: "7" },
        ].map(({ label, value }) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#6b8526" }}>{label}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>
            Auth
          </h2>
          <div className="grid gap-3">
            <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: "#2e3a10" }}>
              <span className="text-sm" style={{ color: "#e8f0c2" }}>Storage</span>
              <Badge>SQLite — admin_users</Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: "#2e3a10" }}>
              <span className="text-sm" style={{ color: "#e8f0c2" }}>Password hashing</span>
              <Badge>bcrypt (cost 12)</Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: "#2e3a10" }}>
              <span className="text-sm" style={{ color: "#e8f0c2" }}>Sessions</span>
              <Badge>SQLite — admin_sessions</Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm" style={{ color: "#e8f0c2" }}>Session duration</span>
              <Badge>8 hours</Badge>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>
            Site Info
          </h2>
          <div className="grid gap-3">
            {[
              ["Product", "Headroom"],
              ["Stack", "Next.js 15 + Tailwind"],
              ["Target", "SMBs — cash flow intelligence"],
              ["Top CTA", "Start free trial → /#trial"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: "#2e3a10" }}>
                <span className="text-sm" style={{ color: "#e8f0c2" }}>{k}</span>
                <span className="text-sm" style={{ color: "#c4d97a" }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function PagesSection() {
  return (
    <>
      <SectionHeader title="Site Pages" subtitle="All pages currently in the Next.js app router" />
      <div className="grid gap-4">
        {PAGES.map((page) => (
          <Card key={page.path} className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-semibold text-white">{page.name}</span>
                <code className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: "#2e3a10", color: "#96b83d" }}>
                  {page.path}
                </code>
              </div>
              <p className="text-sm" style={{ color: "#6b8526" }}>{page.description}</p>
            </div>
            <Link
              href={page.path}
              target="_blank"
              className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-all hover:opacity-80"
              style={{ backgroundColor: "#2e3a10", color: "#c4d97a" }}
            >
              View ↗
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}

function PricingSection() {
  return (
    <>
      <SectionHeader title="Pricing Plans" subtitle="Monthly subscription tiers and add-ons" />
      <div className="grid md:grid-cols-2 gap-4">
        {PRICING_PLANS.map((p) => (
          <Card key={p.plan}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-white">{p.plan}</span>
              {p.highlight && <Badge gold>Most popular</Badge>}
            </div>
            <p className="text-2xl font-bold" style={{ color: "#c9a227" }}>{p.price}</p>
            <p className="text-xs mt-1" style={{ color: "#6b8526" }}>Connected accounts: {p.accounts}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>
          Full Comparison Matrix
        </h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #2e3a10" }}>
                  <th className="text-left pb-3 font-semibold" style={{ color: "#e8f0c2" }}>Capability</th>
                  {["Starter", "Growth", "Pro"].map((plan) => (
                    <th key={plan} className="text-center pb-3 font-semibold" style={{ color: "#96b83d" }}>{plan}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["90-day forecast",          "✓", "✓", "✓"],
                  ["Confidence bands",          "✓", "✓", "✓"],
                  ["Plain-language alerts",     "✓", "✓", "✓"],
                  ["Scenario planning",         "Core", "Advanced", "Advanced"],
                  ["Weekly AI insights",        "–", "✓", "✓"],
                  ["Embedded credit rescue",    "–", "✓", "✓"],
                  ["Repayment simulation",      "–", "✓", "✓"],
                  ["Silent underwriting",       "–", "–", "✓"],
                  ["Capital raise workflows",   "–", "–", "✓"],
                  ["Advisor access",            "–", "–", "✓"],
                  ["Support",                   "Email", "Priority", "Dedicated"],
                ].map(([feat, s, g, p], i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #2e3a10" }}>
                    <td className="py-3" style={{ color: "#e8f0c2" }}>{feat}</td>
                    {[s, g, p].map((val, j) => (
                      <td key={j} className="py-3 text-center" style={{ color: val === "–" ? "#2e3a10" : val === "✓" ? "#96b83d" : "#c9a227" }}>
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function CapitalSection() {
  return (
    <>
      <SectionHeader title="Capital Raise Tracks" subtitle="Three regulated funding paths for SMBs" />
      <div className="grid gap-4">
        {CAPITAL_TRACKS.map((t) => (
          <Card key={t.label}>
            <div className="flex items-start gap-4">
              <Badge gold>{t.label}</Badge>
              <div>
                <p className="font-semibold text-white">{t.title}</p>
                <p className="text-sm mt-1" style={{ color: "#c9a227" }}>{t.range}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>
            Headroom Advantages
          </h2>
          {[
            "Live investor dashboard tied to real cash flow",
            "Auto-repayment workflows for revenue-share structures",
            "Raise readiness scoring before campaign goes live",
            "Investor portal for updates, returns, and transparency",
          ].map((item) => (
            <div key={item} className="flex gap-2 py-2 border-b last:border-0" style={{ borderColor: "#2e3a10" }}>
              <span style={{ color: "#6b8526" }}>→</span>
              <p className="text-sm" style={{ color: "#e8f0c2" }}>{item}</p>
            </div>
          ))}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>
            Launch Requirements
          </h2>
          {[
            "FINRA-registered funding portal or white-label partner for Reg CF",
            "KYC and AML checks for every investor",
            "Escrow provider until raise closes",
            "Legal counsel and partner infrastructure before custom rails",
          ].map((item) => (
            <div key={item} className="flex gap-2 py-2 border-b last:border-0" style={{ borderColor: "#2e3a10" }}>
              <span style={{ color: "#c9a227" }}>!</span>
              <p className="text-sm" style={{ color: "#e8f0c2" }}>{item}</p>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function CreditSection() {
  return (
    <>
      <SectionHeader title="Credit Rescue Engine" subtitle="Embedded, forecast-triggered capital support" />

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {CREDIT_STEPS.map((step, i) => (
          <Card key={i}>
            <div className="flex gap-3 items-start">
              <span
                className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: "#2e3a10", color: "#c9a227" }}
              >
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed" style={{ color: "#e8f0c2" }}>{step}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>
          Design Principles
        </h2>
        {[
          "Embedded in the product workflow, not bolted on after the fact",
          "Triggered by real operating risk rather than broad acquisition funnels",
          "Designed to preserve visibility into future repayment pressure",
          "Structured to support smarter decisions, not just faster approvals",
        ].map((p) => (
          <div key={p} className="flex gap-2 py-2.5 border-b last:border-0" style={{ borderColor: "#2e3a10" }}>
            <span style={{ color: "#6b8526" }}>◆</span>
            <p className="text-sm" style={{ color: "#e8f0c2" }}>{p}</p>
          </div>
        ))}
      </Card>
    </>
  );
}

function NavSection() {
  return (
    <>
      <SectionHeader title="Navigation Links" subtitle="All links in the top navbar and mobile menu" />
      <Card>
        <div className="grid gap-2">
          {NAV_LINKS.map((link, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 border-b last:border-0"
              style={{ borderColor: "#2e3a10" }}
            >
              <span className="text-sm font-medium" style={{ color: "#e8f0c2" }}>{link.label}</span>
              <div className="flex items-center gap-3">
                <code className="text-xs font-mono" style={{ color: "#6b8526" }}>{link.href}</code>
                {link.href !== "#" && (
                  <Link
                    href={link.href}
                    target="_blank"
                    className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-80"
                    style={{ backgroundColor: "#2e3a10", color: "#96b83d" }}
                  >
                    ↗
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
