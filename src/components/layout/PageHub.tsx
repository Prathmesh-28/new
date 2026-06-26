import { Suspense, type ReactNode, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

/**
 * PageHub — a thin tabbed shell that unifies several existing full pages under ONE
 * route, so duplicate landing pages collapse into tabs without rewriting the feature
 * pages. Each tab renders an existing page component verbatim. The active tab is
 * synced to the URL (?t=key) so deep-links and the back button work, and old routes
 * can redirect in (e.g. /flows → /agents?t=flows).
 *
 * It renders ONLY the active tab's element (so a heavy inner page mounts/loads its
 * data only when selected), matching how the standalone routes behaved.
 */
export interface HubTab {
  key: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  element: ReactNode;
}

export default function PageHub({ tabs, paramKey = "t" }: { tabs: HubTab[]; paramKey?: string }) {
  const [sp, setSp] = useSearchParams();
  const active = tabs.find((t) => t.key === sp.get(paramKey)) ?? tabs[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => {
          const on = active.key === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSp((prev) => { const n = new URLSearchParams(prev); n.set(paramKey, t.key); return n; }, { replace: true })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${on ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}
            >
              {t.icon && <t.icon size={14} />} {t.label}
            </button>
          );
        })}
      </div>
      <Suspense fallback={<div className="flex items-center gap-2 py-10 text-sm text-[var(--color-muted)]"><Loader2 size={15} className="animate-spin" /> Loading…</div>}>
        {active.element}
      </Suspense>
    </div>
  );
}
