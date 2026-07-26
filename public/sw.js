const CACHE_NAME = "mafia-v6";
const ASSETS = [
  "/",
  "/index.html",
  "/app.css",
  "/app.js",
  "/pixel-art.js",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/fonts/grandstander.css",
  "/fonts/grandstander/grandstander-latin-400.woff2",
  "/fonts/grandstander/grandstander-latin-700.woff2",
  "/fonts/grandstander/grandstander-latin-900.woff2",
  "/fonts/ibm-plex-mono-400.woff2",
  "/fonts/ibm-plex-mono-500.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Don't cache WebSocket or API requests
  if (e.request.url.includes("/ws")) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Only cache OK responses — a 4xx/5xx (e.g. during a deploy) must
        // not overwrite the cached app shell
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
