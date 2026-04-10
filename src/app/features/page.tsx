import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Headroom Features | Cash Flow Intelligence for SMBs",
  description:
    "Explore Headroom: a 10-layer platform for data ingestion, forecasting, alerts, scenario planning, embedded credit rescue, and community capital readiness.",
};

const platformLayers = [
  {
    title: "Live data ingestion",
    description:
      "Connect bank accounts, accounting platforms, receivables, and manual obligations into a rolling operating ledger.",
  },
  {
    title: "Normalization and categorization",
    description:
      "Deduplicate transactions, normalize merchants, tag inflows and outflows, and detect recurring cash patterns automatically.",
  },
  {
    title: "90-day forecast engine",
    description:
      "Combine recurring, variable, and scenario-based models into one daily cash projection for the next 90 days.",
  },
  {
    title: "Confidence bands",
    description:
      "Show best-case, expected, and downside outcomes so teams can plan around uncertainty instead of false precision.",
  },
  {
    title: "Alert and insight engine",
    description:
      "Turn forecast changes into plain-language warnings, anomaly prompts, overdue invoice nudges, and weekly narrative summaries.",
  },
  {
    title: "Operator-first dashboard",
    description:
      "Give owners one clear view of current balance, burn, projected low point, runway, and the timeline that drives each decision.",
  },
  {
    title: "Scenario planner",
    description:
      "Compare hiring, contract wins, slow months, and financing choices side by side before committing.",
  },
  {
    title: "Embedded credit rescue",
    description:
      "Surface contextual credit options when Headroom sees a cash gap coming instead of sending operators to start over elsewhere.",
  },
  {
    title: "Silent underwriting and repayment simulation",
    description:
      "Use live operating data to pre-qualify support and show how repayment changes the forecast before acceptance.",
  },
  {
    title: "Community and public capital",
    description:
      "Prepare businesses for revenue-share, Reg CF, and Reg A+ paths with raise readiness, investor visibility, and ongoing transparency.",
  },
];

const detailSections = [
  {
    heading: "Built as one operating system, not a stack of disconnected tools",
    body:
      "Headroom is designed for SMB operators who need a truthful picture of cash, not another dashboard full of vanity signals. Forecasting, monitoring, funding readiness, and capital access all run through one shared operating model.",
  },
  {
    heading: "Forecasting that stays honest under uncertainty",
    body:
      "Instead of pretending every projection is exact, Headroom uses confidence bands and scenarios to show where outcomes may land. That gives teams a more credible planning surface for payroll, payables, collections, and growth decisions.",
  },
  {
    heading: "Capital support embedded directly into operations",
    body:
      "When liquidity risk appears, Headroom can move from warning to support. Silent underwriting, rescue offers, and repayment simulation help teams evaluate financing inside the same context as the forecast that triggered it.",
  },
];

export default function FeaturesPage() {
  return (
    <main
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(180deg, var(--cream) 0%, #f5efe2 45%, #efe6d4 100%)",
        color: "var(--text-dark)",
      }}
    >
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-24 sm:px-8 lg:px-12 lg:pt-28">
        <div className="max-w-3xl">
          <span
            className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{
              borderColor: "rgba(94, 82, 64, 0.18)",
              backgroundColor: "rgba(255,255,255,0.55)",
              color: "var(--olive-mid)",
            }}
          >
            Headroom platform
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            A 10-layer cash flow intelligence platform for modern SMB operators
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg leading-8"
            style={{ color: "rgba(42, 36, 28, 0.78)" }}
          >
            Headroom helps businesses forecast cash with more honesty, detect
            risk earlier, and access the right capital path when timing gets
            tight. It connects planning, alerts, underwriting, and execution
            inside one product experience.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-16 sm:px-8 lg:grid-cols-2 lg:px-12">
        {detailSections.map((section) => (
          <div
            key={section.heading}
            className="rounded-3xl border p-7 shadow-sm"
            style={{
              borderColor: "rgba(94, 82, 64, 0.14)",
              backgroundColor: "rgba(255,255,255,0.72)",
            }}
          >
            <h2 className="text-xl font-semibold">{section.heading}</h2>
            <p
              className="mt-4 text-sm leading-7 sm:text-base"
              style={{ color: "rgba(42, 36, 28, 0.76)" }}
            >
              {section.body}
            </p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 sm:px-8 lg:px-12">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            The 10 layers behind Headroom
          </h2>
          <p
            className="mt-4 text-base leading-7"
            style={{ color: "rgba(42, 36, 28, 0.76)" }}
          >
            Each layer is designed to strengthen operating clarity, funding
            readiness, and decision quality without forcing teams into multiple
            systems.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {platformLayers.map((layer, index) => (
            <div
              key={layer.title}
              className="rounded-3xl border p-6 shadow-sm"
              style={{
                borderColor: "rgba(94, 82, 64, 0.14)",
                backgroundColor: "rgba(255,255,255,0.78)",
              }}
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  backgroundColor: "rgba(192, 160, 98, 0.16)",
                  color: "var(--olive-mid)",
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </div>
              <h3 className="text-lg font-semibold">{layer.title}</h3>
              <p
                className="mt-3 text-sm leading-7"
                style={{ color: "rgba(42, 36, 28, 0.76)" }}
              >
                {layer.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 sm:px-8 lg:px-12">
        <div
          className="rounded-[2rem] border p-8 sm:p-10"
          style={{
            borderColor: "rgba(94, 82, 64, 0.14)",
            background:
              "linear-gradient(135deg, rgba(64, 86, 58, 0.08) 0%, rgba(192, 160, 98, 0.14) 100%)",
          }}
        >
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                From signal to action in one workflow
              </h2>
              <p
                className="mt-4 max-w-2xl text-base leading-7"
                style={{ color: "rgba(42, 36, 28, 0.78)" }}
              >
                Headroom is built for the moment a forecast changes. Teams can
                see what moved, understand the likely impact on the next 90
                days, receive plain-language alerts, and evaluate rescue or
                raise paths without losing operating context.
              </p>
            </div>

            <div className="grid gap-4">
              {[
                "Detect cash pressure early with confidence-based forecasting",
                "Trigger alert-driven decisions instead of reactive spreadsheet work",
                "Evaluate embedded credit with silent underwriting in the background",
                "Model repayment impact before taking on new obligations",
                "Progress toward community and public capital when growth requires it",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border px-4 py-4 text-sm leading-6"
                  style={{
                    borderColor: "rgba(94, 82, 64, 0.14)",
                    backgroundColor: "rgba(255,255,255,0.64)",
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
