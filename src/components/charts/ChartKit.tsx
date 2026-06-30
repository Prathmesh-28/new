import { useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Reusable interactive-chart primitives, themed with the app's CSS variables.
// Used to make every chart explorable: switch time range, toggle series on/off
// by clicking the legend, and flip chart type. Drop-in, no external deps.
// ─────────────────────────────────────────────────────────────────────────────

export interface SegOption<T extends string> { value: T; label: string }

/** Compact pill segmented control - for range (3M/6M/12M), chart type, etc. */
export function SegmentedToggle<T extends string>({
  options, value, onChange, ariaLabel,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
            value === o.value
              ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
              : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface SeriesDef { key: string; label: string; color: string }

/** Clickable legend - tap a series to hide/show it in the chart. */
export function SeriesLegend({
  series, hidden, onToggle,
}: {
  series: SeriesDef[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
      {series.map(s => {
        const off = hidden.has(s.key);
        return (
          <button
            key={s.key}
            onClick={() => onToggle(s.key)}
            className={`flex items-center gap-1.5 text-[11px] font-medium transition-opacity ${off ? "opacity-35" : "opacity-100"} hover:opacity-100`}
            title={off ? `Show ${s.label}` : `Hide ${s.label}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-[3px] inline-block shrink-0 transition-all"
              style={{ background: off ? "transparent" : s.color, border: `1.5px solid ${s.color}` }}
            />
            <span className={off ? "line-through" : ""}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Hook that tracks which series keys are hidden, with a toggle callback. */
export function useSeriesToggle(initialHidden: string[] = []) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden));
  const toggle = useCallback((key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);
  const isHidden = useCallback((key: string) => hidden.has(key), [hidden]);
  return { hidden, toggle, isHidden };
}
