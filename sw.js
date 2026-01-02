// sw.js
const CACHE_VERSION = "logi2-v0.6b4";
const CACHE = `logi2-cache-${CACHE_VERSION}`;

// Archivos "core" (offline básico)
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./manifest.webmanifest?v=0.6b4",
  "./favicon.png",
  "./favicon.png?v=0.6b4",
  "./apple-touch-icon.png",
  "./apple-touch-icon.png?v=0.6b4",
  "./icon-192.png",
  "./icon-192.png?v=0.6b4",
  "./icon-192-maskable.png",
  "./icon-192-maskable.png?v=0.6b4",
  "./icon-512.png",
  "./icon-512.png?v=0.6b4",
  "./icon-512-maskable.png",
  "./icon-512-maskable.png?v=0.6b4"
];

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function precacheCore() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(CORE_ASSETS.map(async (u) => {
    try {
      // "reload" evita que el navegador sirva la versión vieja desde HTTP cache
      const req = new Request(u, { cache: "reload" });
      const res = await fetch(req);
      if (res && res.ok) {
        await cache.put(u, res.clone());
      }
    } catch {}
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheCore().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("logi2-cache-") && k !== CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isIconOrManifest(url) {
  const p = url.pathname;
  return (
    p.endsWith(".png") ||
    p.endsWith("manifest.webmanifest") ||
    p.endsWith(".webmanifest") ||
    p.endsWith("favicon.ico")
  );
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fetchPromise = (async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return null;
    }
  })();
  // si hay cache, respondemos de una, pero actualizamos en background
  if (cached) {
    fetchPromise.catch(() => {});
    return cached;
  }
  const fresh = await fetchPromise;
  return fresh || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === "navigate";

  // Navegación: network-first (para que el HTML se actualice fácil)
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
        // fallback offline
        const cached = await cache.match(req, { ignoreSearch: true });
        return cached || cache.match("./index.html") || cache.match("./") || Response.error();
      }
    })());
    return;
  }

  // Íconos/manifest: stale-while-revalidate (evita quedarnos pegados a un ícono viejo)
  if (isIconOrManifest(url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Otros assets: cache-first, y si no está, lo bajamos y cacheamos
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
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
