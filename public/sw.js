/*
 * Service worker: the app shell, and nothing else.
 *
 * What this caches:
 *   - hashed build assets under /_next/static (immutable, safe forever)
 *   - the icons and the manifest
 *   - one static /offline page
 *
 * What this deliberately does NOT cache:
 *   - any HTML page. Every screen in this app is a signed-in, live view
 *     of shared data. A cached page would show one partner a stale shelf,
 *     or worse, show it on a different account after a sign-out. So
 *     navigations always go to the network, and fall back to /offline
 *     when there is none.
 *   - anything under /api, /auth, or any cross-origin request. That
 *     includes every Supabase call: inventory, prices, and sales are
 *     never written to disk by this worker.
 *
 * Net effect: opening the app on no signal gets you a real screen that
 * says so, instantly, instead of a browser error page -- and the app
 * boots in one paint once signal returns, because the JS is already
 * local.
 */

const VERSION = "ms-shell-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll fails the whole install if any single URL 404s, which
      // would leave the app with no worker at all. Take what we can get.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Lets the page tell a waiting worker to take over immediately. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isNeverCached(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_next/image")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Supabase is cross-origin, so every
  // data call passes straight through untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  // Immutable build output: cache first, it can never go stale.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(ASSET_CACHE);
            void cache.put(request, response.clone());
          }
          return response;
        } catch {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })(),
    );
    return;
  }

  // Page loads: network only, with an honest offline screen as the
  // fallback. Nothing is stored.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const offline = await caches.match("/offline");
          return (
            offline ??
            new Response(
              "<h1>No connection</h1><p>Reconnect and try again.</p>",
              { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
            )
          );
        }
      })(),
    );
  }
});
