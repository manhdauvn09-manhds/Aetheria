// Aetheria — service worker.
//
// Strategy:
//   • install: precache the offline shell (root, /menu) so a returning
//     player at least sees a branded hello when their network is gone.
//   • fetch: stale-while-revalidate for same-origin GET; passthrough
//     otherwise. tRPC + auth API calls bypass the cache (they're POST).
//   • activate: prune old caches.
//
// IndexedDB asset cache (per spec §4.59) is a follow-up — this gets us
// the install banner + offline shell.

// Bump these any time the production bundle changes the API URL or any
// other baked-in constant — the `activate` handler below deletes caches
// that don't match these names, so cycling the suffix invalidates every
// service-worker-cached chunk on the next page load.
const SHELL_CACHE = "aetheria-shell-v2";
const RUNTIME_CACHE = "aetheria-runtime-v2";
const PRECACHE_URLS = ["/", "/menu", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Skip the tRPC + auth surface so we never serve stale state.
  if (url.pathname.startsWith("/trpc") || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached ?? caches.match("/menu"));
      return cached ?? networkFetch;
    }),
  );
});
