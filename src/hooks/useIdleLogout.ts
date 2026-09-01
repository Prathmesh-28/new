import { useEffect, useRef } from "react";

/**
 * Auto sign-out after a stretch of no user interaction - standard hygiene for a
 * finance app on a shared or unattended device. The timer resets on pointer,
 * key, touch, scroll, or tab-focus activity. Default: 2 hours (industry norm for
 * non-banking apps - owners often leave Headroom open on a second monitor).
 *
 * `onWarn` fires two minutes before the sign-out (Wave 18): being logged out with
 * no warning mid-thought reads as a crash, and any activity cancels it anyway.
 */
export function useIdleLogout(onIdle: () => void, timeoutMs = 2 * 60 * 60 * 1000, onWarn?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      timer.current = setTimeout(onIdle, timeoutMs);
      if (onWarn && timeoutMs > 3 * 60 * 1000) warnTimer.current = setTimeout(onWarn, timeoutMs - 2 * 60 * 1000);
    };
    const onActivity = () => { if (document.visibilityState !== "hidden") reset(); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [onIdle, timeoutMs, onWarn]);
}
