import { api } from "./api";

/**
 * Fire-and-forget product-analytics client. track() never throws and never blocks
 * the UI; the backend (/api/analytics/track) gates on the user's DPDP "analytics"
 * consent, so opted-out users are silently not recorded.
 */
function sessionId(): string {
  try {
    let s = sessionStorage.getItem("hr_sid");
    if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("hr_sid", s); }
    return s;
  } catch { return "nosession"; }
}

export function track(event: string, props?: Record<string, unknown>): void {
  try {
    void api.post("/api/analytics/track", {
      event,
      props: props ?? {},
      session_id: sessionId(),
      path: typeof location !== "undefined" ? location.pathname : undefined,
    }).catch(() => { /* analytics must never break the app */ });
  } catch { /* ignore */ }
}
