const stats = [
  { value: "90 days", label: "forward cash visibility" },
  { value: "10 layers", label: "from live data to capital access" },
  { value: "500M+", label: "SMBs in the global market" },
  { value: "$75M", label: "maximum annual Reg A+ raise path" },
];

export default function StatsStrip() {
  return (
    <section style={{ backgroundColor: "var(--olive-deepest)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p
                className="text-3xl sm:text-4xl font-bold font-serif mb-1"
                style={{ color: "var(--gold-light)" }}
              >
                {stat.value}
              </p>
              <p className="text-sm" style={{ color: "var(--olive-pale)" }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
