// sw.js
const CACHE_VERSION = "logi2-v0.6b5";
const CACHE = `logi2-cache-${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./index.html?v=0.6b5",
  "./manifest.webmanifest",
  "./manifest.webmanifest?v=0.6b5",

  "./favicon.png",
  "./favicon.png?v=0.6b5",
  "./apple-touch-icon.png",
  "./apple-touch-icon.png?v=0.6b5",

  "./icon-192.png",
  "./icon-192.png?v=0.6b5",
  "./icon-512.png",
  "./icon-512.png?v=0.6b5",
  "./icon-192-maskable.png",
  "./icon-192-maskable.png?v=0.6b5",
  "./icon-512-maskable.png",
  "./icon-512-maskable.png?v=0.6b5"
];

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.allSettled(ASSETS.map((u) => cache.add(u)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("logi2-cache-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === "navigate";
  const path = url.pathname;

  const isPwaMeta =
    path.endsWith(".webmanifest") ||
    path.endsWith("favicon.png") ||
    path.endsWith("apple-touch-icon.png") ||
    path.endsWith("icon-192.png") ||
    path.endsWith("icon-512.png") ||
    path.endsWith("icon-192-maskable.png") ||
    path.endsWith("icon-512-maskable.png");

  // NAV: network-first (si falla, cache)
  if (isNav) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        if (fresh && fresh.ok) {
          await cache.put(req, fresh.clone());
          return fresh;
        }
        throw new Error("bad response");
      } catch {
        const cached = await cache.match(req, { ignoreSearch: true });
        return cached || cache.match("./index.html") || cache.match("./") || Response.error();
      }
    })());
    return;
  }

  // PWA meta (manifest / icons): stale-while-revalidate, y NO ignorar query
  if (isPwaMeta) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const fetchPromise = (async () => {
        try{
          const fresh = await fetch(req, { cache: "reload" });
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
          return fresh;
        }catch{
          return null;
        }
      })();

      // Si hay cache, devuelve rápido; si no, espera red
      return cached || (await fetchPromise) || Response.error();
    })());
    return;
  }

  // Otros ASSETS: cache-first (ignorando query, para no duplicar)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
