import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

/**
 * Per-user preferences that follow the person, not the browser.
 *
 * Everything a user tuned about the UI was either not persisted at all (column choices,
 * row density — because neither existed) or kept in localStorage, so it did not survive
 * a new device. These live server-side in `user_prefs` and are scoped per firm, so a
 * multi-firm user (#197) can keep a different layout per firm.
 *
 * Writes are optimistic and debounced: toggling four columns in a row is one request.
 * localStorage is kept as a warm cache so the first paint after a reload already has the
 * user's layout instead of flashing the default.
 */
type PrefMap = Record<string, unknown>;

const CACHE_KEY = "hr_prefs_cache";
const readCache = (): PrefMap => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } };
const writeCache = (m: PrefMap) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(m)); } catch { /* quota / private mode */ } };

const Ctx = createContext<{
  prefs: PrefMap;
  ready: boolean;
  setPref: (key: string, value: unknown) => void;
}>({ prefs: {}, ready: false, setPref: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<PrefMap>(readCache);
  const [ready, setReady] = useState(false);
  const pending = useRef<Map<string, unknown>>(new Map());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    // No session → nothing to load and nothing to write. This provider sits above the
    // PUBLIC routes too (homepage, customer/vendor portals), so it must never trigger an
    // auth round-trip for a visitor who was never signed in.
    if (!localStorage.getItem("hr_access")) { setReady(true); return () => { alive = false; }; }
    api.get<PrefMap>("/api/prefs")
      .then((server) => {
        if (!alive) return;
        // Anything queued locally while the fetch was in flight must win over the server
        // snapshot, or a fast first click gets silently reverted.
        setPrefs((local) => {
          const merged = { ...server, ...Object.fromEntries(pending.current) };
          writeCache(merged);
          return Object.keys(local).length && !Object.keys(server).length ? { ...local, ...merged } : merged;
        });
      })
      .catch(() => { /* offline or logged out — the cache is a fine fallback */ })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const flush = useCallback(() => {
    const batch = Array.from(pending.current.entries());
    pending.current.clear();
    for (const [key, value] of batch) {
      api.put(`/api/prefs/${encodeURIComponent(key)}`, { value }).catch(() => { /* cached locally regardless */ });
    }
  }, []);

  const setPref = useCallback((key: string, value: unknown) => {
    setPrefs((prev) => { const next = { ...prev, [key]: value }; writeCache(next); return next; });
    pending.current.set(key, value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  }, [flush]);

  // Don't lose the last toggle if the tab closes inside the debounce window.
  useEffect(() => {
    const onHide = () => { if (pending.current.size) flush(); };
    window.addEventListener("pagehide", onHide);
    return () => { window.removeEventListener("pagehide", onHide); onHide(); };
  }, [flush]);

  const value = useMemo(() => ({ prefs, ready, setPref }), [prefs, ready, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** One preference, with a default — the useState of preferences. */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const { prefs, setPref } = useContext(Ctx);
  const current = (prefs[key] as T | undefined) ?? fallback;
  const set = useCallback((v: T) => setPref(key, v), [key, setPref]);
  return [current, set];
}

export const usePrefs = () => useContext(Ctx);
