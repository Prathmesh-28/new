interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  tag: string;
  expanded?: boolean;
  details?: string[];
}

export default function FeatureCard({
  icon,
  title,
  description,
  tag,
  expanded = false,
  details = [],
}: FeatureCardProps) {
  const tagColors: Record<string, { bg: string; text: string }> = {
    "Core feature": { bg: "rgba(74,94,26,0.15)", text: "#4A5E1A" },
    "Growth tool": { bg: "rgba(201,162,39,0.15)", text: "#8B6A0A" },
    Automated: { bg: "rgba(150,184,61,0.15)", text: "#4A5E1A" },
    "AI-powered": { bg: "rgba(46,58,16,0.12)", text: "#2E3A10" },
    "Instant access": { bg: "rgba(201,162,39,0.15)", text: "#8B6A0A" },
    "Reg CF ready": { bg: "rgba(74,94,26,0.12)", text: "#4A5E1A" },
  };

  const tagStyle = tagColors[tag] || { bg: "rgba(74,94,26,0.15)", text: "#4A5E1A" };

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-4 transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{
        backgroundColor: "var(--white)",
        border: "1px solid var(--olive-wash)",
      }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: "var(--olive-wash)" }}
      >
        {icon}
      </div>

      {/* Tag */}
      <span
        className="self-start text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ backgroundColor: tagStyle.bg, color: tagStyle.text }}
      >
        {tag}
      </span>

      {/* Title */}
      <h3
        className="text-lg font-bold font-serif"
        style={{ color: "var(--text-dark)" }}
      >
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>

      {/* Expanded details */}
      {expanded && details.length > 0 && (
        <ul className="space-y-2 mt-2">
          {details.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <svg
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: "var(--olive-bright)" }}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
