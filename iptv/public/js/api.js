/** Cliente de la API local. */

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  // Sesión caducada en una copia protegida con contraseña: de vuelta al acceso.
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    location.href = '/';
    throw new Error('Sesión caducada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, String(v));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  state: () => request('/api/state'),
  catalog: (params) => request(`/api/catalog${qs(params)}`),
  groups: (type) => request(`/api/groups${qs({ type })}`),
  item: (id) => request(`/api/item${qs({ id })}`),
  search: (q, type) => request(`/api/search${qs({ q, type })}`),
  recommendations: (params) => request(`/api/recommendations${qs(params)}`),

  favorites: () => request('/api/favorites'),
  addFavorite: (item) => request('/api/favorites', { method: 'POST', body: item }),
  removeFavorite: (id) => request(`/api/favorites${qs({ id })}`, { method: 'DELETE' }),

  saveProgress: (entry) => request('/api/history', { method: 'POST', body: entry }),
  clearHistory: () => request('/api/history', { method: 'DELETE' }),

  addPlaylist: (playlist) => request('/api/playlists', { method: 'POST', body: playlist }),
  patchPlaylist: (id, patch) => request('/api/playlists', { method: 'PATCH', body: { id, patch } }),
  removePlaylist: (id) => request(`/api/playlists${qs({ id })}`, { method: 'DELETE' }),

  sync: () => request('/api/sync', { method: 'POST' }),
  syncStatus: () => request('/api/sync'),
  saveSettings: (settings) => request('/api/settings', { method: 'POST', body: settings }),
  clearMetaCache: () => request('/api/meta-cache', { method: 'DELETE' })
};

/** Todo el video pasa por el proxy local: evita CORS y cabeceras rechazadas. */
export const proxied = (url) => `/api/proxy?url=${encodeURIComponent(url)}`;
