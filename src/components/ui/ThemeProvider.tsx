import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { usePref } from "@/hooks/usePrefs";

/**
 * Light / dark / follow-the-system.
 *
 * The app was dark-only and hardcoded. "System" is the default because it is what the
 * device already told us the person wants; an explicit choice overrides it and is stored
 * with the user's other preferences, so it follows them to another device.
 */
export type ThemeMode = "system" | "light" | "dark";

const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void; resolved: "light" | "dark" }>({
  mode: "dark", setMode: () => {}, resolved: "dark",
});

// Applied before React paints (see main.tsx) so a light-mode user never sees a dark flash.
export function applyTheme(mode: ThemeMode) {
  const prefersLight = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches;
  const resolved = mode === "system" ? (prefersLight ? "light" : "dark") : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved as "light" | "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = usePref<ThemeMode>("theme", "dark");

  useEffect(() => {
    applyTheme(mode);
    try { localStorage.setItem("hr_theme", mode); } catch { /* private mode */ }
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const resolved = mode === "system"
    ? (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : mode;

  const value = useMemo(() => ({ mode, setMode, resolved: resolved as "light" | "dark" }), [mode, setMode, resolved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
