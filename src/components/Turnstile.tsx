import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (bot protection for login/signup).
 *
 * GATED: renders nothing unless VITE_TURNSTILE_SITE_KEY is set at build time, so
 * the auth forms behave exactly as before until you create a Turnstile widget in
 * Cloudflare and add the key. The produced token is sent to the backend in the
 * `cf-turnstile-response` header and verified there (lib/turnstile.js).
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

export const turnstileEnabled = !!SITE_KEY;

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("Turnstile failed to load")); };
    document.head.appendChild(s);
  }));
}

export default function Turnstile({ onVerify, onExpire, className }: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Keep the latest callbacks in refs so the widget mounts exactly once.
  const cbVerify = useRef(onVerify); cbVerify.current = onVerify;
  const cbExpire = useRef(onExpire); cbExpire.current = onExpire;

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => cbVerify.current(token),
        "expired-callback": () => cbExpire.current?.(),
        "error-callback": () => cbExpire.current?.(),
        theme: "auto",
      });
    }).catch(() => { /* script blocked → backend still enforces; user can retry */ });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) { try { window.turnstile.remove(widgetId.current); } catch { /* ignore */ } }
      widgetId.current = null;
    };
  }, []);

  if (!SITE_KEY) return null; // not configured → render nothing
  return <div ref={ref} className={className} />;
}
