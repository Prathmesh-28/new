import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TabDef = { id: string; label: string; icon?: LucideIcon; badge?: number | null };

const Badge = ({ n }: { n: number }) => (
  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">{n}</span>
);

// `window.localStorage` explicitly (not the bare global) — Node 22+'s own experimental
// localStorage global can otherwise shadow the real one in some runtimes/test environments.
const readPins = (k: string): string[] => { try { return JSON.parse(window.localStorage.getItem(k) || "[]"); } catch { return []; } };
const writePins = (k: string, v: string[]) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/* Tab bar for mega-pages: shows the first `primaryCount` tabs inline and folds the rest
   into a "More tools" dropdown, so a 40-tab page reads as ~6 tabs + a menu instead of a
   wall of pills. If the active tab lives in the overflow, the trigger shows that tab's
   label (still visibly selected) rather than the generic "More tools".

   C1/C2 (2026-07 gap audit): once a page has enough tabs to need the overflow menu at
   all, finding one by scrolling a flat list doesn't scale (GST has ~46 in overflow alone).
   Past a threshold the dropdown gains a search box, and any tab can be pinned (persisted
   per-page via `storageKey`) so it always sits at the top regardless of the current filter. */
const SEARCH_THRESHOLD = 8;

export default function TabStrip({
  tabs, active, onChange, primaryCount = 6, moreLabel = "More tools", storageKey,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  primaryCount?: number;
  moreLabel?: string;
  // Enables pinning when set — must be unique per page (e.g. "gst-tabs") so pins from one
  // mega-page don't bleed into another's dropdown.
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<string[]>(() => (storageKey ? readPins(`tabpins:${storageKey}`) : []));
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => { if (open) { setQuery(""); searchRef.current?.focus(); } }, [open]);

  const primary = tabs.slice(0, primaryCount);
  const overflow = tabs.slice(primaryCount);
  const activeInOverflow = overflow.find(t => t.id === active);
  const TriggerIcon = activeInOverflow?.icon;
  const overflowBadge = overflow.reduce((sum, t) => sum + (t.badge ?? 0), 0);
  const showSearch = overflow.length > SEARCH_THRESHOLD;

  const togglePin = (id: string) => {
    if (!storageKey) return;
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      writePins(`tabpins:${storageKey}`, next);
      return next;
    });
  };

  // Pinned tabs float to the top (still respecting the current search filter), then the
  // rest in their original order.
  const visibleOverflow = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? overflow.filter((t) => t.label.toLowerCase().includes(q)) : overflow;
    if (!storageKey || pins.length === 0) return filtered;
    const pinned = filtered.filter((t) => pins.includes(t.id));
    const rest = filtered.filter((t) => !pins.includes(t.id));
    return [...pinned, ...rest];
  }, [overflow, query, pins, storageKey]);

  const pill = (t: TabDef, isActive: boolean) => (
    <button key={t.id} onClick={() => { onChange(t.id); setOpen(false); }}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${isActive ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
      {t.icon && <t.icon size={11} />}{t.label}{t.badge != null && <Badge n={t.badge} />}
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
            {!activeInOverflow && overflowBadge > 0 && <Badge n={overflowBadge} />}
            <ChevronDown size={12} />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 z-50 mt-1 w-64 max-h-80 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl py-1">
              {showSearch && (
                <div className="sticky top-0 bg-[var(--color-surface)] px-2 pt-1 pb-1.5 border-b border-[var(--color-border)]">
                  <div className="relative">
                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                    <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Search tools…"
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 pl-6 text-xs outline-none focus:border-[var(--color-primary)]" />
                  </div>
                </div>
              )}
              {visibleOverflow.length === 0 && <p className="px-3 py-3 text-xs text-[var(--color-muted)]">No tools match.</p>}
              {visibleOverflow.map(t => {
                const isPinned = pins.includes(t.id);
                return (
                  <div key={t.id}
                    className={`w-full flex items-center gap-1 px-1.5 py-0.5 hover:bg-[var(--color-accent)] group ${active === t.id ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
                    <button role="menuitem" onClick={() => { onChange(t.id); setOpen(false); }} className="flex-1 text-left px-1.5 py-1.5 text-xs flex items-center gap-2 min-w-0">
                      {t.icon && <t.icon size={13} className="text-[var(--color-muted)] shrink-0" />}
                      <span className={`flex-1 truncate ${active === t.id ? "font-semibold" : ""}`}>{t.label}</span>
                      {t.badge != null && <Badge n={t.badge} />}
                    </button>
                    {storageKey && (
                      <button onClick={(e) => { e.stopPropagation(); togglePin(t.id); }} title={isPinned ? "Unpin" : "Pin to top"}
                        className={`shrink-0 p-1 ${isPinned ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]/40 opacity-0 group-hover:opacity-100 hover:text-[var(--color-muted)]"}`}>
                        <Star size={12} fill={isPinned ? "currentColor" : "none"} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
