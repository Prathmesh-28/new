import { API_BASE } from "./apiBase";

// Best-effort client error reporting → backend /api/telemetry/error, which logs
// it structurally. Production-only (in dev we rely on the console), deduped, and
// capped per session so a render loop can't flood the sink.
const seen = new Set<string>();
let sent = 0;
const MAX_PER_SESSION = 20;

export function reportError(message: string, stack?: string) {
  if (!import.meta.env.PROD) return;
  if (!message) return;
  const key = (message + (stack ?? "")).slice(0, 200);
  if (seen.has(key) || sent >= MAX_PER_SESSION) return;
  seen.add(key);
  sent++;
  try {
    fetch(`${API_BASE}/api/telemetry/error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message,
        stack,
        url: location.href,
        release: import.meta.env.VITE_RELEASE ?? "",
      }),
    }).catch(() => { /* best-effort */ });
  } catch { /* ignore */ }
}

// Catch errors that never reach a React error boundary (async, event handlers,
// promise rejections).
export function installGlobalErrorReporting() {
  window.addEventListener("error", (e) => reportError(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    reportError(r?.message ?? String(r), r?.stack);
  });
}
