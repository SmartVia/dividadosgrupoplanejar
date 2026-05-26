const CACHE_NAME = "dividados-pesquisa-v30";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./campo.html",
  "./relatorio.html",
  "./style.css",
  "./api-client.js",
  "./script.js",
  "./script-hotfix-options.js",
  "./dashboard.js",
  "./campo.js",
  "./relatorio.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      return cached || caches.match("./index.html");
    }))
  );
});



