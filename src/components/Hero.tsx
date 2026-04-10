import Link from "next/link";
import DashboardMockup from "./DashboardMockup";

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #F4F1E4 0%, #E8F0C2 50%, #F4F1E4 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 70% 50%, #C4D97A 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 mb-6">
              <span
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: "rgba(201,162,39,0.15)",
                  border: "1px solid rgba(201,162,39,0.4)",
                  color: "#8B6A0A",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--gold)" }}
                />
                Headroom cash flow intelligence
              </span>
            </div>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold font-serif leading-tight mb-6"
              style={{ color: "var(--text-dark)" }}
            >
              See your cash flow{" "}
              <span className="block" style={{ color: "var(--olive-mid)" }}>
                before the pressure hits.
              </span>
            </h1>

            <p
              className="text-lg leading-relaxed mb-8 max-w-lg"
              style={{ color: "var(--text-muted)" }}
            >
              Headroom gives SMB owners an honest 90-day forecast with
              confidence bands, plain-language alerts, and fast access to
              credit or capital when timing gets tight.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/#trial"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90 shadow-lg"
                style={{
                  backgroundColor: "var(--olive-mid)",
                  color: "var(--cream)",
                }}
              >
                Get my free forecast
                <svg
                  className="ml-2 w-4 h-4"
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
              <Link
                href="/features"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg font-semibold text-sm transition-all border"
                style={{
                  borderColor: "var(--olive-mid)",
                  color: "var(--text-mid)",
                  backgroundColor: "transparent",
                }}
              >
                Explore the 10 layers
                <svg
                  className="ml-2 w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </Link>
            </div>

            <div className="flex items-center gap-6 mt-8">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {["CF", "AR", "FD"].map((initials) => (
                    <div
                      key={initials}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ring-2 ring-olive-cream"
                      style={{ backgroundColor: "var(--olive-mid)" }}
                    >
                      {initials}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-text-muted">
                  Built for operators who need clarity before a cash crunch
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-text-muted">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "var(--gold)" }}
                />
                Forecasting, alerts, credit rescue, and capital readiness in one system
              </div>
            </div>
          </div>

          <div className="lg:pl-8">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
