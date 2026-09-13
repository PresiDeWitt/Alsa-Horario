/* Horario — cache de la app para que abra sin conexión */
const CACHE = 'horario-b10';
const SHELL = [
  './',
  './index.html',
  './css/styles.css?v=10',
  './js/data.js?v=10',
  './js/app.js?v=10',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para recibir cambios), cache si no hay conexión.
// `no-cache` obliga a revalidar con el servidor en vez de usar la cache HTTP del navegador.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const request = req.mode === 'navigate'
    ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(req, { cache: 'no-cache' });
  event.respondWith(
    fetch(request)
      .then((res) => {
        // Solo se guardan respuestas correctas; las descargas de comprobación (?fresh=) no.
        if (res.ok && !url.searchParams.has('fresh')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
