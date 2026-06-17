// Headroom PWA service worker.
//   • HTML / navigations → network-first, so index.html (and the chunk hashes it
//     references) is always fresh after a deploy. Cached shell is only an OFFLINE
//     fallback. This is what prevents the "failed to fetch dynamically imported
//     module" blank screen on a new release.
//   • Hashed /assets/* → cache-first. The filename contains a content hash, so a
//     given URL is immutable — serving it from cache is instant AND safe.
//   • /api, /auth, /webhook → never touched (financial data stays live).
const CACHE = "hr-v2";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html"]).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // CDN/backend: leave alone
  if (/^\/(api|auth|webhook)/.test(url.pathname)) return;      // never cache live data

  const isNav = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  // Navigations: always go to network for a fresh index.html; cached shell only offline.
  if (isNav) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/index.html")))
    );
    return;
  }

  // Hashed build assets: cache-first (immutable) → instant repeat loads.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
      )
    );
    return;
  }

  // Everything else: network-first, cached copy when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
