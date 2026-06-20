import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { HelpCircle, X, Lightbulb, ListChecks, Info } from "lucide-react";
import { FEATURE_GUIDES } from "@/data/featureGuides";

// "How to use this" — a compact dropdown in the page header. Reads the current
// route, looks up its guide, and explains what the feature is for, how to use it,
// and how to get maximum value. Renders nothing on pages without a guide.
export default function FeatureGuide() {
  const { pathname } = useLocation();
  const tab = pathname.split("/")[1] || "dashboard";
  const guide = FEATURE_GUIDES[tab];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!guide) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="How to use this"
        className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 rounded-lg px-2.5 py-1.5 transition-colors"
      >
        <HelpCircle size={13} />
        <span className="hidden sm:inline">How to use</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(92vw,22rem)] z-[120] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">How to use this</span>
            <button onClick={() => setOpen(false)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={14} /></button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
            {/* What it's for */}
            <div className="flex gap-2.5">
              <Info size={14} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-[var(--color-text)]">{guide.what}</p>
            </div>

            {/* How to use */}
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">
                <ListChecks size={12} /> Steps
              </p>
              <ol className="space-y-1.5">
                {guide.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-xs leading-relaxed">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-[9px] font-bold flex items-center justify-center mt-px">{i + 1}</span>
                    <span className="text-[var(--color-text)]">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Power tips */}
            {guide.tips.length > 0 && (
              <div className="rounded-lg bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/20 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)] mb-1.5">
                  <Lightbulb size={12} /> Get the most out of it
                </p>
                <ul className="space-y-1">
                  {guide.tips.map((t, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-[var(--color-text)]">
                      <span className="text-[var(--color-primary)] shrink-0">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
