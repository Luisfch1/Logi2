// sw.js
// Incrementa la versión en cada deploy para invalidar caché
const CACHE_VERSION = "logi2-v0.8.3.4";
const CACHE = `logi2-cache-${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.png",
  "./apple-touch-icon.png",

  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png"
];

// Librerías externas necesarias para exportar (DOCX/PDF/XLSX/ZIP).
// Objetivo: dejar TODO listo para trabajo sin internet una vez la app se haya abierto al menos una vez con conexión.
const LIB_ASSETS = [
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
];
const LIB_ASSETS_SET = new Set(LIB_ASSETS);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // 1) Cache de assets locales (si falla uno, no queremos tumbar toda la instalación)
    await Promise.all(ASSETS.map(async (u) => {
      try {
        const req = new Request(u, { cache: "reload" });
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) await cache.put(u, res.clone());
      } catch (_) {}
    }));

    // 2) Cache de librerías externas (cross-origin). Guardamos respuesta opaca si aplica.
    await Promise.all(LIB_ASSETS.map(async (u) => {
      try {
        const req = new Request(u, { mode: "no-cors", cache: "reload" });
        const res = await fetch(req);
        if (res) await cache.put(u, res.clone());
      } catch (_) {}
    }));
  })());
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

  // Si la request es una librería externa que necesitamos offline, la servimos cache-first
  if (LIB_ASSETS_SET.has(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh) await cache.put(req.url, fresh.clone());
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Para el resto, solo manejamos recursos del mismo origen
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === "navigate";

  // NAV: network-first
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
        const cached = await cache.match(req);
        return cached || cache.match("./index.html") || cache.match("./") || Response.error();
      }
    })());
    return;
  }

  // ASSETS: cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === "opaque")) await cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});