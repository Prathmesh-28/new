import BarChart from "./BarChart";

export default function DashboardMockup() {
  return (
    <div
      className="rounded-2xl p-5 shadow-2xl"
      style={{
        background: "linear-gradient(145deg, #2E3A10 0%, #1C2209 100%)",
        border: "1px solid #4A5E1A",
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-olive-pale font-medium uppercase tracking-wide">
            Cash Flow Dashboard
          </p>
          <p className="text-xs text-olive-mid mt-0.5">Next 90 days</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-olive-light animate-pulse" />
          <span className="text-xs text-olive-light">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: "rgba(74,94,26,0.4)" }}
        >
          <p className="text-xs text-olive-pale mb-1">Current Balance</p>
          <p
            className="text-lg font-bold font-serif"
            style={{ color: "var(--gold-light)" }}
          >
            $42.6K
          </p>
        </div>
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: "rgba(74,94,26,0.4)" }}
        >
          <p className="text-xs text-olive-pale mb-1">Runway</p>
          <p className="text-lg font-bold font-serif text-olive-light">
            68 days
          </p>
        </div>
        <div
          className="rounded-xl p-3"
          style={{
            backgroundColor: "rgba(180,60,60,0.25)",
            border: "1px solid rgba(239,68,68,0.3)",
          }}
        >
          <p className="text-xs text-olive-pale mb-1">Low Point</p>
          <p className="text-lg font-bold font-serif text-red-400">Day 41</p>
        </div>
      </div>

      <div
        className="rounded-xl p-3 mb-4"
        style={{ backgroundColor: "rgba(28,34,9,0.6)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-olive-pale">Cash flow (90 days)</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-olive-light" />
              <span className="text-xs text-olive-mid">Healthy</span>
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: "var(--gold)" }}
              />
              <span className="text-xs text-olive-mid">Caution</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-500" />
              <span className="text-xs text-olive-mid">Risk</span>
            </span>
          </div>
        </div>
        <BarChart />
      </div>

      <div
        className="rounded-xl p-3 flex items-start gap-3"
        style={{
          backgroundColor: "rgba(201,162,39,0.15)",
          border: "1px solid rgba(201,162,39,0.35)",
        }}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: "rgba(201,162,39,0.3)" }}
        >
          <svg
            className="w-3.5 h-3.5"
            style={{ color: "var(--gold)" }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <p
            className="text-xs font-semibold"
            style={{ color: "var(--gold-light)" }}
          >
            Threshold Alert
          </p>
          <p className="text-xs text-olive-pale mt-0.5">
            You fall below your safety threshold in 41 days. Follow up on
            invoices or compare capital options now.
          </p>
        </div>
      </div>
    </div>
  );
}
