import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AuthUser } from "@/data/types";
import { API_BASE } from "@/lib/apiBase";
import { secureGet, secureSet, secureRemove } from "@/lib/secureStorage";
import { setActiveFirm, getActiveFirm } from "@/lib/api";

export const BASE = API_BASE;

/* Fetch with a configurable timeout so Render cold-start doesn't silently hang */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Server is waking up - please try again in a few seconds.");
    }
    throw new Error("Cannot connect to server. If this is your first visit, the server may still be deploying - try again in 60 seconds.");
  } finally {
    clearTimeout(timer);
  }
}


interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  serverReady: boolean;
  login: (email: string, password: string, turnstileToken?: string, mfaCode?: string, rememberDevice?: boolean) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchFirm: (tenantId: string) => Promise<void>;
  createFirm: (companyName: string) => Promise<{ tenant_id: string; role: string; name: string }>;
}

const Ctx = createContext<AuthCtx | null>(null);
// Exported for PrefsProvider, which reads auth state OPPORTUNISTICALLY (it must work as
// "logged out" when no AuthProvider is mounted — tests, public shells) rather than through
// useAuth()'s deliberate must-be-inside-provider throw.
export const AuthCtxForPrefs = Ctx;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [loading, setLoading]     = useState(true);
  const [serverReady, setReady]   = useState(false);

  // Set the current user and, if the server has a saved UI-language preference, tell the
  // i18n provider to adopt it (#169). A window event keeps AuthProvider and I18nProvider
  // decoupled. Null locale = user never chose one → leave the device (localStorage) default.
  const applyUser = useCallback((u: AuthUser | null) => {
    setUser(u);
    if (u?.locale) {
      try { window.dispatchEvent(new CustomEvent("hr:setlocale", { detail: u.locale })); } catch { /* ignore */ }
    }
  }, []);

  /* Warm the server the moment AuthProvider mounts */
  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/health`)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setReady(false); });
    return () => { cancelled = true; };
  }, []);

  const fetchMe = useCallback(async (token: string): Promise<AuthUser | null> => {
    try {
      const active = getActiveFirm();
      const res = await fetchWithTimeout(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}`, ...(active ? { "X-Active-Tenant": active } : {}) },
      });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }, []);

  const tryRefresh = useCallback(async (): Promise<string | null> => {
    const rt = await secureGet("hr_refresh");
    if (!rt) return null;
    try {
      const res = await fetchWithTimeout(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: rt }),
      });
      if (!res.ok) return null;
      const { access, refresh } = await res.json();
      await secureSet("hr_access", access);
      await secureSet("hr_refresh", refresh);
      return access;
    } catch { return null; }
  }, []);

  useEffect(() => {
    (async () => {
      let token = await secureGet("hr_access");
      if (token) {
        const u = await fetchMe(token);
        if (u) { applyUser(u); setLoading(false); return; }
      }
      token = await tryRefresh();
      if (token) {
        const u = await fetchMe(token);
        if (u) { applyUser(u); }
      }
      setLoading(false);
    })();
  }, [fetchMe, tryRefresh, applyUser]);

  const login = useCallback(async (email: string, password: string, turnstileToken?: string, mfaCode?: string, rememberDevice?: boolean): Promise<AuthUser> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (turnstileToken) headers["cf-turnstile-response"] = turnstileToken;  // Cloudflare Turnstile (no-op until configured)
    const res = await fetchWithTimeout(
      `${BASE}/auth/login`,
      {
        method: "POST",
        headers,
        // A device previously remembered after a successful code sends its trust token, so
        // the OTP prompt is skipped on THIS device (the password is still checked first).
        body: JSON.stringify({
          email, password,
          ...(mfaCode ? { mfa_code: mfaCode, remember_device: !!rememberDevice } : {}),
          ...(!mfaCode && localStorage.getItem("hr_mfa_trust") ? { mfa_trust: localStorage.getItem("hr_mfa_trust") } : {}),
        }),
      },
      65_000  // 65 s - enough for Render cold start
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      const e = new Error(err.error ?? "Login failed") as Error & { mfaRequired?: boolean; verifyRequired?: boolean; verifyEmail?: string };
      if (err.mfa_required) e.mfaRequired = true;  // second factor needed → caller shows the code field
      if (err.verify_required) { e.verifyRequired = true; e.verifyEmail = err.email; }  // B2: signup email never verified
      throw e;
    }
    const { access, refresh, user: u, mfa_trust } = await res.json();
    if (mfa_trust) { try { localStorage.setItem("hr_mfa_trust", mfa_trust); } catch { /* private mode */ } }
    await secureSet("hr_access", access);
    await secureSet("hr_refresh", refresh);
    setReady(true);
    applyUser(u);
    return u as AuthUser;
  }, [applyUser]);

  // Re-fetch the current user (e.g. after a plan upgrade) so entitlements update
  // in-session without a full page reload.
  const refreshUser = useCallback(async () => {
    let token = await secureGet("hr_access");
    if (!token) return;
    let u = await fetchMe(token);
    if (!u) { token = await tryRefresh(); if (token) u = await fetchMe(token); }
    if (u) applyUser(u);
  }, [fetchMe, tryRefresh, applyUser]);

  const logout = useCallback(async () => {
    const rt = await secureGet("hr_refresh");
    if (rt) {
      fetch(`${BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: rt }),
      }).catch(() => {});
    }
    await secureRemove("hr_access");
    await secureRemove("hr_refresh");
    setActiveFirm(null);   // drop any multi-firm selection so the next login starts on home
    setUser(null);
  }, []);

  // Multi-firm switcher (#197). switchFirm authorizes the target server-side, persists
  // the selection, then hard-reloads so all tenant-scoped state re-fetches under the new
  // firm (avoids stale cross-firm data). createFirm spins up an additional owned firm.
  const switchFirm = useCallback(async (tenantId: string) => {
    const token = await secureGet("hr_access");
    const res = await fetch(`${BASE}/auth/switch-firm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: "Could not switch firm" }));
      throw new Error(e.error || "Could not switch firm");
    }
    setActiveFirm(tenantId);
    window.location.reload();
  }, []);

  const createFirm = useCallback(async (companyName: string) => {
    const token = await secureGet("hr_access");
    const res = await fetch(`${BASE}/auth/create-firm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ company_name: companyName }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: "Could not create firm" }));
      throw new Error(e.error || "Could not create firm");
    }
    const { firm } = await res.json();
    setActiveFirm(firm.tenant_id);
    window.location.reload();
    return firm as { tenant_id: string; role: string; name: string };
  }, []);

  return <Ctx.Provider value={{ user, loading, serverReady, login, logout, refreshUser, switchFirm, createFirm }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
