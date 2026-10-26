/*
 * Service Worker: macht den Urlaubsplaner offline nutzbar und installierbar.
 * App-Dateien: zuerst Netz (immer aktuell), sonst Cache. CDN-Ressourcen: zuerst Cache.
 */
const CACHE = 'urlaubsplaner-v4';
const APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/css/app.css',
  'assets/js/data.js',
  'assets/js/calendar.js',
  'assets/js/store.js',
  'assets/js/ui.js',
  'assets/js/views.js',
  'assets/js/dialogs.js',
  'assets/js/palette.js',
  'assets/js/app.js',
  'assets/js/sync-config.js',
  'assets/js/sync.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
  } else if (/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com/.test(url.host)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
  }
});
