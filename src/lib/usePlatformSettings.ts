import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/apiBase";

// Public, super-admin-controlled platform settings (social, brand/contact, footer
// legal links, announcement banner). Fetched from the public GET /api/platform/settings
// so it works on logged-out pages. Always returns sensible shapes (never throws).

export interface PlatformSettings {
  social: Record<string, string>;
  brand: { companyName?: string; supportEmail?: string; salesEmail?: string; phone?: string; address?: string; tagline?: string };
  links: { privacyUrl?: string; termsUrl?: string; securityUrl?: string };
  banner: { enabled?: boolean; text?: string; linkUrl?: string; linkLabel?: string };
}

const EMPTY: PlatformSettings = { social: {}, brand: {}, links: {}, banner: { enabled: false } };

export function usePlatformSettings(): PlatformSettings {
  const [s, setS] = useState<PlatformSettings>(EMPTY);
  useEffect(() => {
    let on = true;
    fetch(`${API_BASE}/api/platform/settings`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (on && d) setS({ ...EMPTY, ...d }); })
      .catch(() => { /* keep defaults */ });
    return () => { on = false; };
  }, []);
  return s;
}
