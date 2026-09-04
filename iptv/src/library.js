/**
 * Construccion del catalogo unificado a partir de las entradas de todas las listas,
 * mas busqueda y recomendaciones.
 */
import { classify, cleanTitle, extractTags, extractYear, isAdult, parseEpisode, slugify } from './parse.js';

const bestOf = (a, b) => (b === null || b === undefined || b === '' ? a : (a === null || a === undefined || a === '' ? b : a));

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

/**
 * Agrupa entradas crudas en peliculas, series y canales.
 * @param {Array} entries entradas con { title, url, attrs, playlistId, playlistName, forcedType?, provider? }
 * @param {{ adultFilter?: boolean }} options
 */
export function buildCatalog(entries, { adultFilter = true } = {}) {
  const movies = new Map();
  const series = new Map();
  const live = [];
  const liveSeen = new Set();

  for (const entry of entries) {
    if (adultFilter && isAdult(entry)) continue;
    const type = entry.forcedType || classify(entry);
    const group = entry.attrs?.['group-title'] || '';
    const logo = entry.attrs?.['tvg-logo'] || entry.provider?.poster || '';

    if (type === 'live') {
      const title = cleanTitle(entry.title) || entry.title;
      const key = `${slugify(title)}|${entry.url}`;
      if (liveSeen.has(key)) continue;
      liveSeen.add(key);
      live.push({
        id: `live:${slugify(title)}:${live.length}`,
        type: 'live',
        title,
        rawTitle: entry.title,
        logo,
        group: group || 'Otros',
        tvgId: entry.attrs?.['tvg-id'] || '',
        tags: extractTags(entry.title),
        url: entry.url,
        playlistId: entry.playlistId,
        playlistName: entry.playlistName
      });
      continue;
    }

    if (type === 'series') {
      const parsed = entry.season != null && entry.episode != null
        ? { show: entry.show || cleanTitle(entry.title), season: entry.season, episode: entry.episode, episodeTitle: entry.episodeTitle || '' }
        : parseEpisode(entry.title);
      const showRaw = parsed?.show || entry.show || entry.title;
      const showTitle = cleanTitle(showRaw) || showRaw;
      const id = `series:${slugify(showTitle)}`;
      let show = series.get(id);
      if (!show) {
        show = {
          id,
          type: 'series',
          title: showTitle,
          poster: logo,
          groups: [],
          genres: [],
          plot: '',
          rating: null,
          year: null,
          addedAt: null,
          seasons: {},
          episodeCount: 0,
          playlists: []
        };
        series.set(id, show);
      }
      show.poster = bestOf(show.poster, logo);
      show.rating = bestOf(show.rating, entry.provider?.rating ?? null);
      show.year = bestOf(show.year, entry.provider?.year ?? extractYear(entry.title));
      show.plot = bestOf(show.plot, entry.provider?.plot || '');
      show.addedAt = Math.max(show.addedAt || 0, entry.provider?.added || 0) || null;
      pushUnique(show.groups, group);
      pushUnique(show.playlists, entry.playlistName);
      for (const g of entry.provider?.genres || []) pushUnique(show.genres, g);

      if (!entry.url) continue;
      const season = String(parsed?.season ?? 1);
      const epNumber = parsed?.episode ?? 1;
      const bucket = (show.seasons[season] ||= []);
      if (!bucket.some((e) => e.episode === epNumber && e.url === entry.url)) {
        bucket.push({
          episode: epNumber,
          title: parsed?.episodeTitle || '',
          url: entry.url,
          still: entry.still || '',
          tags: extractTags(entry.title),
          playlistId: entry.playlistId
        });
        show.episodeCount += 1;
      }
      continue;
    }

    // Pelicula
    const title = cleanTitle(entry.title) || entry.title;
    const year = entry.provider?.year ?? extractYear(entry.title);
    const id = `movie:${slugify(title)}${year ? `-${year}` : ''}`;
    let movie = movies.get(id);
    if (!movie) {
      movie = {
        id,
        type: 'movie',
        title,
        year: year || null,
        poster: logo,
        groups: [],
        genres: [],
        plot: '',
        rating: null,
        addedAt: null,
        sources: [],
        playlists: []
      };
      movies.set(id, movie);
    }
    movie.poster = bestOf(movie.poster, logo);
    movie.rating = bestOf(movie.rating, entry.provider?.rating ?? null);
    movie.plot = bestOf(movie.plot, entry.provider?.plot || '');
    movie.addedAt = Math.max(movie.addedAt || 0, entry.provider?.added || 0) || null;
    pushUnique(movie.groups, group);
    pushUnique(movie.playlists, entry.playlistName);
    for (const g of entry.provider?.genres || []) pushUnique(movie.genres, g);
    if (entry.url && !movie.sources.some((s) => s.url === entry.url)) {
      movie.sources.push({
        url: entry.url,
        label: extractTags(entry.title).join(' · ') || entry.playlistName || 'Fuente',
        tags: extractTags(entry.title),
        playlistId: entry.playlistId
      });
    }
  }

  for (const show of series.values()) {
    for (const key of Object.keys(show.seasons)) {
      show.seasons[key].sort((a, b) => a.episode - b.episode);
    }
    show.seasonCount = Object.keys(show.seasons).length;
    show.groups = show.groups.filter(Boolean);
  }
  for (const movie of movies.values()) movie.groups = movie.groups.filter(Boolean);

  const byTitle = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
  return {
    movies: [...movies.values()].sort(byTitle),
    series: [...series.values()].sort(byTitle),
    live: live.sort((a, b) => a.group.localeCompare(b.group, 'es') || byTitle(a, b)),
    builtAt: Date.now()
  };
}

export function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

/** Busqueda por tokens sobre titulo, grupo y generos, con ranking simple. */
export function search(catalog, query, { types, limit = 60 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const wanted = types?.length ? new Set(types) : null;
  const pools = [
    ['movie', catalog.movies],
    ['series', catalog.series],
    ['live', catalog.live]
  ];
  const results = [];

  for (const [type, items] of pools) {
    if (wanted && !wanted.has(type)) continue;
    for (const item of items) {
      const title = normalize(item.title);
      const haystack = `${title} ${normalize((item.groups || [item.group]).join(' '))} ${normalize((item.genres || []).join(' '))}`;
      if (!tokens.every((t) => haystack.includes(t))) continue;
      let score = 0;
      if (title === q) score += 100;
      else if (title.startsWith(q)) score += 60;
      else if (title.includes(q)) score += 40;
      if (tokens.every((t) => title.includes(t))) score += 20;
      score += Math.min(Number(item.rating) || 0, 10);
      if (type === 'series') score += 4; // las series suelen ser lo que se busca por nombre
      results.push({ ...item, _score: score });
    }
  }

  return results.sort((a, b) => b._score - a._score).slice(0, limit).map(({ _score, ...rest }) => rest);
}

const RECENT_WEIGHT_DAYS = 120;

/**
 * Recomendaciones: valoracion como eje principal, ajustada por afinidad con
 * los favoritos (generos y categorias) y por novedad.
 */
export function recommend(catalog, { favorites = [], history = [], limit = 24, type } = {}) {
  const favIds = new Set(favorites.map((f) => f.id));
  const seenIds = new Set(history.map((h) => h.id));
  const genreScore = new Map();
  const groupScore = new Map();

  const collect = (item, weight) => {
    for (const g of item?.genres || []) genreScore.set(normalize(g), (genreScore.get(normalize(g)) || 0) + weight);
    for (const g of item?.groups || []) groupScore.set(normalize(g), (groupScore.get(normalize(g)) || 0) + weight);
  };
  const index = new Map([...catalog.movies, ...catalog.series].map((i) => [i.id, i]));
  for (const f of favorites) collect(index.get(f.id), 2);
  for (const h of history) collect(index.get(h.id), 1);

  const pool = [];
  if (type !== 'series') pool.push(...catalog.movies);
  if (type !== 'movie') pool.push(...catalog.series);

  const now = Date.now();
  const scored = pool.map((item) => {
    const rating = Number(item.rating) || 0;
    let score = rating * 10;                       // 0-100 por valoracion
    if (!rating) score = 35;                        // sin datos: ni penalizado ni premiado
    let affinity = 0;
    for (const g of item.genres || []) affinity += genreScore.get(normalize(g)) || 0;
    for (const g of item.groups || []) affinity += (groupScore.get(normalize(g)) || 0) * 0.5;
    score += Math.min(affinity, 10) * 4;            // hasta +40 por afinidad
    if (item.addedAt) {
      const days = (now - item.addedAt) / 86400000;
      if (days < RECENT_WEIGHT_DAYS) score += (1 - days / RECENT_WEIGHT_DAYS) * 15;
    }
    if (item.year && item.year >= new Date().getFullYear() - 3) score += 6;
    if (item.type === 'series' && item.episodeCount > 8) score += 4;
    if (favIds.has(item.id)) score -= 1000;         // ya lo tienes guardado
    if (seenIds.has(item.id)) score -= 25;
    if (!item.poster) score -= 6;
    return { item, score, affinity };
  });

  return scored
    .filter((s) => s.score > -100)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item, score, affinity }) => ({
      ...item,
      recommendation: {
        score: Math.round(score),
        reason: affinity > 0
          ? 'Encaja con lo que sueles ver'
          : Number(item.rating) >= 7 ? 'Muy bien valorada'
          : item.addedAt && now - item.addedAt < RECENT_WEIGHT_DAYS * 86400000 ? 'Novedad en tus listas'
          : 'Puede que te guste'
      }
    }));
}

/** Agrupa una lista de canales por su categoria. */
export function groupChannels(channels) {
  const groups = new Map();
  for (const channel of channels) {
    const key = channel.group || 'Otros';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(channel);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'es'));
}
