const steps = [
  {
    number: "01",
    title: "Connect",
    description:
      "Link bank accounts, QuickBooks, Xero, and manual cash commitments so Headroom starts with the real operating picture.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ color: "var(--gold)" }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Normalize",
    description:
      "We clean transactions, map merchants, tag inflows and outflows, and detect recurring cash patterns in the background.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ color: "var(--gold)" }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Forecast",
    description:
      "The 90-day engine projects daily cash with confidence bands so you can see expected, downside, and upside outcomes.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ color: "var(--gold)" }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Act",
    description:
      "Get alerts, test scenarios, compare financing impact, and prepare for a raise before a timing problem turns into a crisis.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ color: "var(--gold)" }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20" style={{ backgroundColor: "var(--cream)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--olive-bright)" }}
          >
            How it works
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold font-serif"
            style={{ color: "var(--text-dark)" }}
          >
            From connected accounts to confident action
          </h2>
        </div>

        <div className="relative">
          <div
            className="hidden lg:block absolute top-10 left-0 right-0 h-0.5"
            style={{
              background:
                "linear-gradient(to right, transparent 5%, var(--olive-wash) 10%, var(--olive-wash) 90%, transparent 95%)",
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <div
                key={i}
                className="relative flex flex-col items-center text-center"
              >
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-6 relative z-10"
                  style={{
                    backgroundColor: "var(--olive-deepest)",
                    border: "3px solid var(--gold)",
                  }}
                >
                  {step.icon}
                </div>

                <p
                  className="text-xs font-bold uppercase tracking-widest mb-2"
                  style={{ color: "var(--olive-bright)" }}
                >
                  Step {step.number}
                </p>

                <h3
                  className="text-xl font-bold font-serif mb-3"
                  style={{ color: "var(--text-dark)" }}
                >
                  {step.title}
                </h3>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
