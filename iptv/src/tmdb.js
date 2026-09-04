/**
 * Enriquecimiento opcional con TMDB: valoraciones, sinopsis, generos y caratulas.
 * Sin clave configurada la app funciona igual, solo con los datos de la lista.
 */
import { read, write } from './store.js';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // el catalogo de TMDB cambia poco

const key = (type, title, year) => `${type}:${String(title).toLowerCase()}:${year || ''}`;

async function tmdbSearch(apiKey, type, title, year, language) {
  const url = new URL(`${BASE}/search/${type === 'series' ? 'tv' : 'movie'}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', title);
  url.searchParams.set('language', language);
  url.searchParams.set('include_adult', 'false');
  if (year) url.searchParams.set(type === 'series' ? 'first_air_date_year' : 'year', String(year));

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 401) throw new Error('Clave de TMDB no valida');
  if (!res.ok) throw new Error(`TMDB respondio ${res.status}`);
  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    tmdbId: hit.id,
    rating: hit.vote_average ? Number(hit.vote_average.toFixed(1)) : null,
    votes: hit.vote_count || 0,
    plot: hit.overview || '',
    poster: hit.poster_path ? `${IMG}/w500${hit.poster_path}` : '',
    backdrop: hit.backdrop_path ? `${IMG}/w1280${hit.backdrop_path}` : '',
    year: Number(String(hit.release_date || hit.first_air_date || '').slice(0, 4)) || null,
    genreIds: hit.genre_ids || [],
    fetchedAt: Date.now()
  };
}

let genreCache = null;
async function genreNames(apiKey, language) {
  if (genreCache) return genreCache;
  const load = async (kind) => {
    const url = new URL(`${BASE}/genre/${kind}/list`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', language);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    return (await res.json()).genres || [];
  };
  const [movie, tv] = await Promise.all([load('movie'), load('tv')]);
  genreCache = new Map([...movie, ...tv].map((g) => [g.id, g.name]));
  return genreCache;
}

/**
 * Completa items del catalogo con datos de TMDB.
 * @returns {{ enriched: number, skipped: number, errors: string[] }}
 */
export async function enrich(items, { apiKey, language = 'es-ES', max = 400, onProgress } = {}) {
  if (!apiKey) return { enriched: 0, skipped: items.length, errors: ['Falta la clave de TMDB'] };

  const cache = await read('meta');
  const genres = await genreNames(apiKey, language).catch(() => new Map());
  const now = Date.now();
  const errors = [];
  let enriched = 0;
  let skipped = 0;

  const pending = [];
  for (const item of items) {
    const k = key(item.type, item.title, item.year);
    const cached = cache[k];
    if (cached && now - (cached.fetchedAt || 0) < TTL_MS) {
      applyMeta(item, cached, genres);
      if (cached.tmdbId) enriched += 1;
      continue;
    }
    pending.push({ item, k });
  }

  const queue = pending.slice(0, max);
  skipped = items.length - queue.length - enriched;
  let done = 0;

  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;
      try {
        const meta = await tmdbSearch(apiKey, job.item.type, job.item.title, job.item.year, language);
        cache[job.k] = meta || { fetchedAt: Date.now(), tmdbId: null };
        if (meta) {
          applyMeta(job.item, meta, genres);
          enriched += 1;
        }
      } catch (err) {
        if (!errors.includes(err.message)) errors.push(err.message);
        if (/no valida/.test(err.message)) queue.length = 0;
      }
      done += 1;
      if (done % 25 === 0) onProgress?.(`Consultando TMDB… ${done}/${done + queue.length}`);
    }
  });
  await Promise.all(workers);

  await write('meta', cache);
  return { enriched, skipped, errors };
}

function applyMeta(item, meta, genres) {
  if (!meta || !meta.tmdbId) return;
  item.rating = item.rating ?? meta.rating;
  item.tmdbRating = meta.rating;
  item.votes = meta.votes;
  item.plot = item.plot || meta.plot;
  item.poster = meta.poster || item.poster;
  item.backdrop = meta.backdrop || '';
  item.year = item.year || meta.year;
  const names = (meta.genreIds || []).map((id) => genres.get(id)).filter(Boolean);
  item.genres = [...new Set([...(item.genres || []), ...names])];
}

/** Limpia la cache de metadatos. */
export async function clearCache() {
  await write('meta', {});
}
