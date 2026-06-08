const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function getToken() {
  return localStorage.getItem("hr_access");
}

export async function authFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) return authFetch(path, init);
    localStorage.removeItem("hr_access");
    localStorage.removeItem("hr_refresh");
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${err}`);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem("hr_refresh");
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const { accessToken } = await res.json();
    localStorage.setItem("hr_access", accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get:    <T>(path: string)                        => authFetch<T>(path),
  post:   <T>(path: string, body: unknown)         => authFetch<T>(path, { method: "POST",   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)         => authFetch<T>(path, { method: "PUT",    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)         => authFetch<T>(path, { method: "PATCH",  body: JSON.stringify(body) }),
  delete: <T>(path: string)                        => authFetch<T>(path, { method: "DELETE" }),
};
