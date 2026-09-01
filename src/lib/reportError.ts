import { API_BASE } from "./apiBase";

// Best-effort client error reporting → backend /api/telemetry/error, which logs
// it structurally. Production-only (in dev we rely on the console), deduped, and
// capped per session so a render loop can't flood the sink.
const seen = new Set<string>();
let sent = 0;
const MAX_PER_SESSION = 20;

// The reference the backend assigned to the most recent report, so the crash screen and a
// support ticket can quote the same id as the server log. Cleared on a successful reload.
let lastRef: string | null = null;
export const lastErrorRef = () => lastRef;

export function reportError(message: string, stack?: string) {
  // In dev the console is the sink, but a local crash should still produce a reference so
  // the error screen looks and behaves the same way it will in production.
  if (!message) return;
  if (!import.meta.env.PROD) { lastRef = `DEV-${Math.random().toString(16).slice(2, 10).toUpperCase()}`; return; }
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
    })
      .then((r) => r.json())
      .then((r: { ref?: string }) => { if (r?.ref) lastRef = r.ref; })
      .catch(() => { /* best-effort — the crash screen just won't show a reference */ });
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
