/**
 * Servidor de la app IPTV personal.
 * Sirve la interfaz estatica y una pequena API sobre los datos locales.
 * Sin dependencias externas: solo Node.
 */
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

import { read, write, update } from './src/store.js';
import { groupChannels, recommend, search } from './src/library.js';
import { addPlaylist, bootstrapFromEnv, removePlaylist, updatePlaylist, syncAll, status as syncStatus } from './src/sync.js';
import { clearCache } from './src/tmdb.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const USER_AGENT = 'VLC/3.0.20 LibVLC/3.0.20';

/**
 * Contrasena de acceso. Vacia (uso local) = sin login.
 * Al publicar la app en internet es obligatoria: sin ella cualquiera que
 * encuentre la direccion entraria a tus listas.
 */
const ACCESS_PIN = (process.env.ACCESS_PIN || '').trim();
const COOKIE = 'miiptv_sesion';
const SESSION_TOKEN = ACCESS_PIN
  ? createHmac('sha256', ACCESS_PIN).update('miiptv-sesion-v1').digest('hex')
  : '';
// Rutas que se sirven sin sesion para poder pintar la pantalla de acceso.
const PUBLIC_PATHS = new Set(['/login.html', '/css/style.css', '/manifest.webmanifest', '/favicon.ico']);

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) out[name] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function sameToken(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

const hasSession = (req) => !ACCESS_PIN || sameToken(cookies(req)[COOKIE] || '', SESSION_TOKEN);

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/icons/');
}

// Un retardo creciente hace inviable probar contrasenas a lo bruto.
let failedLogins = 0;

async function handleLogin(req, res) {
  const body = await readBody(req);
  const pin = String(body.pin || '');
  if (!ACCESS_PIN || !sameToken(pin, ACCESS_PIN)) {
    failedLogins += 1;
    await new Promise((r) => setTimeout(r, Math.min(3000, failedLogins * 400)));
    return fail(res, 'Contraseña incorrecta', 401);
  }
  failedLogins = 0;
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': `${COOKIE}=${SESSION_TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 60}${secure}`
  });
  res.end(JSON.stringify({ ok: true }));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon'
};

const json = (res, data, code = 200) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const fail = (res, message, code = 400) => json(res, { error: message }, code);

async function readBody(req, limit = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Contenido demasiado grande');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('JSON no valido');
  }
}

async function serveStatic(req, res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return fail(res, 'Ruta no permitida', 403);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('no file');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache'
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}

const isHls = (url, contentType) =>
  /\.m3u8(\?|$)/i.test(url) || /mpegurl/i.test(contentType || '');

/** Reescribe un manifiesto HLS para que los segmentos pasen tambien por el proxy. */
function rewriteManifest(text, baseUrl) {
  const proxied = (target) => {
    try {
      return `/api/proxy?url=${encodeURIComponent(new URL(target, baseUrl).href)}`;
    } catch {
      return target;
    }
  };
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxied(uri)}"`);
    }
    return proxied(trimmed);
  }).join('\n');
}

/** Proxy de streams: evita problemas de CORS y de cabeceras User-Agent. */
async function proxyStream(req, res, target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return fail(res, 'URL no valida');
  }
  if (!/^https?:$/.test(url.protocol)) return fail(res, 'Solo se permiten http y https');

  const headers = { 'User-Agent': USER_AGENT, Accept: '*/*' };
  if (req.headers.range) headers.Range = req.headers.range;
  if (req.headers['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match'];

  let upstream;
  try {
    upstream = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  } catch (err) {
    return fail(res, `No se pudo conectar con el origen: ${err.message}`, 502);
  }

  const type = upstream.headers.get('content-type') || '';
  if (isHls(url.href, type)) {
    const text = await upstream.text();
    const body = rewriteManifest(text, upstream.url || url.href);
    res.writeHead(upstream.status, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(body);
  }

  const out = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(upstream.status, out);
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body).pipe(res).on('error', () => res.end());
  req.on('close', () => { try { upstream.body.cancel(); } catch { /* cliente cerro */ } });
}

function paginate(items, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const size = Math.min(500, Math.max(1, Number(url.searchParams.get('size') || 60)));
  const start = (page - 1) * size;
  return { total: items.length, page, size, pages: Math.ceil(items.length / size) || 1, items: items.slice(start, start + size) };
}

function sortItems(items, sort) {
  const copy = [...items];
  switch (sort) {
    case 'rating': return copy.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || a.title.localeCompare(b.title, 'es'));
    case 'recent': return copy.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0) || (b.year || 0) - (a.year || 0));
    case 'year': return copy.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title, 'es'));
    default: return copy.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
  }
}

async function handleApi(req, res, url) {
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method.toUpperCase();

  // ---- Estado general ----
  if (path === '/state' && method === 'GET') {
    const [playlists, settings, favorites, history, catalog] = await Promise.all([
      read('playlists'), read('settings'), read('favorites'), read('history'), read('catalog')
    ]);
    return json(res, {
      playlists: playlists.map(({ password, ...p }) => ({ ...p, hasPassword: Boolean(password) })),
      settings: { ...settings, tmdbApiKey: settings.tmdbApiKey ? '••••••••' : '' },
      favorites,
      history: history.slice(0, 30),
      auth: Boolean(ACCESS_PIN),
      counts: {
        movies: catalog.movies.length,
        series: catalog.series.length,
        live: catalog.live.length,
        builtAt: catalog.builtAt
      },
      sync: syncStatus
    });
  }

  // ---- Catalogo ----
  if (path === '/catalog' && method === 'GET') {
    const catalog = await read('catalog');
    const type = url.searchParams.get('type') || 'movie';
    const group = url.searchParams.get('group');
    const genre = url.searchParams.get('genre');
    let items = type === 'movie' ? catalog.movies : type === 'series' ? catalog.series : catalog.live;
    if (group) items = items.filter((i) => (i.groups ? i.groups.includes(group) : i.group === group));
    if (genre) items = items.filter((i) => (i.genres || []).includes(genre));
    if (type !== 'live') items = sortItems(items, url.searchParams.get('sort') || 'title');
    return json(res, paginate(items, url));
  }

  if (path === '/groups' && method === 'GET') {
    const catalog = await read('catalog');
    const type = url.searchParams.get('type') || 'live';
    if (type === 'live') return json(res, { groups: groupChannels(catalog.live).map((g) => ({ name: g.name, count: g.items.length })) });
    const items = type === 'movie' ? catalog.movies : catalog.series;
    const counts = new Map();
    for (const item of items) for (const g of item.groups || []) counts.set(g, (counts.get(g) || 0) + 1);
    const genres = new Map();
    for (const item of items) for (const g of item.genres || []) genres.set(g, (genres.get(g) || 0) + 1);
    return json(res, {
      groups: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      genres: [...genres].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    });
  }

  if (path === '/item' && method === 'GET') {
    const id = url.searchParams.get('id');
    const catalog = await read('catalog');
    const item = [...catalog.movies, ...catalog.series, ...catalog.live].find((i) => i.id === id);
    return item ? json(res, item) : fail(res, 'No encontrado', 404);
  }

  if (path === '/search' && method === 'GET') {
    const catalog = await read('catalog');
    const types = (url.searchParams.get('type') || '').split(',').filter(Boolean);
    const results = search(catalog, url.searchParams.get('q') || '', { types, limit: 80 });
    return json(res, { results });
  }

  if (path === '/recommendations' && method === 'GET') {
    const [catalog, favorites, history] = await Promise.all([read('catalog'), read('favorites'), read('history')]);
    const type = url.searchParams.get('type') || undefined;
    const limit = Math.min(60, Number(url.searchParams.get('limit') || 24));
    return json(res, { items: recommend(catalog, { favorites, history, limit, type }) });
  }

  // ---- Favoritos ----
  if (path === '/favorites' && method === 'GET') return json(res, { items: await read('favorites') });

  if (path === '/favorites' && method === 'POST') {
    const body = await readBody(req);
    if (!body.id) return fail(res, 'Falta el id');
    const items = await update('favorites', (list) => {
      const without = list.filter((f) => f.id !== body.id);
      without.unshift({
        id: body.id,
        type: body.type || 'movie',
        title: body.title || '',
        poster: body.poster || '',
        url: body.url || '',
        addedAt: Date.now()
      });
      return without;
    });
    return json(res, { items });
  }

  if (path === '/favorites' && method === 'DELETE') {
    const id = url.searchParams.get('id');
    const items = await update('favorites', (list) => list.filter((f) => f.id !== id));
    return json(res, { items });
  }

  // ---- Historial / continuar viendo ----
  if (path === '/history' && method === 'POST') {
    const body = await readBody(req);
    if (!body.id) return fail(res, 'Falta el id');
    const items = await update('history', (list) => {
      const without = list.filter((h) => h.id !== body.id || h.episodeId !== body.episodeId);
      without.unshift({ ...body, at: Date.now() });
      return without.slice(0, 100);
    });
    return json(res, { items: items.slice(0, 30) });
  }

  if (path === '/history' && method === 'DELETE') {
    await write('history', []);
    return json(res, { items: [] });
  }

  // ---- Listas ----
  if (path === '/playlists' && method === 'POST') {
    const body = await readBody(req);
    try {
      const playlist = await addPlaylist(body);
      const { password, ...safe } = playlist;
      return json(res, { playlist: safe });
    } catch (err) {
      return fail(res, err.message);
    }
  }

  if (path === '/playlists' && method === 'PATCH') {
    const body = await readBody(req);
    try {
      const { password, ...safe } = await updatePlaylist(body.id, body.patch || {});
      return json(res, { playlist: safe });
    } catch (err) {
      return fail(res, err.message, 404);
    }
  }

  if (path === '/playlists' && method === 'DELETE') {
    const items = await removePlaylist(url.searchParams.get('id'));
    return json(res, { playlists: items.map(({ password, ...p }) => p) });
  }

  // ---- Sincronizacion ----
  if (path === '/sync' && method === 'POST') {
    if (syncStatus.running) return json(res, { status: syncStatus });
    syncAll().catch(() => { /* el estado ya recoge el error */ });
    return json(res, { status: syncStatus });
  }
  if (path === '/sync' && method === 'GET') return json(res, { status: syncStatus });

  // ---- Ajustes ----
  if (path === '/settings' && method === 'POST') {
    const body = await readBody(req);
    const settings = await read('settings');
    const next = { ...settings };
    if (typeof body.theme === 'string') next.theme = body.theme;
    if (typeof body.adultFilter === 'boolean') next.adultFilter = body.adultFilter;
    if (typeof body.region === 'string') next.region = body.region;
    if (typeof body.tmdbApiKey === 'string' && !body.tmdbApiKey.includes('•')) next.tmdbApiKey = body.tmdbApiKey.trim();
    await write('settings', next);
    return json(res, { settings: { ...next, tmdbApiKey: next.tmdbApiKey ? '••••••••' : '' } });
  }

  if (path === '/meta-cache' && method === 'DELETE') {
    await clearCache();
    return json(res, { ok: true });
  }

  return fail(res, 'Ruta desconocida', 404);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // Puerta de acceso: solo activa si hay ACCESS_PIN configurada.
    if (ACCESS_PIN && !isPublicPath(url.pathname) && !hasSession(req)) {
      if (url.pathname === '/api/login' && req.method === 'POST') return await handleLogin(req, res);
      if (url.pathname.startsWith('/api/')) return fail(res, 'Necesitas iniciar sesión', 401);
      return await serveStatic(req, res, '/login.html');
    }
    if (url.pathname === '/api/login' && req.method === 'POST') return await handleLogin(req, res);
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (url.pathname === '/api/proxy') {
      const target = url.searchParams.get('url');
      if (!target) return fail(res, 'Falta el parametro url');
      return await proxyStream(req, res, target);
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) fail(res, err.message || 'Error interno', 500);
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  // Cuando arranca desde el lanzador, es este quien muestra las direcciones.
  if (!process.env.QUIET) {
    console.log(`\n  🍪  Cookie Play\n  →  http://${HOST}:${PORT}`);
    console.log(ACCESS_PIN ? '  🔒  Acceso protegido con contraseña\n' : '');
  }
  bootstrapFromEnv().catch((err) => console.error('[inicio]', err.message));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  El puerto ${PORT} ya esta ocupado. Cierra la otra ventana de Cookie Play o arranca con otro puerto:\n  PORT=8790 npm start\n`);
    process.exit(1);
  }
  throw err;
});
