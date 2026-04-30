import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Headroom for Advisors | CA, CFO & Financial Advisors",
  description:
    "Give your SMB clients real-time cash flow intelligence. Headroom's advisor portal lets CAs, fractional CFOs, and financial advisors monitor, forecast, and act — without chasing spreadsheets.",
};

const benefits = [
  {
    title: "Client portfolio view",
    description:
      "See all your clients' cash positions, runway, and upcoming obligations in one place — without logging in and out of each account.",
  },
  {
    title: "Live 90-day forecasts",
    description:
      "Access the same rolling cash forecast your clients see, with confidence bands and scenario toggles, so your advice is grounded in actual data.",
  },
  {
    title: "Alert feed",
    description:
      "Get notified when a client's forecast crosses a threshold — projected shortfall, unusual burn, overdue receivable — before the client panics.",
  },
  {
    title: "Credit rescue context",
    description:
      "When a cash gap appears, Headroom surfaces pre-qualified credit options alongside repayment simulations. You advise; Headroom handles the underwriting context.",
  },
  {
    title: "Capital readiness scoring",
    description:
      "Know which clients are ready for revenue-share, Reg CF, or Reg A+ before they ask. Track raise readiness without a separate due diligence process.",
  },
  {
    title: "White-label ready",
    description:
      "Deliver Headroom's intelligence under your own brand. Custom domain, your logo, your client relationships — fully intact.",
  },
];

const useCases = [
  {
    role: "Chartered Accountant",
    description:
      "Replace quarterly check-ins with a live cash dashboard. Spot tax obligations, vendor payments, and low-balance risks weeks in advance.",
  },
  {
    role: "Fractional CFO",
    description:
      "Serve more clients without hiring analysts. Headroom handles data ingestion and forecast generation so you focus on strategy.",
  },
  {
    role: "Business Banker",
    description:
      "Identify clients who need credit before they ask. Use Headroom's pre-qualification signals to lead with the right product at the right time.",
  },
  {
    role: "Startup Advisor",
    description:
      "Monitor burn rate and runway across your portfolio. Get the weekly narrative summary that turns data into board-ready language.",
  },
];

export default function AdvisorsPage() {
  return (
    <main>
      {/* Hero */}
      <section
        className="py-20 px-4 text-center"
        style={{ backgroundColor: "var(--olive-deepest)" }}
      >
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>
            For advisors
          </p>
          <h1 className="text-4xl md:text-5xl font-bold font-serif text-white mb-6" style={{ lineHeight: 1.15 }}>
            Your clients&apos; cash flow,{" "}
            <span style={{ color: "var(--gold)" }}>always in view</span>
          </h1>
          <p className="text-lg mb-10" style={{ color: "var(--olive-wash)", maxWidth: "600px", margin: "0 auto 2.5rem" }}>
            Headroom gives CAs, fractional CFOs, and financial advisors a real-time window into every client&apos;s operating cash — without spreadsheets, exports, or chasing follow-ups.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/admin/login/?mode=trial"
              className="px-8 py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--gold)", color: "var(--olive-deepest)" }}
            >
              Start free trial →
            </Link>
            <Link
              href="/pricing/"
              className="px-8 py-3 rounded-lg text-sm font-semibold border transition-all hover:opacity-80"
              style={{ borderColor: "var(--olive-mid)", color: "var(--olive-wash)" }}
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-16 px-4" style={{ backgroundColor: "var(--olive-deep)" }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold font-serif text-white text-center mb-10">
            Built for every advisory role
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {useCases.map((item) => (
              <div
                key={item.role}
                className="rounded-xl p-6"
                style={{ backgroundColor: "var(--olive-deepest)", border: "1px solid var(--olive-mid)" }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--gold)" }}>
                  {item.role}
                </p>
                <p className="text-sm" style={{ color: "var(--olive-wash)", lineHeight: 1.7 }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4" style={{ backgroundColor: "var(--olive-deepest)" }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold font-serif text-white text-center mb-10">
            Everything you need to advise with confidence
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {benefits.map((item) => (
              <div
                key={item.title}
                className="rounded-xl p-6"
                style={{ backgroundColor: "var(--olive-deep)", border: "1px solid var(--olive-mid)" }}
              >
                <h3 className="text-sm font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm" style={{ color: "var(--olive-wash)", lineHeight: 1.7 }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center" style={{ backgroundColor: "var(--olive-deep)" }}>
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold font-serif text-white mb-4">
            Ready to see it in action?
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--olive-wash)" }}>
            Start with one client. No credit card required. Upgrade to an advisor seat when you&apos;re ready to manage your full portfolio.
          </p>
          <Link
            href="/admin/login/?mode=trial"
            className="inline-block px-10 py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: "var(--gold)", color: "var(--olive-deepest)" }}
          >
            Start free 14-day trial →
          </Link>
        </div>
      </section>
    </main>
  );
}
