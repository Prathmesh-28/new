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

// Multi-firm switcher (#197): the active firm a member has switched into. Sent as
// X-Active-Tenant on every request; the backend honors it ONLY if the user has an
// active membership row for it (else it is ignored and the home firm is used). Kept
// in localStorage so the selection survives reload.
export function getActiveFirm(): string | null {
  try { return localStorage.getItem("hr_active_tenant"); } catch { return null; }
}
export function setActiveFirm(tenantId: string | null) {
  try {
    if (tenantId) localStorage.setItem("hr_active_tenant", tenantId);
    else localStorage.removeItem("hr_active_tenant");
  } catch { /* ignore */ }
}

function getToken() {
  return localStorage.getItem("hr_access");
}

// Headers identical to what authFetch sends (auth + client id + impersonation), for
// callers that need a raw fetch - e.g. streaming SSE responses that can't go through
// authFetch's JSON parsing.
export function authHeaders(): Record<string, string> {
  const token = getToken();
  const active = getActiveFirm();
  return {
    "X-Client-Id": CLIENT_ID,
    ...(impersonatedTenant ? { "X-Tenant-Id": impersonatedTenant } : {}),
    ...(active ? { "X-Active-Tenant": active } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Which failures are safe to retry? GETs always (idempotent by definition), and writes
// ONLY when the caller attached an Idempotency-Key — the server-side idempotency layer
// (Wave 1) makes replaying those exact requests safe. Anything else retried blindly could
// double-post money.
const isRetriableRequest = (path: string, init?: RequestInit) => {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  const h = (init?.headers ?? {}) as Record<string, string>;
  return Object.keys(h).some((k) => k.toLowerCase() === "idempotency-key");
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function authFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getToken();
  const active = getActiveFirm();
  const doFetch = () => fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": CLIENT_ID,
      ...(impersonatedTenant ? { "X-Tenant-Id": impersonatedTenant } : {}),
      ...(active ? { "X-Active-Tenant": active } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });

  // Retry-with-backoff (Wave 19): a blip on a flaky connection or a briefly-restarting
  // backend used to surface as an instant failure toast even though a second attempt
  // would have succeeded. Two retries, 400ms/1200ms, ONLY for requests that are safe to
  // repeat (see isRetriableRequest).
  let res: Response;
  const retriable = isRetriableRequest(path, init);
  for (let attempt = 0; ; attempt++) {
    try {
      res = await doFetch();
    } catch (e) {
      if (retriable && attempt < 2 && navigator.onLine) { await sleep(attempt === 0 ? 400 : 1200); continue; }
      throw e;
    }
    if (res.status >= 502 && res.status <= 504 && retriable && attempt < 2) { await sleep(attempt === 0 ? 400 : 1200); continue; }
    break;
  }

  // Rate limiting with a real answer (Wave 19): a 429 used to surface as raw JSON. Say
  // when to try again, from the server's own Retry-After when it sends one.
  if (res.status === 429) {
    const after = parseInt(res.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(after) && after > 0 ? after : 30;
    throw new Error(`You're doing that a bit too fast — try again in ${wait >= 60 ? `${Math.ceil(wait / 60)} minute${wait >= 120 ? "s" : ""}` : `${wait} seconds`}.`);
  }

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) return authFetch(path, init);
    localStorage.removeItem("hr_access");
    localStorage.removeItem("hr_refresh");
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }

  if (!res.ok) {
    // Human-readable failures everywhere: the raw body used to be thrown verbatim,
    // so users saw toasts like `422: {"error":"GST Output ledgers missing...","code":
    // "NOT_SEEDED"}`. Extract the backend's own message; fall back to status + body
    // only when the response isn't the standard {error} shape.
    const raw = await res.text().catch(() => "");
    let msg = "";
    try {
      const body = JSON.parse(raw);
      msg = body?.error || body?.message || "";
      if (msg && body?.code === "NOT_SEEDED") msg += " (open Books and run the one-time setup first)";
    } catch { /* not JSON */ }
    throw new Error(msg || `${res.status}: ${raw || res.statusText}`);
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
