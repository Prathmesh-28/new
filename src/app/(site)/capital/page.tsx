import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Headroom Capital | Community and Public Capital for SMBs",
  description:
    "Headroom helps SMBs prepare for revenue-share, Reg CF, and Reg A+ raises with live cash visibility, investor dashboards, and raise-readiness guidance.",
};

const tracks = [
  {
    label: "Track A",
    title: "Revenue-share crowdfunding",
    range: "$10K - $500K",
    description:
      "Raise from supporters and repay as a percentage of monthly revenue until the agreed return multiple is reached.",
    bestFor: "Restaurants, retail, and service businesses with loyal communities",
  },
  {
    label: "Track B",
    title: "Reg CF equity raise",
    range: "Up to $5M / year",
    description:
      "Sell equity to the public through a registered funding portal and give supporters a direct stake in the business.",
    bestFor: "Businesses ready for broader community participation and formal disclosures",
  },
  {
    label: "Track C",
    title: "Reg A+ mini-IPO",
    range: "Up to $75M / year",
    description:
      "Run a much larger public raise under Regulation A+ with SEC-qualified offering documents and a future path to liquidity.",
    bestFor: "Growth-stage businesses with strong revenue, ambition, and a credible public story",
  },
];

const advantages = [
  "Live investor dashboard tied to real cash flow and performance data",
  "Auto-repayment workflows for revenue-share structures",
  "Raise readiness scoring before a campaign ever goes live",
  "Investor portal for updates, returns, and campaign transparency",
];

const requirements = [
  "Work with a FINRA-registered funding portal or white-label partner for Reg CF",
  "Run KYC and AML checks for every investor before funds are accepted",
  "Use an escrow provider until the raise closes",
  "Launch with legal counsel and partner infrastructure before building custom rails",
];

export default function CapitalPage() {
  return (
    <main
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(180deg, var(--cream) 0%, #f3ecdd 45%, #ece0ca 100%)",
        color: "var(--text-dark)",
      }}
    >
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-24 sm:px-8 lg:px-12 lg:pt-28">
        <div className="max-w-4xl">
          <span
            className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{
              borderColor: "rgba(94, 82, 64, 0.18)",
              backgroundColor: "rgba(255,255,255,0.55)",
              color: "var(--olive-mid)",
            }}
          >
            Public capital engine
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Raise from the people who already believe in your business
          </h1>
          <p
            className="mt-6 max-w-3xl text-lg leading-8"
            style={{ color: "rgba(42, 36, 28, 0.78)" }}
          >
            Headroom extends cash flow intelligence into capital formation.
            Businesses can prepare for revenue-share, Reg CF, or Reg A+ raises
            with live operating visibility, investor transparency, and a clearer
            path from readiness to launch.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 sm:px-8 lg:px-12">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Three capital tracks inside Headroom
          </h2>
          <p
            className="mt-4 text-base leading-7"
            style={{ color: "rgba(42, 36, 28, 0.76)" }}
          >
            Each track is designed for a different business size, investor
            profile, and level of regulatory complexity.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {tracks.map((track) => (
            <div
              key={track.title}
              className="rounded-3xl border p-7 shadow-sm"
              style={{
                borderColor: "rgba(94, 82, 64, 0.14)",
                backgroundColor: "rgba(255,255,255,0.78)",
              }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--olive-bright)" }}
              >
                {track.label}
              </p>
              <h3 className="mt-3 text-2xl font-semibold">{track.title}</h3>
              <p
                className="mt-2 text-sm font-semibold"
                style={{ color: "var(--olive-mid)" }}
              >
                {track.range}
              </p>
              <p
                className="mt-4 text-sm leading-7"
                style={{ color: "rgba(42, 36, 28, 0.76)" }}
              >
                {track.description}
              </p>
              <p
                className="mt-4 text-sm leading-7"
                style={{ color: "rgba(42, 36, 28, 0.76)" }}
              >
                Best for: {track.bestFor}
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
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Why Headroom has an advantage in capital formation
              </h2>
              <p
                className="mt-4 max-w-2xl text-base leading-7"
                style={{ color: "rgba(42, 36, 28, 0.78)" }}
              >
                Standalone crowdfunding platforms ask investors to trust a deck.
                Headroom can show live operating data, repayment progress, and
                raise readiness because the financial transparency layer already
                exists inside the product.
              </p>
            </div>

            <div className="grid gap-4">
              {advantages.map((item) => (
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
            <h2 className="text-2xl font-semibold">Compliance first</h2>
            <p
              className="mt-4 text-sm leading-7 sm:text-base"
              style={{ color: "rgba(42, 36, 28, 0.76)" }}
            >
              The fastest path to market is partner-led. Headroom can wrap the
              operating and transparency experience around existing funding
              portal, KYC, AML, and escrow infrastructure before owning more of
              the stack.
            </p>
          </div>

          <div
            className="rounded-3xl border p-7 shadow-sm"
            style={{
              borderColor: "rgba(94, 82, 64, 0.14)",
              backgroundColor: "rgba(255,255,255,0.76)",
            }}
          >
            <h2 className="text-2xl font-semibold">Launch requirements</h2>
            <div className="mt-4 grid gap-3">
              {requirements.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border px-4 py-3 text-sm leading-6"
                  style={{ borderColor: "rgba(94, 82, 64, 0.12)" }}
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
