/**
 * Jio service worker.
 *
 * Conservative on purpose. A lunch app whose data is stale is worse than one
 * that says it is offline: "Tian Tian is 6 minutes away" is useless if the
 * event closed an hour ago and everyone already left.
 *
 * So: API requests are never cached, page navigations are network-first with
 * an offline fallback, and only genuinely static assets are cached at all.
 */

const VERSION = "jio-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const PRECACHE = ["/offline.html", "/manifest.json", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only. Do not get between the app and its tile server or CDN.
  if (url.origin !== self.location.origin) return;

  // Never cache the API. Stale lunch data is actively harmful.
  if (url.pathname.startsWith("/api/")) return;

  // Never cache auth routes.
  if (url.pathname.startsWith("/auth/")) return;

  // Page navigations: try the network, fall back to the last good copy, then
  // to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match("/offline.html");
        })
    );
    return;
  }

  // Static assets: cache-first, since Next.js fingerprints their filenames.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(STATIC_CACHE)
              .then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});
