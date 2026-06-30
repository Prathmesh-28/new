/* Headroom logo - a rising line that lifts to a green dot ("headroom" above the line).
   The navy strokes use currentColor so the mark adapts to any surface (dark app,
   olive landing, light auth pages); the dot stays brand green. */

const GREEN = "#5FBE7C";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * (100 / 128)} viewBox="0 0 128 100" fill="none" className={className} aria-hidden="true">
      {/* baseline */}
      <path d="M14 74 H112" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      {/* rising stroke */}
      <path d="M68 74 L99 34" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      {/* the lift - green dot */}
      <circle cx="112" cy="24" r="11" fill={GREEN} />
    </svg>
  );
}

/* Full lockup: mark + "headroom" wordmark. `variant` controls layout.
   Navy text/strokes inherit `color`; pass a text color class to recolor. */
export default function Logo({
  variant = "horizontal",
  size = 26,
  className = "",
  showWord = true,
}: {
  variant?: "horizontal" | "stacked" | "mark";
  size?: number;
  className?: string;
  showWord?: boolean;
}) {
  if (variant === "mark") return <LogoMark size={size} className={className} />;

  const wordSize = Math.round(size * 1.15);
  const word = (
    <span
      style={{
        fontFamily: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Poppins', system-ui, sans-serif",
        fontWeight: 700,
        fontSize: wordSize,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        color: "currentColor",
      }}
    >
      headroom
    </span>
  );

  if (variant === "stacked") {
    return (
      <span className={`inline-flex flex-col items-center gap-2 ${className}`}>
        <LogoMark size={size * 1.6} />
        {showWord && word}
      </span>
    );
  }
  // horizontal
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {showWord && word}
    </span>
  );
}
