import Link from "next/link";

const options = [
  {
    type: "Revenue-based advance",
    amount: "$35K",
    detail: "Repay from monthly revenue until the target return is met",
    badge: "Fastest",
    badgeColor: "var(--olive-light)",
    badgeBg: "rgba(150,184,61,0.15)",
  },
  {
    type: "Invoice financing",
    amount: "$18K",
    detail: "Advance against unpaid invoices and settle on collection",
    badge: null,
    badgeColor: "",
    badgeBg: "",
  },
  {
    type: "Revolving credit line",
    amount: "$50K",
    detail: "Draw as needed and pay interest only on what you use",
    badge: "Flexible",
    badgeColor: "var(--gold)",
    badgeBg: "rgba(201,162,39,0.12)",
  },
];

export default function CreditSection() {
  return (
    <section className="py-20" style={{ backgroundColor: "var(--cream)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          <div>
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-4"
              style={{ color: "var(--olive-bright)" }}
            >
              Credit rescue
            </p>
            <h2
              className="text-3xl sm:text-4xl font-bold font-serif mb-6"
              style={{ color: "var(--text-dark)" }}
            >
              Capital when you need it, not after the damage is done
            </h2>
            <p
              className="text-lg leading-relaxed mb-8"
              style={{ color: "var(--text-muted)" }}
            >
              Headroom&apos;s credit layer connects directly to your forecast.
              When a cash gap is coming, we surface pre-qualified options in
              context and show what repayment would do to the next 90 days.
            </p>

            <div className="grid grid-cols-3 gap-4 mb-10">
              {[
                { value: "48 hrs", label: "Average decision time" },
                { value: "$20K", label: "Typical rescue amount" },
                { value: "0", label: "Hard pulls to preview fit" },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4 text-center"
                  style={{
                    backgroundColor: "var(--olive-cream)",
                    border: "1px solid var(--olive-wash)",
                  }}
                >
                  <p
                    className="text-2xl font-bold font-serif mb-1"
                    style={{ color: "var(--olive-mid)" }}
                  >
                    {stat.value}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            <Link
              href="/credit"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
              style={{
                backgroundColor: "var(--olive-mid)",
                color: "var(--cream)",
              }}
            >
              Explore credit rescue
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
            <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
              No hard credit pull to preview options
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {options.map((card, i) => (
              <div
                key={i}
                className="rounded-xl p-5 flex items-center justify-between"
                style={{
                  backgroundColor: "var(--white)",
                  border: "1px solid var(--olive-wash)",
                }}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-dark)" }}
                    >
                      {card.type}
                    </p>
                    {card.badge && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: card.badgeColor,
                          backgroundColor: card.badgeBg,
                        }}
                      >
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {card.detail}
                  </p>
                </div>
                <p
                  className="text-xl font-bold font-serif"
                  style={{ color: "var(--olive-mid)" }}
                >
                  {card.amount}
                </p>
              </div>
            ))}

            <div
              className="rounded-xl p-5"
              style={{
                backgroundColor: "rgba(201,162,39,0.08)",
                border: "1px solid rgba(201,162,39,0.3)",
              }}
            >
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 flex-shrink-0 mt-0.5"
                  style={{ color: "var(--gold)" }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p
                    className="text-sm font-semibold mb-1"
                    style={{ color: "var(--gold)" }}
                  >
                    How Headroom credit works
                  </p>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    We use your real cash flow data, not just a bureau score,
                    to match you with lending partners that fit the business.
                    Every offer is shown with its expected impact on runway.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
