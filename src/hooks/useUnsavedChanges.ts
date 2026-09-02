import { useCallback, useEffect, useRef } from "react";

/**
 * Stops half-typed work disappearing.
 *
 * The audit found ZERO `beforeunload` handlers in the whole frontend: a refresh, a
 * closed tab, or the phone's Back gesture silently destroyed a part-filled invoice.
 *
 * This app mounts a plain <BrowserRouter> (not a data router), so React Router's
 * `useBlocker` is unavailable. Three guards instead, which together cover the ways work
 * actually gets lost:
 *   1. `beforeunload` — refresh, tab close, external link. Browser-native prompt.
 *   2. `popstate` — the Back button / Android back gesture. We re-push the entry and ask.
 *   3. `guard(fn)` — wrap your own Cancel/Close/navigate handlers.
 */
export function useUnsavedChanges(isDirty: boolean, opts?: { message?: string; onConfirm?: () => Promise<boolean> | boolean }) {
  const message = opts?.message ?? "You have unsaved changes. Leave without saving?";
  const dirty = useRef(isDirty);
  dirty.current = isDirty;
  const onConfirm = useRef(opts?.onConfirm);
  onConfirm.current = opts?.onConfirm;

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    // Push a sacrificial entry so the FIRST Back lands here rather than leaving the form.
    // If the user confirms, we go back twice (past the sentinel and off the page).
    const sentinel = { __hrGuard: Date.now() };
    window.history.pushState(sentinel, "");
    let leaving = false; // once the user confirms, the guard must not re-fire on its own go(-1)
    const onPop = () => {
      if (!dirty.current || leaving) return;
      const leave = window.confirm(message);
      if (leave) { leaving = true; window.history.go(-1); }
      else window.history.pushState(sentinel, ""); // stay put; restore the sentinel
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Clean up the sentinel when the form stops being dirty (saved or unmounted), so
      // Back does not need an extra press afterwards.
      if (window.history.state?.__hrGuard === sentinel.__hrGuard) window.history.back();
    };
  }, [isDirty, message]);

  /** Wrap any in-app action that would discard the form. */
  const guard = useCallback(async (action: () => void) => {
    if (!dirty.current) { action(); return true; }
    const ok = onConfirm.current ? await onConfirm.current() : window.confirm(message);
    if (ok) action();
    return ok;
  }, [message]);

  return { guard, isDirty };
}

export default useUnsavedChanges;
