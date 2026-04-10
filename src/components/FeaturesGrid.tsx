import FeatureCard from "./FeatureCard";

const features = [
  {
    tag: "Forecasting layer",
    title: "90-Day Forecast With Confidence Bands",
    description:
      "Headroom turns live bank and accounting data into a rolling view of the next 90 days, so you can see likely cash gaps before they become operating problems.",
    details: [
      "Rolling forecast built from connected financial data",
      "Confidence bands that show certainty instead of false precision",
      "Daily refresh as new transactions land",
      "Clear view of inflows, outflows, and low-cash dates",
    ],
    icon: (
      <svg
        className="w-6 h-6"
        style={{ color: "var(--olive-mid)" }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    tag: "Alert layer",
    title: "Plain-Language Alerts And Insights",
    description:
      "Instead of dashboard noise, Headroom explains what changed, why it matters, and what to do next in language owners and finance teams can actually use.",
    details: [
      "Warnings before a projected cash shortfall",
      "Context on receivables, expenses, and timing risk",
      "Recommended actions tied to the forecast",
      "Weekly narrative insights grounded in real business data",
    ],
    icon: (
      <svg
        className="w-6 h-6"
        style={{ color: "var(--olive-mid)" }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
    ),
  },
  {
    tag: "Decision layer",
    title: "Scenario Planning Before You Commit",
    description:
      "Test hiring, inventory, payment delays, big contracts, or a slow month before making the move. Headroom shows the cash impact so you can decide with more confidence.",
    details: [
      "Model best-case, expected, and downside scenarios",
      "Compare timing decisions side by side",
      "See repayment and runway implications in advance",
      "Share scenarios with operators, accountants, and advisors",
    ],
    icon: (
      <svg
        className="w-6 h-6"
        style={{ color: "var(--olive-mid)" }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
  {
    tag: "Rescue layer",
    title: "Embedded Credit Rescue",
    description:
      "When a shortfall is coming, Headroom can surface financing options inside the workflow instead of forcing you to scramble after the fact.",
    details: [
      "Credit rescue triggered by forecasted cash stress",
      "Silent underwriting from connected operating data",
      "Repayment impact shown inside the same forecast",
      "Designed to shorten time from warning to action",
    ],
    icon: (
      <svg
        className="w-6 h-6"
        style={{ color: "var(--olive-mid)" }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    ),
  },
  {
    tag: "Capital layer",
    title: "Community And Public Capital",
    description:
      "Headroom goes beyond debt. The platform supports community-backed and public capital paths so SMBs can raise aligned growth funding when the time is right.",
    details: [
      "Revenue-share, Reg CF, and Reg A+ pathways",
      "Raise readiness connected to live cash planning",
      "Investor transparency tied to real operating data",
      "A path up to $75M in annual public capital raises",
    ],
    icon: (
      <svg
        className="w-6 h-6"
        style={{ color: "var(--olive-mid)" }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
  },
  {
    tag: "Platform layer",
    title: "One Operating System For Cash Decisions",
    description:
      "Forecasting, alerts, rescue financing, and capital planning work better together. Headroom brings the full operating loop into one place for SMB teams.",
    details: [
      "Designed as a 10-layer cash flow intelligence platform",
      "Shared data model across forecasting and capital workflows",
      "Operator-friendly experience for founders and finance leads",
      "Built for honest visibility, not vanity metrics",
    ],
    icon: (
      <svg
        className="w-6 h-6"
        style={{ color: "var(--olive-mid)" }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
  },
];

interface FeaturesGridProps {
  expanded?: boolean;
}

export default function FeaturesGrid({ expanded = false }: FeaturesGridProps) {
  return (
    <section
      className="py-20"
      style={{ backgroundColor: "var(--olive-cream)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--olive-bright)" }}
          >
            What Headroom covers
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold font-serif mb-4"
            style={{ color: "var(--text-dark)" }}
          >
            Cash flow intelligence built for real SMB decisions
          </h2>
          <p
            className="text-lg max-w-2xl mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            From forecasting to rescue capital, each layer works together so
            you can see risk early, understand it clearly, and act before cash
            gets tight.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <FeatureCard
              key={i}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              tag={feature.tag}
              expanded={expanded}
              details={feature.details}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
