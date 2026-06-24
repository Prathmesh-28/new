import { API_BASE as BASE } from "./apiBase";

// Stable per-tab id. Sent as X-Client-Id on every write so the live-sync stream
// can tell this client which events are its own echo (and skip refetching them).
const CLIENT_ID =
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function clientId() {
  return CLIENT_ID;
}

// Super-admin impersonation: when the platform owner opens a tenant, every API call
// carries X-Tenant-Id so the backend scopes reads/writes to that tenant. Set by
// AppContext.setSelectedClient; the backend ignores it for non-super_admins.
let impersonatedTenant: string | null = null;
export function setApiTenant(tenantId: string | null) {
  impersonatedTenant = tenantId;
}

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
      "X-Client-Id": CLIENT_ID,
      ...(impersonatedTenant ? { "X-Tenant-Id": impersonatedTenant } : {}),
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
  const rt = localStorage.getItem("hr_refresh");
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: rt }),
    });
    if (!res.ok) return false;
    const { access, refresh } = await res.json();
    localStorage.setItem("hr_access", access);
    if (refresh) localStorage.setItem("hr_refresh", refresh);
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
