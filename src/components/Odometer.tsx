// Odometer: each digit in a string rolls up to its final value when it scrolls into view.
// Non-digit characters (₹, commas, %, +, letters, spaces) pass through unchanged, so it can
// wrap any stat string. Inherits font + colour from its parent. Reduced-motion → no roll.
import { useEffect, useRef, useState } from "react";

export default function Odometer({
  value,
  className,
  start,
}: {
  value: string;
  className?: string;
  start?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [go, setGo] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  useEffect(() => {
    if (start !== undefined) {
      setGo(start);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setGo(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [start]);

  let digitPos = 0;
  return (
    <span
      ref={ref}
      className={className}
      aria-label={value}
      style={{ display: "inline-flex", alignItems: "flex-end" }}
    >
      {value.split("").map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          );
        }
        const delay = digitPos++ * 60;
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              display: "inline-block",
              height: "1em",
              lineHeight: 1,
              overflow: "hidden",
              verticalAlign: "bottom",
            }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                transform: go ? `translateY(-${Number(ch)}0%)` : "translateY(0)",
                transition: reduce ? "none" : "transform 1.2s cubic-bezier(0.22,1,0.36,1)",
                transitionDelay: `${delay}ms`,
              }}
            >
              {"0123456789".split("").map((d) => (
                <span key={d} style={{ height: "1em", lineHeight: 1 }}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
