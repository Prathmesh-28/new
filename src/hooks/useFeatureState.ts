import { useCallback, useRef } from "react";
import { useApp } from "@/context/AppContext";
import type { AppStore } from "@/data/types";

type Updater<T> = T | ((prev: T) => T);

/**
 * Drop-in replacement for React's useState that persists the value into the
 * synced `store.featureData` bag instead of local component memory.
 *
 *   const [bills, setBills] = useFeatureState<Bill[]>("aged-payables", []);
 *
 * Because `featureData` lives in the "app" KV namespace, anything stored here is
 * written to localStorage immediately and pushed to the backend (debounced),
 * then propagated to the user's other devices by the poll / live-sync stream —
 * exactly like transactions or invoices. The API mirrors useState: the setter
 * accepts a value or a functional updater, and functional updaters always read
 * the latest committed value (no stale closures).
 *
 * Use this only for durable RECORDS the user builds up over time (lists, trackers).
 * Keep transient UI state (form fields, open/closed toggles) on plain useState.
 *
 * Note: in read-only contexts (advisor client view, viewer role) the underlying
 * setStore is gated and writes are ignored with a toast — same as every other
 * store mutation.
 */
export function useFeatureState<T>(key: string, initial: T): [T, (updater: Updater<T>) => void] {
  const { store, setStore } = useApp();
  const fd = (store.featureData ?? {}) as Record<string, unknown>;
  const value = (Object.prototype.hasOwnProperty.call(fd, key) ? fd[key] : initial) as T;

  // Capture the initial once so the setter's fallback is stable across renders
  // even if the caller passes a fresh literal each time.
  const initialRef = useRef(initial);

  const setValue = useCallback((updater: Updater<T>) => {
    setStore((s: AppStore) => {
      const cur = (s.featureData ?? {}) as Record<string, unknown>;
      const prevVal = (Object.prototype.hasOwnProperty.call(cur, key) ? cur[key] : initialRef.current) as T;
      const nextVal = typeof updater === "function" ? (updater as (p: T) => T)(prevVal) : updater;
      return { ...s, featureData: { ...cur, [key]: nextVal } };
    });
  }, [key, setStore]);

  return [value, setValue];
}
