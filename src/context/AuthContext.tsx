import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AuthUser } from "@/data/types";
import { API_BASE } from "@/lib/apiBase";
import { secureGet, secureSet, secureRemove } from "@/lib/secureStorage";

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
  login: (email: string, password: string, turnstileToken?: string, mfaCode?: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [loading, setLoading]     = useState(true);
  const [serverReady, setReady]   = useState(false);

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
      const res = await fetchWithTimeout(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
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
        if (u) { setUser(u); setLoading(false); return; }
      }
      token = await tryRefresh();
      if (token) {
        const u = await fetchMe(token);
        if (u) { setUser(u); }
      }
      setLoading(false);
    })();
  }, [fetchMe, tryRefresh]);

  const login = useCallback(async (email: string, password: string, turnstileToken?: string, mfaCode?: string): Promise<AuthUser> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (turnstileToken) headers["cf-turnstile-response"] = turnstileToken;  // Cloudflare Turnstile (no-op until configured)
    const res = await fetchWithTimeout(
      `${BASE}/auth/login`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password, ...(mfaCode ? { mfa_code: mfaCode } : {}) }),
      },
      65_000  // 65 s - enough for Render cold start
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      const e = new Error(err.error ?? "Login failed") as Error & { mfaRequired?: boolean };
      if (err.mfa_required) e.mfaRequired = true;  // second factor needed → caller shows the code field
      throw e;
    }
    const { access, refresh, user: u } = await res.json();
    await secureSet("hr_access", access);
    await secureSet("hr_refresh", refresh);
    setReady(true);
    setUser(u);
    return u as AuthUser;
  }, []);

  // Re-fetch the current user (e.g. after a plan upgrade) so entitlements update
  // in-session without a full page reload.
  const refreshUser = useCallback(async () => {
    let token = await secureGet("hr_access");
    if (!token) return;
    let u = await fetchMe(token);
    if (!u) { token = await tryRefresh(); if (token) u = await fetchMe(token); }
    if (u) setUser(u);
  }, [fetchMe, tryRefresh]);

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
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, serverReady, login, logout, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
