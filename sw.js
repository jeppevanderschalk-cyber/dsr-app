const CACHE_NAME = "dsr-score-cache-v140";
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "shootout-domain.mjs",
  "dsr-logo.jpeg",
  "logo-SVBB.png",
  "aps-logo.png",
  "svbb-beamer-logo-compact.png",
  "svbb-login-logo-v6.png",
  "svbb-competition-login-logo.png",
  "svbb-app-icon-v5-32.png",
  "svbb-app-icon-v5-180.png",
  "svbb-app-icon-v5-192.png",
  "svbb-app-icon-v5-512.png",
];

self.addEventListener("install", (event) => {
  // Best-effort cachen: één ontbrekend bestand mag de installatie niet blokkeren
  // (cache.addAll zou dan volledig falen en de service worker nooit activeren).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(ASSETS.map((asset) => cache.add(asset)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const accept = request.headers.get("accept") || "";
  const isHtml = request.mode === "navigate" || accept.includes("text/html");

  if (isHtml) {
    // Netwerk-eerst voor de app zelf, zodat nieuwe versies altijd binnenkomen
    // zodra er internet is; valt terug op de cache als het netwerk faalt.
    // cache: "no-store" is nodig omdat de server index.html met max-age=600
    // serveert — zonder deze override kan een "verse" fetch binnen die 10
    // minuten alsnog gewoon de oude HTTP-cache teruggeven, waardoor nieuwe
    // deploys niet doorkomen ook al is de service worker zelf actief.
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("index.html"))),
    );
    return;
  }

  // Overige bestanden: cache-eerst met netwerk-fallback.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
