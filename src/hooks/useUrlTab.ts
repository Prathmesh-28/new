import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// C14/C1 (2026-07 gap audit): mega-pages (GST ~52 tabs, Tax ~57, Payroll ~45) kept their
// active tab in plain useState, so there was no way to deep-link to a specific tool, share
// a URL to one, or reload the page and land back where you were. Drop-in replacement for
// `useState<T>(default)` — same [value, setValue] shape, so call sites don't otherwise
// change — but backed by a `?tab=` URL param.
//
// Tab switches use `replace: true` deliberately: at 50+ tabs, pushing a new history entry
// per click would mean the back button has to be pressed 50 times to leave the page. The
// URL still updates (deep-link/share/refresh all work); browser back leaves the page
// directly, which is the behaviour users actually expect from a tab bar.
//
// `validValues`, when given, guards against a stale/hand-edited/old-bookmarked URL naming
// a tab that no longer exists — falls back to the default instead of silently rendering
// nothing (every mega-page's body is a chain of `tab === "x" ? ... : null`, so an unknown
// value would otherwise show a blank page with no error).
export function useUrlTab<T extends string>(
  defaultTab: T,
  opts: { param?: string; validValues?: readonly T[] } = {}
): [T, (t: T) => void] {
  const { param = "tab", validValues } = opts;
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const tab: T = raw && (!validValues || (validValues as readonly string[]).includes(raw)) ? (raw as T) : defaultTab;

  const setTab = useCallback((t: T) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t === defaultTab) next.delete(param); // keep the URL clean on the default tab
      else next.set(param, t);
      return next;
    }, { replace: true });
  }, [setParams, param, defaultTab]);

  return [tab, setTab];
}
