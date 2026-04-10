import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Headroom Credit Rescue | Embedded Capital Support for SMBs",
  description:
    "Headroom embeds credit rescue into cash flow operations with silent underwriting, repayment impact simulation, and alert-driven support when liquidity tightens.",
};

const creditSteps = [
  {
    title: "1. Forecast identifies pressure",
    description:
      "Headroom monitors daily cash position, safety threshold, and downside cases to spot a likely gap before it reaches the bank balance.",
  },
  {
    title: "2. Alerts explain what changed",
    description:
      "Instead of a generic warning, the alert engine shows whether pressure comes from payroll timing, overdue invoices, inventory, debt service, or revenue softness.",
  },
  {
    title: "3. Silent underwriting runs in the background",
    description:
      "When rescue is appropriate, Headroom evaluates inflow consistency, overdraft history, and repayment load using connected data before a formal application starts.",
  },
  {
    title: "4. Repayment impact is simulated before acceptance",
    description:
      "Operators can see how a facility changes future cash positions, helping them compare support options without masking downstream strain.",
  },
];

const principles = [
  "Embedded in the product workflow, not bolted on after the fact",
  "Triggered by real operating risk rather than broad acquisition funnels",
  "Designed to preserve visibility into future repayment pressure",
  "Structured to support smarter decisions, not just faster approvals",
];

export default function CreditPage() {
  return (
    <main
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(180deg, var(--cream) 0%, #f4eddf 42%, #ece1cc 100%)",
        color: "var(--text-dark)",
      }}
    >
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-24 sm:px-8 lg:px-12 lg:pt-28">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span
              className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{
                borderColor: "rgba(94, 82, 64, 0.18)",
                backgroundColor: "rgba(255,255,255,0.55)",
                color: "var(--olive-mid)",
              }}
            >
              Embedded credit rescue
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Credit support that appears inside the cash flow workflow
            </h1>
            <p
              className="mt-6 max-w-2xl text-lg leading-8"
              style={{ color: "rgba(42, 36, 28, 0.78)" }}
            >
              Headroom does not treat financing as a separate destination. When
              a forecast shows real pressure, the platform can surface rescue
              options in context, evaluate fit with silent underwriting, and
              model repayment impact before a business commits.
            </p>
          </div>

          <div
            className="rounded-[2rem] border p-7 shadow-sm sm:p-8"
            style={{
              borderColor: "rgba(94, 82, 64, 0.14)",
              backgroundColor: "rgba(255,255,255,0.76)",
            }}
          >
            <div className="grid gap-4">
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: "rgba(94, 82, 64, 0.12)" }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--olive-mid)" }}
                >
                  Forecast signal
                </p>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "rgba(42, 36, 28, 0.76)" }}
                >
                  P50 cash crosses your safety threshold or goes negative inside
                  the next 30 days.
                </p>
              </div>
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: "rgba(94, 82, 64, 0.12)" }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--olive-mid)" }}
                >
                  Rescue evaluation
                </p>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "rgba(42, 36, 28, 0.76)" }}
                >
                  Headroom checks silent underwriting signals using connected
                  operating data already in the workspace.
                </p>
              </div>
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: "rgba(94, 82, 64, 0.12)" }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--olive-mid)" }}
                >
                  Decision support
                </p>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "rgba(42, 36, 28, 0.76)" }}
                >
                  Repayment simulation shows how accepting capital changes
                  runway across the next 90 days.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 sm:px-8 lg:px-12">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            How the rescue engine works
          </h2>
          <p
            className="mt-4 text-base leading-7"
            style={{ color: "rgba(42, 36, 28, 0.76)" }}
          >
            The Headroom credit layer responds to real operating conditions, not
            generic lead forms. It keeps the financing decision tied to the
            forecast that made support necessary in the first place.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {creditSteps.map((step) => (
            <div
              key={step.title}
              className="rounded-3xl border p-6 shadow-sm"
              style={{
                borderColor: "rgba(94, 82, 64, 0.14)",
                backgroundColor: "rgba(255,255,255,0.76)",
              }}
            >
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p
                className="mt-3 text-sm leading-7"
                style={{ color: "rgba(42, 36, 28, 0.76)" }}
              >
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 sm:px-8 lg:px-12">
        <div
          className="rounded-[2rem] border p-8 sm:p-10"
          style={{
            borderColor: "rgba(94, 82, 64, 0.14)",
            background:
              "linear-gradient(135deg, rgba(64, 86, 58, 0.08) 0%, rgba(192, 160, 98, 0.14) 100%)",
          }}
        >
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Repayment simulation changes the decision quality
              </h2>
              <p
                className="mt-4 text-base leading-7"
                style={{ color: "rgba(42, 36, 28, 0.78)" }}
              >
                Many products stop at eligibility. Headroom goes further by
                showing how repayment could affect cash flow over time. That
                helps operators understand whether support genuinely stabilizes
                the business or simply moves pressure into the next cycle.
              </p>
            </div>

            <div className="grid gap-4">
              {[
                "Compare projected cash positions before and after financing",
                "See how repayment timing interacts with payroll, payables, and collections",
                "Evaluate whether the rescue option protects or compresses runway",
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

      <section className="mx-auto max-w-6xl px-6 pb-24 sm:px-8 lg:px-12">
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div
            className="rounded-3xl border p-7 shadow-sm"
            style={{
              borderColor: "rgba(94, 82, 64, 0.14)",
              backgroundColor: "rgba(255,255,255,0.76)",
            }}
          >
            <h2 className="text-2xl font-semibold">Why this approach matters</h2>
            <p
              className="mt-4 text-sm leading-7 sm:text-base"
              style={{ color: "rgba(42, 36, 28, 0.76)" }}
            >
              Embedded credit rescue works best when it stays connected to the
              operating truth of the business. Headroom uses forecasting and
              alerting to identify when support may be needed, then frames
              financing as one option inside a broader cash management workflow.
            </p>
          </div>

          <div
            className="rounded-3xl border p-7 shadow-sm"
            style={{
              borderColor: "rgba(94, 82, 64, 0.14)",
              backgroundColor: "rgba(255,255,255,0.76)",
            }}
          >
            <h2 className="text-2xl font-semibold">Design principles</h2>
            <div className="mt-4 grid gap-3">
              {principles.map((principle) => (
                <div
                  key={principle}
                  className="rounded-2xl border px-4 py-3 text-sm leading-6"
                  style={{ borderColor: "rgba(94, 82, 64, 0.12)" }}
                >
                  {principle}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
