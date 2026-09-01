import { useEffect } from "react";

/**
 * Pull-to-refresh (Wave 19). On a phone, dragging down from the top of a page is the
 * universal "give me fresh numbers" gesture — and the app ignored it, so people
 * force-closed it instead. Touch-only, fires when the pull starts at the very top and
 * travels far enough with intent (mostly-vertical), shows a tiny affordance, then does a
 * clean reload — which every page already handles by refetching.
 */
export function usePullToRefresh(target?: HTMLElement | null) {
  useEffect(() => {
    const el = target ?? document.querySelector("main");
    if (!el || !("ontouchstart" in window)) return;

    let startY = 0, startX = 0, armed = false, indicator: HTMLDivElement | null = null;
    const THRESHOLD = 140;

    const onStart = (e: TouchEvent) => {
      armed = el.scrollTop <= 0;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy < 30 || dx > 60) return; // needs downward intent, not a sideways swipe
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.setAttribute("aria-hidden", "true");
        indicator.style.cssText =
          "position:fixed;top:calc(env(safe-area-inset-top) + 8px);left:50%;transform:translateX(-50%);z-index:9999;" +
          "background:var(--color-surface);border:1px solid var(--color-border);color:var(--color-muted);" +
          "border-radius:9999px;padding:4px 12px;font-size:11px;pointer-events:none;";
        indicator.textContent = "↓ pull to refresh";
        document.body.appendChild(indicator);
      }
      indicator.textContent = dy > THRESHOLD ? "↻ release to refresh" : "↓ pull to refresh";
      indicator.style.opacity = String(Math.min(1, dy / THRESHOLD));
    };
    const onEnd = (e: TouchEvent) => {
      const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
      const doIt = armed && dy > THRESHOLD && el.scrollTop <= 0;
      indicator?.remove(); indicator = null;
      armed = false;
      if (doIt) window.location.reload();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      indicator?.remove();
    };
  }, [target]);
}
