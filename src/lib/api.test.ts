// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Regression tests for the two launch-day defects a pre-launch audit found in the API
 * client. Both were silent in every other test because they need either a non-session 401
 * or genuine concurrency to reproduce.
 */
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let authFetch: typeof import("./api").authFetch;

beforeEach(async () => {
  Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), writable: true, configurable: true });
  localStorage.setItem("hr_access", "access-1");
  localStorage.setItem("hr_refresh", "refresh-1");
  // Fresh module per test: api.ts holds module-level state (the in-flight refresh promise).
  vi.resetModules();
  ({ authFetch } = await import("./api"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("authFetch: a 401 that a refresh cannot fix", () => {
  it("gives up after ONE refresh instead of looping forever", async () => {
    // The server answers 401 for a wrong CURRENT PASSWORD (change-password,
    // delete-account) and for upstream auth failures. The session is perfectly healthy, so
    // the refresh keeps succeeding — the old unguarded `return authFetch(...)` recursion
    // therefore re-sent the write forever and the promise never settled.
    let posts = 0, refreshes = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) { refreshes++; return json({ access: "a2", refresh: "r2" }); }
      posts++;
      return json({ error: "Current password is incorrect" }, 401);
    }));

    await expect(
      authFetch("/auth/change-password", { method: "POST", body: "{}" })
    ).rejects.toThrow(/current password is incorrect/i);

    expect(posts).toBe(2);      // the original + exactly one post-refresh retry
    expect(refreshes).toBe(1);
    expect(window.location.href).not.toContain("/login"); // a typo must not sign you out
  });

  it("still signs you out when the session is genuinely dead", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) return json({ error: "nope" }, 401);
      return json({ error: "No token" }, 401);
    }));
    await expect(authFetch("/api/invoices")).rejects.toThrow(/unauthenticated/i);
    expect(localStorage.getItem("hr_access")).toBeNull();
  });

  it("never redirects a visitor who was never signed in", async () => {
    localStorage.clear(); // a public page: no token, no refresh, never authed
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "No token" }, 401)));
    await expect(authFetch("/api/prefs")).rejects.toThrow(/unauthenticated/i);
    expect(window.location.href).not.toContain("/login");
  });
});

describe("authFetch: concurrent 401s", () => {
  it("shares ONE refresh, so the server's reuse detection can't revoke the session", async () => {
    // The app routinely has 5-6 requests in flight (the 5s KV poll alone fires one per
    // namespace). When the 15-minute access token expires they all 401 at once; rotating
    // the refresh token six times independently trips reuse detection — which keeps a
    // single previous hash — and kills the session.
    let refreshes = 0;
    let accessValid = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 10)); // a real round-trip
        accessValid = true;
        return json({ access: `a${refreshes}`, refresh: `r${refreshes}` });
      }
      return accessValid ? json({ data: [] }) : json({ error: "expired" }, 401);
    }));

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => authFetch("/api/invoices?limit=1"))
    );

    expect(refreshes).toBe(1);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(window.location.href).not.toContain("/login");
  });
});

describe("authFetch: 429 handling", () => {
  it("keeps the server's own message for a semantic limit, with status and code", async () => {
    // The backend uses 429 for limits that waiting never clears — a plan quota, "one
    // credit application per 90 days". Replacing those with "try again in 30 seconds"
    // was false advice and threw away the code the UI branches on.
    vi.stubGlobal("fetch", vi.fn(async () =>
      json({ error: "Monthly flow runs limit reached on the free plan", code: "PLAN_QUOTA_EXCEEDED" }, 429)));
    await expect(authFetch("/api/flows/x/run", { method: "POST", body: "{}" }))
      .rejects.toMatchObject({
        message: expect.stringContaining("Monthly flow runs limit"),
        status: 429,
        code: "PLAN_QUOTA_EXCEEDED",
      });
  });
});

describe("authFetch: retries", () => {
  it("retries a GET on a gateway blip", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n < 3 ? json({}, 503) : json({ ok: true }))));
    await expect(authFetch("/api/invoices")).resolves.toEqual({ ok: true });
    expect(n).toBe(3);
  });

  it("NEVER retries a write — the server honours Idempotency-Key on only a few routes", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { n++; return json({}, 503); }));
    await expect(
      authFetch("/api/invoices", { method: "POST", body: "{}", headers: { "Idempotency-Key": "k1" } })
    ).rejects.toThrow();
    expect(n).toBe(1); // one attempt only: a replayed POST could double-post money
  });
});
