import { useEffect, useRef } from "react";

/**
 * Auto sign-out after a stretch of no user interaction — standard hygiene for a
 * finance app on a shared or unattended device. The timer resets on pointer,
 * key, touch, scroll, or tab-focus activity. Default: 2 hours (industry norm for
 * non-banking apps — owners often leave Headroom open on a second monitor).
 */
export function useIdleLogout(onIdle: () => void, timeoutMs = 2 * 60 * 60 * 1000) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(onIdle, timeoutMs);
    };
    const onActivity = () => { if (document.visibilityState !== "hidden") reset(); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [onIdle, timeoutMs]);
}
