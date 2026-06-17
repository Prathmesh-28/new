import { useState } from "react";
import { HelpCircle } from "lucide-react";

// C9 — in-context help for the dense Indian-finance tools (RCM, 43B(h), DSCR…).
// Hover or tap the (?) to read a short explanation.
export default function HelpTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button" aria-label={label || "What's this?"}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl px-3 py-2 text-[11px] text-[var(--color-text)] font-normal normal-case tracking-normal leading-snug">
          {text}
        </span>
      )}
    </span>
  );
}
