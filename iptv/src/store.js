import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = join(ROOT, 'data');

const DEFAULTS = {
  playlists: [],   // { id, name, kind: 'm3u'|'xtream', url?, host?, username?, password?, addedAt, lastSync, itemCount, error }
  favorites: [],   // { id, type, title, poster, addedAt }
  history: [],     // { id, type, title, poster, at, position, duration }
  settings: { tmdbApiKey: '', theme: 'system', adultFilter: true, region: 'ES' },
  catalog: { movies: [], series: [], live: [], builtAt: null },
  meta: {}         // cache TMDB: "movie:titulo:anyo" -> { rating, votes, overview, poster, backdrop, genres, year }
};

const files = {
  playlists: 'playlists.json',
  favorites: 'favorites.json',
  history: 'history.json',
  settings: 'settings.json',
  catalog: 'catalog.json',
  meta: 'meta-cache.json'
};

const cache = new Map();
const queues = new Map();

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

/** Lee una coleccion del disco (con cache en memoria). */
export async function read(key) {
  if (cache.has(key)) return cache.get(key);
  await ensureDir();
  let value;
  try {
    const raw = await readFile(join(DATA_DIR, files[key]), 'utf8');
    value = JSON.parse(raw);
  } catch {
    value = structuredClone(DEFAULTS[key]);
  }
  if (key === 'settings') value = { ...DEFAULTS.settings, ...value };
  cache.set(key, value);
  return value;
}

/** Escribe de forma atomica y encadenada para no pisar escrituras concurrentes. */
export async function write(key, value) {
  cache.set(key, value);
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(async () => {
    await ensureDir();
    const target = join(DATA_DIR, files[key]);
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await rename(tmp, target);
  }).catch((err) => console.error(`[store] error guardando ${key}:`, err.message));
  queues.set(key, next);
  await next;
  return value;
}

/** Lee, muta y guarda en un solo paso. */
export async function update(key, mutator) {
  const current = await read(key);
  const result = mutator(current) ?? current;
  await write(key, result);
  return result;
}
