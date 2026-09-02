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

// Has this tab ever held a session? A 401 with no token means two very different things:
// a visitor on a public page (never signed in → fail quietly), or a tab whose session was
// ended elsewhere, e.g. logout in another tab (→ send them to /login). Without this
// distinction one of the two is always broken.
let everAuthed = false;

function getToken() {
  const t = localStorage.getItem("hr_access");
  if (t) everAuthed = true;
  return t;
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

// Only GET/HEAD are retried. An earlier version also retried any write carrying an
// Idempotency-Key, on the theory that the server would de-duplicate it — but the
// idempotency middleware is mounted on a HANDFUL of routes, so for every other write that
// assumption silently becomes "double-post the money". Replay of a genuine write is the
// offline queue's job (lib/offlineQueue), which only ever replays keys the server honours.
const isRetriableRequest = (_path: string, init?: RequestInit) => {
  const method = (init?.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD";
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function authFetch<T = unknown>(
  path: string,
  init?: RequestInit,
  /** Internal: set on the single post-refresh retry, so a 401 can never recurse twice. */
  retried = false
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

  // 429 is NOT only "slow down". This backend also uses it for semantic limits that
  // waiting will never clear — a plan quota (upgrade), "one credit application per 90
  // days", "already reminded in the last 24 hours", "you can own at most N firms". An
  // earlier version replaced ALL of them with "try again in 30 seconds", which is false
  // advice and threw away the status and code the UI needs. So: keep the server's own
  // message whenever it sent one, and only synthesise the wait when it didn't (i.e. the
  // generic express-rate-limit case, which is also the only one that sets Retry-After).
  // Falls through to the shared !res.ok handler below so status/code are always attached.

  if (res.status === 401) {
    // Only bounce to /login when a session actually ended. A request with no token from a
    // tab that never had one (a provider above the public routes, a portal page, the
    // homepage) fails quietly — redirecting there would kick every logged-out visitor,
    // including customers on /portal/:token, off the page they were sent. But a tab that
    // WAS signed in and now has no token (logged out in another tab) must be sent to
    // /login rather than left sitting on a dead screen.
    if (!token && !localStorage.getItem("hr_refresh") && !everAuthed) throw new Error("Unauthenticated");

    // Refresh and retry AT MOST ONCE. Several endpoints answer 401 for reasons a refresh
    // cannot fix — "current password is incorrect" (change-password, delete-account),
    // upstream Razorpay auth — and the previous unguarded recursion re-sent the request
    // after every successful refresh, looping forever: the promise never settled, so the
    // user's spinner span forever and the real "wrong password" message was unreachable.
    if (!retried) {
      const refreshed = await tryRefresh();
      if (refreshed) return authFetch(path, init, true);
    }

    // A 401 that survives a refresh is either a genuinely dead session or an endpoint
    // using 401 for something else. If the session still looks alive, surface the
    // server's own message instead of signing the user out over a typo'd password.
    if (retried && localStorage.getItem("hr_refresh")) {
      const raw401 = await res.text().catch(() => "");
      let msg401 = "";
      try { msg401 = JSON.parse(raw401)?.error || ""; } catch { /* not JSON */ }
      const e401 = new Error(msg401 || "Not authorised") as Error & { status?: number };
      e401.status = 401;
      throw e401;
    }

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
    // Carry the status: the offline queue must distinguish a transient 503/429 (keep and
    // retry) from a real rejection (drop and tell the user). A bare message can't.
    const err = new Error(msg || `${res.status}: ${raw || res.statusText}`) as Error & { status?: number; code?: string };
    err.status = res.status;
    try { err.code = JSON.parse(raw)?.code; } catch { /* not JSON */ }
    throw err;
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// Concurrent 401s must share ONE refresh. The app routinely has 5-6 requests in flight
// (the 5s KV poll alone fires one per namespace), so when a 15-minute access token expires
// they all 401 at once. Independently rotating the refresh token N times trips the
// server's reuse detection — which keeps a single previous hash — and REVOKES the whole
// session: the user is signed out for doing nothing but leaving a tab open.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
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
