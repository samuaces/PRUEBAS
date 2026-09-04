/** Estado compartido de la interfaz (pequeno store con suscripciones). */
import { api } from './api.js';
import { toast } from './dom.js';

const listeners = new Set();

export const state = {
  view: 'home',
  params: {},
  playlists: [],
  settings: { theme: 'system', adultFilter: true, tmdbApiKey: '' },
  counts: { movies: 0, series: 0, live: 0, builtAt: null },
  favorites: [],
  favoriteIds: new Set(),
  history: [],
  sync: { running: false, step: '', progress: 0 },
  ready: false
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change') {
  for (const fn of listeners) fn(state, reason);
}

function indexFavorites() {
  state.favoriteIds = new Set(state.favorites.map((f) => f.id));
}

/** Carga el estado inicial desde el servidor. */
export async function refreshState() {
  const data = await api.state();
  Object.assign(state, {
    playlists: data.playlists,
    settings: data.settings,
    counts: data.counts,
    favorites: data.favorites,
    history: data.history,
    sync: data.sync,
    ready: true
  });
  indexFavorites();
  applyTheme(state.settings.theme);
  emit('state');
  return state;
}

export const isFavorite = (id) => state.favoriteIds.has(id);

/** Anyade o quita de favoritos y avisa a la interfaz. */
export async function toggleFavorite(item) {
  const active = isFavorite(item.id);
  try {
    const res = active
      ? await api.removeFavorite(item.id)
      : await api.addFavorite({
          id: item.id,
          type: item.type,
          title: item.title,
          poster: item.poster || item.logo || '',
          url: item.url || ''
        });
    state.favorites = res.items;
    indexFavorites();
    emit('favorites');
    toast(active ? 'Quitado de favoritos' : 'Añadido a favoritos');
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
  return !active;
}

/** Guarda la posicion de reproduccion para "continuar viendo". */
export async function saveProgress(entry) {
  try {
    const res = await api.saveProgress(entry);
    state.history = res.items;
    emit('history');
  } catch { /* el historial es accesorio: no interrumpe la reproduccion */ }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/** Navegacion por hash: #/peliculas, #/serie/<id>, … */
export function navigate(view, params = {}) {
  const query = new URLSearchParams(params).toString();
  location.hash = `#/${view}${query ? `?${query}` : ''}`;
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return {
    view: path || 'home',
    params: Object.fromEntries(new URLSearchParams(query || ''))
  };
}
