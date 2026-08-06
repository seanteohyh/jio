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
