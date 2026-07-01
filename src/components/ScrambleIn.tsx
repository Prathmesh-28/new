// Left-to-right character "scramble / typewriter" reveal.
// - Unrevealed characters within 3 of the cursor show random glyphs; beyond that, blank.
// - Spaces are preserved; the animation always ends on the exact `text`.
// - Respects prefers-reduced-motion (renders the final text immediately, no motion).
// Rendered inside an aria-hidden span, so put the real string in the parent's aria-label.
import { useEffect, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><";

export function useScrambleIn(text: string, start: boolean, delay = 0): string {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!start) {
      setOut("");
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setOut(text);
      return;
    }
    let revealed = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      revealed += 0.5;
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === " ") s += " ";
        else if (i < revealed) s += ch;
        else if (i < revealed + 3) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (revealed < text.length) timer = setTimeout(tick, 25);
      else setOut(text);
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [text, start, delay]);
  return out;
}

export default function ScrambleIn({
  text,
  start,
  delay = 0,
  className,
}: {
  text: string;
  start: boolean;
  delay?: number;
  className?: string;
}) {
  const out = useScrambleIn(text, start, delay);
  return (
    <span aria-hidden="true" className={className}>
      {out || " "}
    </span>
  );
}
