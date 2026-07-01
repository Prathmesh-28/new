import { useState, useRef, useEffect } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type TabDef = { id: string; label: string; icon?: LucideIcon };

/* Tab bar for mega-pages: shows the first `primaryCount` tabs inline and folds the rest
   into a "More tools" dropdown, so a 40-tab page reads as ~6 tabs + a menu instead of a
   wall of pills. If the active tab lives in the overflow, the trigger shows that tab's
   label (still visibly selected) rather than the generic "More tools". */
export default function TabStrip({
  tabs, active, onChange, primaryCount = 6, moreLabel = "More tools",
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  primaryCount?: number;
  moreLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const primary = tabs.slice(0, primaryCount);
  const overflow = tabs.slice(primaryCount);
  const activeInOverflow = overflow.find(t => t.id === active);
  const TriggerIcon = activeInOverflow?.icon;

  const pill = (t: TabDef, isActive: boolean) => (
    <button key={t.id} onClick={() => { onChange(t.id); setOpen(false); }}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${isActive ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
      {t.icon && <t.icon size={11} />}{t.label}
    </button>
  );

  return (
    <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
      {primary.map(t => pill(t, active === t.id))}
      {overflow.length > 0 && (
        <div ref={ref} className="relative">
          <button onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu"
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium transition-colors ${activeInOverflow ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {TriggerIcon && <TriggerIcon size={11} />}
            {activeInOverflow ? activeInOverflow.label : moreLabel}
            <ChevronDown size={12} />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 z-50 mt-1 w-56 max-h-80 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl py-1">
              {overflow.map(t => (
                <button key={t.id} role="menuitem" onClick={() => { onChange(t.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--color-accent)] ${active === t.id ? "text-[var(--color-primary)] font-semibold" : "text-[var(--color-text)]"}`}>
                  {t.icon && <t.icon size={13} className="text-[var(--color-muted)]" />}{t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
