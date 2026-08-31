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

/**
 * How long a page navigation waits on the network before falling back to
 * the last good cached copy of that exact page. Previously unbounded —
 * `fetch(request)` with no race — so a slow connection at cold start (the
 * common case reopening an installed iOS PWA: cellular handoff, weak wifi
 * right as the app launches) left the native splash screen up for however
 * long that one request took, with nothing to show even though a perfectly
 * good cached copy of the same page already existed. 2.5s is generous for
 * a healthy connection (this almost never actually triggers then) but short
 * enough that a bad one no longer reads as "did this even open."
 */
const NAV_TIMEOUT_MS = 2500;

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

  // Page navigations: race the network against NAV_TIMEOUT_MS, using
  // whichever last-good cached copy of this exact page exists as both the
  // timeout fallback and the true-failure fallback — a slow or dead
  // connection at cold start gets the app shell instantly instead of a
  // blank screen. Falls through to /offline.html only when there's no
  // cached copy of this page at all (a genuinely first-ever visit with no
  // network) — see NAV_TIMEOUT_MS's own comment for the reasoning.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithTimeout(request));
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

/**
 * Network raced against NAV_TIMEOUT_MS, falling back to the last cached
 * copy of this exact page either way — on timeout, or on an outright
 * network failure that resolves faster than the timeout. The network
 * fetch is never awaited past that point but keeps running in the
 * background regardless, so a slow response that does eventually land
 * still refreshes the cache for next time (stale-while-revalidate), it
 * just doesn't hold up *this* navigation waiting for it.
 */
async function networkFirstWithTimeout(request) {
  const cached = await caches.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => null);

  if (!cached) {
    const response = await networkFetch;
    return response || caches.match("/offline.html");
  }

  const timedOut = new Promise((resolve) => {
    setTimeout(() => resolve(null), NAV_TIMEOUT_MS);
  });
  const first = await Promise.race([networkFetch, timedOut]);
  return first || cached;
}

// ------------------------------------------------------------------ push --
// CHANGES_20260804.md §6. The payload is whatever sendPushToUsers() in
// src/lib/push.ts sent — { title, body, url } — kept intentionally small
// rather than trying to carry enough state to skip a real page load.
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Jio", {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

// Focuses an already-open tab on that URL rather than always spawning a new
// one — someone with the app open in a background tab should land there,
// not end up with two.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === url && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
