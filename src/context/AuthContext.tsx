import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AuthUser } from "@/data/types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (token: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${BASE}/auth/me`, {
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
      const res = await fetch(`${BASE}/auth/refresh`, {
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
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error ?? "Login failed");
    }
    const { access, refresh, user: u } = await res.json();
    localStorage.setItem("hr_access", access);
    localStorage.setItem("hr_refresh", refresh);
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

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
