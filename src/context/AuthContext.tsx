import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AuthUser } from "@/data/types";

export const BASE = import.meta.env.VITE_API_URL ?? "";

/* Fetch with a configurable timeout so Render cold-start doesn't silently hang */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Server is waking up — please try again in a few seconds.");
    }
    throw new Error("Cannot connect to server. If this is your first visit, the server may still be deploying — try again in 60 seconds.");
  } finally {
    clearTimeout(timer);
  }
}

/* Fire-and-forget ping so the server is warm before the user clicks Sign in */
export function warmupServer() {
  fetch(`${BASE}/health`, { method: "GET" }).catch(() => {});
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  serverReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
    const rt = localStorage.getItem("hr_refresh");
    if (!rt) return null;
    try {
      const res = await fetchWithTimeout(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: rt }),
      });
      if (!res.ok) return null;
      const { access, refresh } = await res.json();
      localStorage.setItem("hr_access", access);
      localStorage.setItem("hr_refresh", refresh);
      return access;
    } catch { return null; }
  }, []);

  useEffect(() => {
    (async () => {
      let token = localStorage.getItem("hr_access");
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetchWithTimeout(
      `${BASE}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      65_000  // 65 s — enough for Render cold start
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error ?? "Login failed");
    }
    const { access, refresh, user: u } = await res.json();
    localStorage.setItem("hr_access", access);
    localStorage.setItem("hr_refresh", refresh);
    setReady(true);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    const rt = localStorage.getItem("hr_refresh");
    if (rt) {
      fetch(`${BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: rt }),
      }).catch(() => {});
    }
    localStorage.removeItem("hr_access");
    localStorage.removeItem("hr_refresh");
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, serverReady, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
