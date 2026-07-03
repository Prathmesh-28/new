// In-house i18n (#169) — no external dependency, aligned with Headroom's "own engine"
// posture. Key→string lookup with {placeholder} interpolation and English fallback. The
// English base is bundled (always available, no first-paint flash); other locales load on
// demand so the base bundle stays lean as translation coverage grows. Locale persists in
// localStorage. Adding a language = drop a locale file, register a loader, add to LOCALES.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./locales/en";
import { secureGet } from "@/lib/secureStorage";
import { API_BASE } from "@/lib/apiBase";

export const LOCALES: { code: string; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
];

// Non-English dictionaries load lazily. Register a locale here after adding its file.
const LOADERS: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  hi: () => import("./locales/hi"),
  mr: () => import("./locales/mr"),
  bn: () => import("./locales/bn"),
  ta: () => import("./locales/ta"),
  te: () => import("./locales/te"),
  gu: () => import("./locales/gu"),
  kn: () => import("./locales/kn"),
  ml: () => import("./locales/ml"),
  pa: () => import("./locales/pa"),
};

const STORAGE_KEY = "hr_locale";
function initialLocale(): string {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s && LOCALES.some((l) => l.code === s)) return s;
  } catch { /* ignore */ }
  return "en";
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

type Ctx = {
  locale: string;
  setLocale: (code: string) => void;
  locales: typeof LOCALES;
  t: (key: string, vars?: Record<string, string | number>) => string;
};
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(initialLocale);
  const [dict, setDict] = useState<Record<string, string>>(en);

  useEffect(() => {
    let alive = true;
    if (locale === "en" || !LOADERS[locale]) { setDict(en); return; }
    LOADERS[locale]()
      .then((m) => { if (alive) setDict(m.default || en); })
      .catch(() => { if (alive) setDict(en); });
    return () => { alive = false; };
  }, [locale]);

  useEffect(() => { try { document.documentElement.lang = locale; } catch { /* ignore */ } }, [locale]);

  // Adopt a locale the server reports for the logged-in user. Once authenticated the
  // server profile is the source of truth (so the language follows the user across
  // devices); localStorage still gives instant, no-flash startup. AuthContext dispatches
  // this event after hydrating/logging in a user — a window event keeps the two providers
  // decoupled (neither imports the other). We update localStorage + state but skip the
  // server round-trip (the value already came from the server).
  useEffect(() => {
    const onServerLocale = (e: Event) => {
      const code = (e as CustomEvent).detail;
      if (typeof code === "string" && LOCALES.some((l) => l.code === code)) {
        try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
        setLocaleState(code);
      }
    };
    window.addEventListener("hr:setlocale", onServerLocale as EventListener);
    return () => window.removeEventListener("hr:setlocale", onServerLocale as EventListener);
  }, []);

  const setLocale = useCallback((code: string) => {
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    setLocaleState(code);
    // Best-effort server sync so the choice follows the user across devices/logins (#169).
    // No-ops when signed out (no token); failures are non-fatal (localStorage still holds it).
    secureGet("hr_access").then((tok) => {
      if (!tok) return;
      fetch(`${API_BASE}/auth/locale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ locale: code }),
      }).catch(() => { /* offline / transient — localStorage is the fallback */ });
    }).catch(() => { /* ignore */ });
  }, []);

  // active locale → English base → the key itself (a missing key surfaces English, never "[key]")
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => interpolate(dict[key] ?? en[key] ?? key, vars),
    [dict]
  );

  return <I18nCtx.Provider value={{ locale, setLocale, locales: LOCALES, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

// Convenience hook when a component only needs the translator.
export function useT() { return useI18n().t; }
