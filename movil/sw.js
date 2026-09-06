/**
 * Service worker de Cookie Play (versión móvil).
 * Guarda la interfaz para que la app abra al instante y siga funcionando
 * aunque el iPhone esté sin cobertura: la lista ya está dentro del teléfono.
 */
const CACHE = 'cookie-play-movil-v8';
const ARCHIVOS = [
  './',
  'index.html',
  'estilo.css',
  'app.js',
  'manifest.webmanifest',
  'icons/logo.png',
  'icons/wordmark.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // el vídeo nunca se cachea

  evento.respondWith(
    fetch(request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(request, copia));
        }
        return respuesta;
      })
      .catch(async () => (await caches.match(request)) || caches.match('index.html'))
  );
});
