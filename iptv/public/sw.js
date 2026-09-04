/**
 * Service worker: hace que la app se pueda instalar (icono propio, ventana sin
 * navegador) y guarda la interfaz en cache para que abra al instante.
 * Estrategia: red primero y cache como respaldo, para que un cambio en el
 * codigo se vea sin trucos raros de version.
 */
const CACHE = 'mi-iptv-v1';
const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/state.js',
  '/js/dom.js',
  '/js/components.js',
  '/js/views.js',
  '/js/player.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // La API y el video nunca se cachean: siempre datos frescos.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/index.html');
        return new Response('Sin conexion con el servidor de Mi IPTV', { status: 503 });
      })
  );
});
