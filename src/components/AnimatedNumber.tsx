// Count-up number. Parses a display string into (prefix, number, suffix) so it can wrap
// ANY existing stat verbatim — "₹340Cr+", "12,000+", "91%", "4.8 days", "Day 41" — and
// animate just the numeric part from 0 to target when it scrolls into view. Preserves
// decimals and Indian-grouped thousands. Reduced-motion → shows the final value instantly.
import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber({
  value,
  duration = 1600,
  className,
  start,
}: {
  value: string;
  duration?: number;
  className?: string;
  start?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const m = value.match(/^(\D*)([\d.,]+)(.*)$/s);
  const grouped = !!m && m[2].includes(",");
  const decimals = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const target = m ? parseFloat(m[2].replace(/,/g, "")) : 0;

  const [go, setGo] = useState(false);
  const [val, setVal] = useState(0);

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
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [start]);

  useEffect(() => {
    if (!go || !m) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVal(target);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else setVal(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, target, duration]);

  if (!m) return <span ref={ref} className={className}>{value}</span>;
  const shown = grouped ? Math.round(val).toLocaleString("en-IN") : val.toFixed(decimals);
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {m[1]}
      {shown}
      {m[3]}
    </span>
  );
}
