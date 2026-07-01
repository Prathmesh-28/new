// Odometer: each digit in a string rolls up to its final value when it scrolls into view.
// Non-digit characters (₹, commas, %, +, letters, spaces) pass through unchanged, so it can
// wrap any stat string. Inherits font + colour from its parent. Reduced-motion → no roll.
// With `depth3d`, the whole number also flips up in 3D (perspective rotateX) as it reveals.
import { useEffect, useRef, useState } from "react";

export default function Odometer({
  value,
  className,
  start,
  depth3d = false,
}: {
  value: string;
  className?: string;
  start?: boolean;
  depth3d?: boolean;
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
  const digits = value.split("").map((ch, i) => {
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
  });

  if (!depth3d) {
    return (
      <span
        ref={ref}
        className={className}
        aria-label={value}
        style={{ display: "inline-flex", alignItems: "flex-end" }}
      >
        {digits}
      </span>
    );
  }

  // 3D flip-in: the number rotates up from edge-on to face the viewer while the
  // digits roll. Reduced-motion renders it flat and static.
  const revealed = go || reduce;
  return (
    <span
      ref={ref}
      className={className}
      aria-label={value}
      style={{ display: "inline-block", perspective: "620px" }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "flex-end",
          transformStyle: "preserve-3d",
          transformOrigin: "center bottom",
          transform: revealed ? "rotateX(0deg)" : "rotateX(-85deg)",
          opacity: revealed ? 1 : 0.15,
          transition: reduce ? "none" : "transform 0.7s cubic-bezier(0.22,1,0.36,1), opacity 0.7s ease",
        }}
      >
        {digits}
      </span>
    </span>
  );
}
