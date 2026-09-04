/**
 * Parseo de listas M3U/M3U8 y normalizacion de titulos.
 * Todo el modulo es puro: entra texto, sale estructura.
 */

const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

/** Convierte el texto de una lista M3U en entradas crudas. */
export function parseM3U(text) {
  const lines = String(text).split(/\r?\n/);
  const entries = [];
  let pending = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const commaAt = line.indexOf(',');
      const head = commaAt === -1 ? line : line.slice(0, commaAt);
      const title = commaAt === -1 ? '' : line.slice(commaAt + 1).trim();
      const attrs = {};
      let m;
      ATTR_RE.lastIndex = 0;
      while ((m = ATTR_RE.exec(head)) !== null) attrs[m[1].toLowerCase()] = m[2];
      pending = { title: title || attrs['tvg-name'] || '', attrs, extras: {} };
      continue;
    }

    if (line.startsWith('#EXTGRP')) {
      if (pending) pending.attrs['group-title'] = line.split(':').slice(1).join(':').trim();
      continue;
    }

    if (line.startsWith('#EXTVLCOPT')) {
      const [k, ...v] = line.slice('#EXTVLCOPT:'.length).split('=');
      if (pending && k) pending.extras[k.trim()] = v.join('=').trim();
      continue;
    }

    if (line.startsWith('#')) continue;

    if (pending) {
      entries.push({ ...pending, url: line });
      pending = null;
    }
  }
  return entries;
}

const QUALITY_TAGS = /\b(4k|uhd|fhd|hd|sd|hq|hevc|h265|h\.265|x265|x264|1080p?|720p?|480p?|2160p?|dolby|atmos|dts|multi|dual|remux|bluray|web-?dl|webrip|hdrip|dvdrip|ac3|aac|10bit)\b/gi;
const LANG_TAGS = /\b(cast(ellano)?|lat(ino)?|esp|spa|eng|vose|vos|sub(titulad[oa]s?)?|dual|multi|original)\b/gi;
const COUNTRY_PREFIX = /^\s*(?:\|?\s*[A-Z]{2,4}\s*\|)\s*|^\s*[A-Z]{2,4}\s*[-:]\s+/;
const BRACKETS = /[\[(\{][^\])\}]*[\])\}]/g;
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

/** Patrones de episodio: S01E02, 1x02, "Temporada 1 Capitulo 2", "T1 E2". */
const EPISODE_PATTERNS = [
  /\bS\s?(\d{1,2})\s?[\sxE._-]?\s?E\s?(\d{1,3})\b/i,
  /\bT\s?(\d{1,2})\s?[\sxE._-]?\s?E?\s?(\d{1,3})\b/i,
  /\b(\d{1,2})\s?x\s?(\d{1,3})\b/,
  /temporada\s*(\d{1,2}).{0,12}?(?:cap[ií]tulo|episodio|ep)\s*(\d{1,3})/i
];

/** Extrae serie/temporada/episodio de un titulo, o null si no aplica. */
export function parseEpisode(title) {
  const name = String(title || '');
  for (const re of EPISODE_PATTERNS) {
    const m = name.match(re);
    if (!m) continue;
    const season = Number(m[1]);
    const episode = Number(m[2]);
    if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;
    if (season > 60 || episode > 999) continue;
    const show = name.slice(0, m.index).replace(/[\s\-–—_:.]+$/, '').trim();
    const epTitle = name.slice(m.index + m[0].length).replace(/^[\s\-–—_:.]+/, '').trim();
    return { show: show || name, season, episode, episodeTitle: epTitle };
  }
  return null;
}

/** Devuelve el anyo si aparece en el titulo (y no es parte del nombre). */
export function extractYear(title) {
  const m = String(title || '').match(YEAR_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const now = new Date().getFullYear() + 2;
  return year >= 1900 && year <= now ? year : null;
}

/** Limpia un titulo de prefijos de pais, calidad, idioma y anyo. */
export function cleanTitle(raw) {
  let title = String(raw || '').trim();
  title = title.replace(COUNTRY_PREFIX, '');
  title = title.replace(BRACKETS, ' ');
  title = title.replace(QUALITY_TAGS, ' ');
  // Los tags de idioma solo estorban al final del titulo ("Interstellar CAST").
  for (let i = 0; i < 4; i++) {
    const stripped = title.replace(/[\s\-–—|:.]*\b(cast(ellano)?|lat(ino)?|esp|spa|eng|vose|vos|sub(titulad[oa]s?)?|dual|multi|original)\b[\s\-–—|:.]*$/i, '');
    if (stripped === title) break;
    title = stripped;
  }
  title = title.replace(/\s[-–—|]\s*(?:$|(?=\s))/g, ' ');
  title = title.replace(YEAR_RE, ' ');
  title = title.replace(/[._]+/g, ' ');
  title = title.replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/^[\s\-–—|:.]+|[\s\-–—|:.]+$/g, '').trim();
  return title || String(raw || '').trim();
}

/** Etiquetas de calidad/idioma detectadas, para distinguir fuentes duplicadas. */
export function extractTags(raw) {
  const text = String(raw || '');
  const tags = new Set();
  for (const m of text.matchAll(QUALITY_TAGS)) tags.add(m[0].toUpperCase());
  for (const m of text.matchAll(LANG_TAGS)) tags.add(m[0].toUpperCase());
  return [...tags].slice(0, 6);
}

/** Clave estable para agrupar el mismo titulo llegando de varias fuentes. */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sin-titulo';
}

const VIDEO_EXT = /\.(mp4|mkv|avi|m4v|mov|mpg|mpeg|wmv|flv)(\?.*)?$/i;
const SERIES_GROUP = /(series?|s[ée]ries|tv ?show|temporadas?|anime|novelas?|doramas?)/i;
const MOVIE_GROUP = /(pel[ií]culas?|peliculas|movies?|cine|film|vod|estrenos?|documental)/i;
const LIVE_GROUP = /(canal(es)?|tv|directo|live|deportes?|sports?|noticias?|news|24 ?h|radio)/i;
const ADULT_RE = /(\bxxx\b|adult|porn|erotic|\+18|hot ?tv)/i;

/** Clasifica una entrada en 'series' | 'movie' | 'live'. */
export function classify(entry) {
  const group = entry.attrs?.['group-title'] || '';
  const url = entry.url || '';
  const path = url.split('?')[0];

  if (/\/series\//i.test(path)) return 'series';
  if (/\/movie(s)?\//i.test(path)) return 'movie';
  if (/\/live\//i.test(path)) return 'live';

  const isEpisode = Boolean(parseEpisode(entry.title));
  if (isEpisode) return 'series';
  if (SERIES_GROUP.test(group) && !LIVE_GROUP.test(group)) return 'series';
  if (MOVIE_GROUP.test(group)) return 'movie';
  if (VIDEO_EXT.test(path)) return 'movie';
  return 'live';
}

export function isAdult(entry) {
  return ADULT_RE.test(entry.attrs?.['group-title'] || '') || ADULT_RE.test(entry.title || '');
}
