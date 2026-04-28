import type { Metadata } from "next";
import Link from "next/link";
import PricingCard from "@/components/PricingCard";
import CTASection from "@/components/CTASection";

export const metadata: Metadata = {
  title: "Pricing | Headroom",
  description:
    "Transparent monthly pricing for Headroom cash flow intelligence, embedded credit rescue, and capital readiness.",
};

const plans = [
  {
    plan: "Starter",
    price: "$29",
    description:
      "For early-stage operators who need a clear cash view, plain-language alerts, and a trustworthy forecasting baseline.",
    features: [
      "90-day cash flow forecast",
      "2 connected financial accounts",
      "Confidence bands on projected cash position",
      "Email alerts for low cash and overdue invoices",
      "Weekly cash digest",
      "Core scenario planning",
      "Email support",
    ],
    cta: "Get started",
    featured: false,
  },
  {
    plan: "Growth",
    price: "$79",
    description:
      "For growing SMBs that need deeper monitoring, smarter interventions, and access to Headroom credit rescue workflows.",
    features: [
      "Everything in Starter",
      "Unlimited connected accounts",
      "Scenario planner with side-by-side comparisons",
      "Weekly AI cash insights",
      "Alert inbox with recommended actions",
      "Embedded credit rescue recommendations",
      "Priority support",
    ],
    cta: "Get started",
    featured: true,
    badge: "Most popular",
  },
  {
    plan: "Pro",
    price: "$149",
    description:
      "For finance-led teams that want the full Headroom platform, including advisor access, underwriting signals, and capital readiness.",
    features: [
      "Everything in Growth",
      "Accountant and advisor access",
      "Silent underwriting readiness signals",
      "Investor dashboard and raise preparation",
      "Multi-entity support",
      "API and advanced reporting access",
      "Dedicated success support",
    ],
    cta: "Get started",
    featured: false,
  },
];

const comparisonRows = [
  ["90-day forecast", "Included", "Included", "Included"],
  ["Confidence bands", "Included", "Included", "Included"],
  ["Plain-language alerts", "Included", "Included", "Included"],
  ["Scenario planning", "Core", "Advanced", "Advanced"],
  ["Weekly AI insights", "-", "Included", "Included"],
  ["Embedded credit rescue", "-", "Included", "Included"],
  ["Repayment simulation", "-", "Included", "Included"],
  ["Silent underwriting signals", "-", "-", "Included"],
  ["Capital raise workflows", "-", "-", "Included"],
  ["Advisor access", "-", "-", "Included"],
  ["Support", "Email", "Priority", "Dedicated"],
];

export default function PricingPage() {
  return (
    <>
      <section
        className="py-20"
        style={{
          background:
            "linear-gradient(135deg, var(--olive-cream) 0%, var(--olive-wash) 100%)",
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-4"
            style={{ color: "var(--olive-bright)" }}
          >
            Headroom pricing
          </p>
          <h1
            className="text-4xl sm:text-5xl font-bold font-serif mb-5"
            style={{ color: "var(--text-dark)" }}
          >
            Choose the operating layer your cash flow needs.
          </h1>
          <p className="text-lg" style={{ color: "var(--text-muted)" }}>
            Transparent monthly pricing for forecasting, alerts, embedded
            credit rescue, and the capital readiness workflows that help SMBs
            stay ahead of cash pressure.
          </p>
        </div>
      </section>

      <section className="py-16" style={{ backgroundColor: "var(--cream)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {plans.map((plan, i) => (
              <PricingCard key={i} {...plan} />
            ))}
          </div>

          <div
            className="mt-8 rounded-2xl p-6 sm:p-8"
            style={{
              backgroundColor: "var(--olive-cream)",
              border: "1px solid var(--olive-wash)",
            }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div>
                <p
                  className="text-sm font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "var(--olive-bright)" }}
                >
                  Capital raise add-on
                </p>
                <h2
                  className="text-2xl font-bold font-serif mb-2"
                  style={{ color: "var(--text-dark)" }}
                >
                  $299/mo while your raise is active
                </h2>
                <p
                  className="text-sm sm:text-base"
                  style={{ color: "var(--text-muted)" }}
                >
                  Add public capital workflows, raise readiness support,
                  investor visibility, and campaign guidance only during the
                  period you are actively raising.
                </p>
              </div>
              <Link
                href="/capital"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
                style={{
                  backgroundColor: "var(--olive-mid)",
                  color: "var(--cream)",
                }}
              >
                Explore capital raise add-on
              </Link>
            </div>
          </div>

          <p
            className="text-center mt-8 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            All prices in USD, billed monthly. Need help choosing the right
            layer?{" "}
            <Link
              href="/features"
              style={{ color: "var(--olive-bright)" }}
              className="underline"
            >
              Compare the platform
            </Link>
            .
          </p>
        </div>
      </section>

      <section
        className="py-16"
        style={{ backgroundColor: "var(--olive-cream)" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className="text-2xl font-bold font-serif text-center mb-10"
            style={{ color: "var(--text-dark)" }}
          >
            Compare what each plan unlocks
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  style={{ borderBottom: "1px solid var(--olive-wash)" }}
                  className="text-left"
                >
                  <th
                    className="pb-4 text-sm font-semibold w-1/2"
                    style={{ color: "var(--text-dark)" }}
                  >
                    Capability
                  </th>
                  {["Starter", "Growth", "Pro"].map((plan) => (
                    <th
                      key={plan}
                      className="pb-4 text-sm font-semibold text-center"
                      style={{ color: "var(--text-mid)" }}
                    >
                      {plan}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([feature, starter, growth, pro], i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid var(--olive-wash)" }}
                  >
                    <td
                      className="py-3.5 text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {feature}
                    </td>
                    {[starter, growth, pro].map((value, j) => (
                      <td
                        key={j}
                        className="py-3.5 text-sm text-center font-medium"
                        style={{
                          color:
                            value === "-"
                              ? "var(--olive-wash)"
                              : value === "Included"
                              ? "var(--olive-bright)"
                              : "var(--text-mid)",
                        }}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-16" style={{ backgroundColor: "var(--cream)" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-2xl font-bold font-serif mb-4"
            style={{ color: "var(--text-dark)" }}
          >
            Need a custom rollout?
          </h2>
          <p className="text-base mb-6" style={{ color: "var(--text-muted)" }}>
            For advisor networks, multi-brand operators, or teams preparing for
            credit and capital programs at scale, we can tailor onboarding and
            support around your rollout.
          </p>
          <Link
            href="/#trial"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
            style={{
              backgroundColor: "var(--olive-mid)",
              color: "var(--cream)",
            }}
          >
            Request a rollout plan
          </Link>
        </div>
      </section>

      <CTASection />
    </>
  );
}
