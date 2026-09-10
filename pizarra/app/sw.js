/* Pizarra Táctica — caché de la aplicación, para que funcione sin conexión. */
var CACHE = 'pizarra-tactica-v4';
var SHELL = [
  './',
  './index.html',
  './board.css',
  './board.js',
  './config.js',
  './nube.js',
  '../assets/biblioteca.json',
  '../site.webmanifest',
  '../assets/fonts/outfit-latin-var.woff2',
  '../assets/fonts/inter-latin-var.woff2',
  '../assets/img/favicon.svg',
  '../assets/img/apple-touch-icon.png',
  '../assets/img/icon-192.png',
  '../assets/img/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Primero la caché, y de fondo se refresca: abre al instante y se actualiza solo. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  /* La biblioteca y la configuración van a la red primero: la una crece con el
     tiempo, y la otra, si se queda vieja, deja la aplicación hablando con el
     servidor equivocado (o con ninguno). */
  if (url.pathname.indexOf('biblioteca.json') >= 0 ||
      url.pathname.indexOf('config.js') >= 0) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        }
        return res;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
