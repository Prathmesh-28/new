interface TestimonialCardProps {
  quote: string;
  author: string;
  role: string;
  company: string;
  initials: string;
  rating?: number;
}

export default function TestimonialCard({
  quote,
  author,
  role,
  company,
  initials,
  rating = 5,
}: TestimonialCardProps) {
  return (
    <div
      className="rounded-2xl p-7 flex flex-col gap-5"
      style={{
        backgroundColor: "var(--white)",
        border: "1px solid var(--olive-wash)",
        boxShadow: "0 2px 16px rgba(28,34,9,0.06)",
      }}
    >
      {/* Stars */}
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg
            key={i}
            className="w-4 h-4"
            style={{ color: i < rating ? "var(--gold)" : "var(--olive-wash)" }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>

      {/* Quote */}
      <blockquote
        className="text-base leading-relaxed font-serif italic"
        style={{ color: "var(--text-mid)" }}
      >
        &ldquo;{quote}&rdquo;
      </blockquote>

      {/* Author */}
      <div className="flex items-center gap-3 mt-auto">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: "var(--olive-mid)" }}
        >
          {initials}
        </div>
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-dark)" }}
          >
            {author}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {role}, {company}
          </p>
        </div>
      </div>
    </div>
  );
}
