/* Pizarra Táctica — caché de la aplicación, para que funcione sin conexión.

   Regla: el código de la aplicación se pide SIEMPRE a la red primero, y la
   copia guardada solo entra en juego si no hay conexión. Lo contrario —servir
   la copia y refrescar por detrás— hacía que un arreglo publicado no llegara
   al móvil hasta la siguiente visita, o hasta nunca si la copia se quedaba
   pegada. Se han perdido horas persiguiendo fallos ya corregidos.

   Lo que no cambia nunca (tipografías e iconos) sí sale de la copia primero,
   que para eso es lo que hace que la aplicación abra al instante. */
var CACHE = 'pizarra-tactica-v5';

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

/* Lo inmutable: tipografías e iconos. Todo lo demás es código o datos. */
function esInmutable(ruta) {
  return /\.(woff2|png|svg|jpg|webp|ico)$/i.test(ruta);
}

function guarda(peticion, respuesta) {
  if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
    var copia = respuesta.clone();
    caches.open(CACHE).then(function (c) { c.put(peticion, copia); });
  }
  return respuesta;
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  /* Tipografías e iconos: de la copia, y si no está, de la red. */
  if (esInmutable(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (res) { return guarda(e.request, res); });
      })
    );
    return;
  }

  /* El código y los datos: de la red, y solo si no hay, de la copia. */
  e.respondWith(
    fetch(e.request)
      .then(function (res) { return guarda(e.request, res); })
      .catch(function () {
        return caches.match(e.request).then(function (hit) {
          if (hit) return hit;
          // Sin conexión y sin copia de esta página: al menos abre la pizarra.
          if (e.request.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Sin conexión' });
        });
      })
  );
});
