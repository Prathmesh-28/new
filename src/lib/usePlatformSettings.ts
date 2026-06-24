import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/apiBase";

// Public, super-admin-controlled platform settings. Fetched from the public
// GET /api/platform/settings so it works on logged-out pages. Refreshes in REAL
// TIME: when a super-admin saves a change, the backend broadcasts a "platform"
// event over the SSE stream; AppContext re-emits it as a window CustomEvent
// ("headroom:platform"), which we listen for here and refetch immediately. Focus +
// a slow interval are belt-and-suspenders (and cover logged-out pages with no stream).
export interface PlatformSettings {
  social: Record<string, string>;
  brand: { companyName?: string; supportEmail?: string; salesEmail?: string; phone?: string; address?: string; tagline?: string };
  links: { privacyUrl?: string; termsUrl?: string; securityUrl?: string };
  banner: { enabled?: boolean; text?: string; linkUrl?: string; linkLabel?: string };
  features: Record<string, boolean>;
  maintenance: { enabled?: boolean; message?: string };
  localization: Record<string, string>;
  support: Record<string, string>;
  seo: Record<string, string>;
  payments: Record<string, string>;
  pricing: Record<string, string | number>;
  signup: Record<string, string | boolean>;
}

const EMPTY: PlatformSettings = {
  social: {}, brand: {}, links: {}, banner: { enabled: false },
  features: {}, maintenance: { enabled: false }, localization: {},
  support: {}, seo: {}, payments: {}, pricing: {}, signup: {},
};

const SLOW_REFRESH_MS = 120_000;

export function usePlatformSettings(): PlatformSettings {
  const [s, setS] = useState<PlatformSettings>(EMPTY);
  useEffect(() => {
    let on = true;
    const load = () =>
      fetch(`${API_BASE}/api/platform/settings`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (on && d) setS({ ...EMPTY, ...d }); })
        .catch(() => { /* keep last good values */ });
    load();
    // Real-time: refetch the instant a super-admin save is broadcast over the stream.
    const onPlatform = () => load();
    window.addEventListener("headroom:platform", onPlatform);
    window.addEventListener("focus", onPlatform);
    const iv = setInterval(load, SLOW_REFRESH_MS);
    return () => {
      on = false;
      window.removeEventListener("headroom:platform", onPlatform);
      window.removeEventListener("focus", onPlatform);
      clearInterval(iv);
    };
  }, []);
  return s;
}
