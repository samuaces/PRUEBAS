/**
 * Sincronizacion de listas: descarga, parseo, union en catalogo y enriquecimiento.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR, read, write } from './store.js';
import { parseM3U } from './parse.js';
import { buildCatalog } from './library.js';
import { fetchCatalog as fetchXtream, login as xtreamLogin } from './xtream.js';
import { enrich } from './tmdb.js';

const LISTS_DIR = join(DATA_DIR, 'lists');
const USER_AGENT = 'VLC/3.0.20 LibVLC/3.0.20';

export const status = {
  running: false,
  step: 'Inactivo',
  progress: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
  result: null
};

function setStatus(step, progress) {
  status.step = step;
  if (typeof progress === 'number') status.progress = Math.max(0, Math.min(100, Math.round(progress)));
}

async function downloadText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }
  });
  if (!res.ok) throw new Error(`La lista respondio ${res.status}`);
  return res.text();
}

/** Guarda el contenido de una lista pegada o subida por el usuario. */
export async function saveListFile(id, content) {
  await mkdir(LISTS_DIR, { recursive: true });
  const path = join(LISTS_DIR, `${id}.m3u`);
  await writeFile(path, content, 'utf8');
  return path;
}

async function removeListFile(id) {
  await rm(join(LISTS_DIR, `${id}.m3u`), { force: true });
}

/** Descarga y parsea una unica lista. Devuelve entradas normalizadas. */
export async function loadPlaylist(playlist, onProgress) {
  const tag = (msg) => onProgress?.(`${playlist.name}: ${msg}`);
  let entries = [];

  if (playlist.kind === 'xtream') {
    entries = await fetchXtream(playlist, { onProgress: tag });
  } else if (playlist.kind === 'file') {
    tag('Leyendo lista guardada…');
    entries = parseM3U(await readFile(join(LISTS_DIR, `${playlist.id}.m3u`), 'utf8'));
  } else {
    tag('Descargando lista…');
    entries = parseM3U(await downloadText(playlist.url));
  }

  return entries.map((e) => ({ ...e, playlistId: playlist.id, playlistName: playlist.name }));
}

/** Anyade una lista nueva, validandola antes de guardarla. */
export async function addPlaylist(input) {
  const id = randomUUID().slice(0, 8);
  const kind = input.kind === 'xtream' ? 'xtream' : (input.content ? 'file' : 'm3u');
  const playlist = {
    id,
    kind,
    name: (input.name || '').trim() || (kind === 'xtream' ? new URL(/^https?:\/\//i.test(input.host) ? input.host : `http://${input.host}`).hostname : 'Mi lista'),
    url: input.url?.trim() || '',
    host: input.host?.trim() || '',
    username: input.username?.trim() || '',
    password: input.password || '',
    addedAt: Date.now(),
    lastSync: null,
    itemCount: 0,
    enabled: true,
    error: null
  };

  if (kind === 'xtream') {
    if (!playlist.host || !playlist.username) throw new Error('Faltan servidor y usuario');
    const info = await xtreamLogin(playlist);
    playlist.accountStatus = info.user_info?.status || '';
    playlist.expiresAt = info.user_info?.exp_date ? Number(info.user_info.exp_date) * 1000 : null;
  } else if (kind === 'file') {
    if (!String(input.content).includes('#EXT')) throw new Error('El contenido no parece una lista M3U');
    await saveListFile(id, input.content);
  } else {
    if (!/^https?:\/\//i.test(playlist.url)) throw new Error('La URL debe empezar por http:// o https://');
  }

  const playlists = await read('playlists');
  playlists.push(playlist);
  await write('playlists', playlists);
  return playlist;
}

export async function removePlaylist(id) {
  const playlists = await read('playlists');
  const next = playlists.filter((p) => p.id !== id);
  await write('playlists', next);
  await removeListFile(id);
  return next;
}

export async function updatePlaylist(id, patch) {
  const playlists = await read('playlists');
  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) throw new Error('Lista no encontrada');
  Object.assign(playlist, patch);
  await write('playlists', playlists);
  return playlist;
}

/**
 * Sincroniza todas las listas activas y reconstruye el catalogo.
 * Solo se ejecuta una sincronizacion a la vez.
 */
export async function syncAll({ useTmdb = true } = {}) {
  if (status.running) return status;
  status.running = true;
  status.error = null;
  status.result = null;
  status.startedAt = Date.now();
  status.finishedAt = null;
  setStatus('Preparando…', 2);

  try {
    const [playlists, settings, favorites, history] = await Promise.all([
      read('playlists'), read('settings'), read('favorites'), read('history')
    ]);
    const active = playlists.filter((p) => p.enabled !== false);
    if (!active.length) throw new Error('No hay ninguna lista configurada');

    const all = [];
    for (const [i, playlist] of active.entries()) {
      const base = 5 + (i / active.length) * 60;
      setStatus(`Sincronizando ${playlist.name}…`, base);
      try {
        const entries = await loadPlaylist(playlist, (msg) => setStatus(msg, base));
        all.push(...entries);
        playlist.itemCount = entries.length;
        playlist.lastSync = Date.now();
        playlist.error = null;
      } catch (err) {
        playlist.error = err.message;
        playlist.lastSync = Date.now();
      }
    }
    await write('playlists', playlists);

    if (!all.length) throw new Error('No se ha podido leer ningun contenido de las listas');

    setStatus('Organizando catalogo…', 70);
    const catalog = buildCatalog(all, { adultFilter: settings.adultFilter !== false });

    if (useTmdb && settings.tmdbApiKey) {
      setStatus('Buscando valoraciones en TMDB…', 78);
      const priority = [...catalog.movies, ...catalog.series]
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
        .slice(0, 600);
      const res = await enrich(priority, {
        apiKey: settings.tmdbApiKey,
        onProgress: (msg) => setStatus(msg, 85)
      });
      catalog.tmdb = res;
    }

    setStatus('Guardando…', 95);
    await write('catalog', catalog);

    status.result = {
      movies: catalog.movies.length,
      series: catalog.series.length,
      live: catalog.live.length,
      entries: all.length,
      playlists: active.length,
      failed: playlists.filter((p) => p.error).map((p) => ({ name: p.name, error: p.error }))
    };
    setStatus('Listo', 100);
    void favorites; void history;
    return status;
  } catch (err) {
    status.error = err.message;
    setStatus('Error', 100);
    throw err;
  } finally {
    status.running = false;
    status.finishedAt = Date.now();
  }
}
