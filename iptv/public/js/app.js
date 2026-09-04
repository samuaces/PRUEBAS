/** Arranque de la app: estructura, navegacion y sincronizacion. */
import { el, clear, icon, toast, debounce, formatCount } from './dom.js';
import { api } from './api.js';
import { state, subscribe, refreshState, navigate, parseHash } from './state.js';
import { closeSheet } from './components.js';
import { catalogView, favoritesView, homeView, liveView, recommendationsView, searchView, settingsView, startSync } from './views.js';

const NAV = [
  { id: 'home', label: 'Inicio', icon: 'home' },
  { id: 'recomendados', label: 'Recomendados', icon: 'sparkle' },
  { id: 'peliculas', label: 'Películas', icon: 'film', count: 'movies' },
  { id: 'series', label: 'Series', icon: 'stack', count: 'series' },
  { id: 'tv', label: 'TV en directo', icon: 'tv', count: 'live' },
  { id: 'favoritos', label: 'Favoritos', icon: 'heart' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' }
];

const MOBILE_NAV = ['home', 'peliculas', 'series', 'tv', 'favoritos'];

const VIEWS = {
  home: homeView,
  recomendados: recommendationsView,
  peliculas: () => catalogView('movie'),
  series: () => catalogView('series'),
  tv: liveView,
  favoritos: favoritesView,
  buscar: searchView,
  ajustes: settingsView
};

const app = document.getElementById('app');
const sidebar = el('aside', { class: 'sidebar' });
const content = el('div', { class: 'content' });
const contentInner = el('div', { class: 'content-inner' });
content.append(contentInner);

const searchInput = el('input', {
  type: 'search',
  placeholder: 'Buscar películas, series o canales…',
  autocomplete: 'off',
  spellcheck: false
});

const syncButton = el('button', { class: 'icon-button', title: 'Sincronizar listas', onclick: startSync }, icon('refresh'));

// Boton de instalar: solo aparece si el navegador permite instalar la app.
let installPrompt = null;
const installButton = el('button', {
  class: 'button secondary install-button',
  hidden: true,
  onclick: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') installButton.hidden = true;
    installPrompt = null;
  }
}, 'Instalar app');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
window.addEventListener('appinstalled', () => {
  installButton.hidden = true;
  toast('Mi IPTV instalada. Ya la tienes con su propio icono.');
});

const topbar = el('header', { class: 'topbar' },
  el('div', { class: 'search-field' },
    icon('search'),
    searchInput,
    el('button', { class: 'clear', title: 'Limpiar', onclick: () => { searchInput.value = ''; navigate('home'); } }, '×')
  ),
  installButton,
  syncButton
);

const mobileTabs = el('nav', { class: 'mobile-tabs' });
app.append(sidebar, el('main', { class: 'main' }, topbar, content), mobileTabs);

/* ------------------------------ Navegacion ------------------------------- */

function renderNav() {
  clear(sidebar);
  sidebar.append(el('div', { class: 'brand' }, el('span', { class: 'dot' }, '▶'), 'Mi IPTV'));

  const current = parseHash().view;
  for (const item of NAV) {
    if (item.id === 'ajustes') sidebar.append(el('div', { class: 'nav-group-title' }, 'Biblioteca'));
    const count = item.count ? state.counts[item.count] : (item.id === 'favoritos' ? state.favorites.length : null);
    sidebar.append(el('button', {
      class: `nav-item ${current === item.id ? 'active' : ''}`,
      onclick: () => navigate(item.id)
    }, icon(item.icon), item.label, count ? el('span', { class: 'nav-count' }, formatCount(count)) : null));
  }

  sidebar.append(el('div', { class: 'sidebar-footer' }, syncCard()));

  clear(mobileTabs);
  for (const id of MOBILE_NAV) {
    const item = NAV.find((n) => n.id === id);
    mobileTabs.append(el('button', {
      class: current === id ? 'active' : '',
      onclick: () => navigate(id)
    }, icon(item.icon), item.label));
  }
}

function syncCard() {
  const { sync, counts } = state;
  if (sync.running) {
    return el('div', { class: 'sync-card' },
      el('strong', {}, 'Sincronizando'),
      sync.step,
      el('div', { class: 'progress' }, el('i', { style: { width: `${sync.progress}%` } }))
    );
  }
  if (sync.error) {
    return el('div', { class: 'sync-card' }, el('strong', {}, 'Error al sincronizar'), sync.error);
  }
  if (!counts.builtAt) {
    return el('div', { class: 'sync-card' },
      el('strong', {}, 'Sin listas'),
      'Añade tu primera lista en Ajustes para empezar.');
  }
  return el('div', { class: 'sync-card' },
    el('strong', {}, `${formatCount(counts.movies + counts.series + counts.live)} títulos`),
    `${formatCount(counts.movies)} pelis · ${formatCount(counts.series)} series · ${formatCount(counts.live)} canales`);
}

let renderToken = 0;

async function render() {
  const { view, params } = parseHash();
  state.view = view;
  state.params = params;
  closeSheet();
  renderNav();

  if (view === 'buscar' && searchInput.value !== (params.q || '')) searchInput.value = params.q || '';

  const token = ++renderToken;
  const factory = VIEWS[view] || homeView;
  try {
    const node = await factory();
    if (token !== renderToken) return;
    clear(contentInner).append(node);
    content.scrollTop = 0;
  } catch (err) {
    if (token !== renderToken) return;
    clear(contentInner).append(el('div', { class: 'empty' },
      el('div', { class: 'emoji' }, '⚠️'),
      el('h3', {}, 'Algo ha fallado'),
      el('p', {}, err.message)));
  }
}

/* ------------------------------ Buscador --------------------------------- */

const runSearch = debounce(() => {
  const term = searchInput.value.trim();
  if (!term) {
    if (parseHash().view === 'buscar') navigate('home');
    return;
  }
  navigate('buscar', { q: term });
}, 260);

searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { searchInput.value = ''; searchInput.blur(); navigate('home'); }
});

document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if ((event.key === '/' || (event.key === 'k' && (event.metaKey || event.ctrlKey))) && !typing) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

/* --------------------------- Sincronizacion ------------------------------ */

let pollTimer = null;

function pollSync() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const { status } = await api.syncStatus();
      const wasRunning = state.sync.running;
      state.sync = status;
      syncButton.classList.toggle('spinning', Boolean(status.running));
      renderNav();
      if (wasRunning && !status.running) {
        await refreshState();
        if (status.error) toast(status.error, { type: 'error' });
        else {
          const r = status.result;
          toast(r ? `Listo: ${formatCount(r.movies)} pelis, ${formatCount(r.series)} series, ${formatCount(r.live)} canales` : 'Sincronización completada');
          if (r?.failed?.length) toast(`No se pudo leer: ${r.failed.map((f) => f.name).join(', ')}`, { type: 'error' });
        }
        render();
      }
    } catch { /* el servidor puede estar reiniciandose */ }
  }, 1500);
}

/* -------------------------------- Arranque ------------------------------- */

subscribe((_, reason) => {
  if (reason === 'favorites' || reason === 'state') renderNav();
});

window.addEventListener('hashchange', render);

/** Pantalla completa para cuando la app se abre y el servidor no esta en marcha. */
function serverDownScreen(message) {
  const retry = el('button', { class: 'button', onclick: () => location.reload() }, 'Reintentar');
  return el('div', { class: 'empty', style: { paddingTop: '90px' } },
    el('div', { class: 'emoji' }, '🔌'),
    el('h3', {}, 'Mi IPTV no está arrancado'),
    el('p', {}, 'Abre la app con el lanzador («Iniciar Mi IPTV») y vuelve a intentarlo.'),
    el('p', { style: { fontSize: '12.5px', opacity: '0.7' } }, message),
    el('div', { style: { marginTop: '12px' } }, retry));
}

/** El service worker es lo que permite instalarla como app con icono propio. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* sin instalacion, la app funciona igual */ });
}

(async function start() {
  let online = true;
  try {
    await refreshState();
  } catch (err) {
    online = false;
    // "Failed to fetch" no le dice nada a nadie: se traduce el caso habitual.
    const detail = /fetch|network/i.test(err.message) ? 'No hay respuesta en la dirección de la app.' : err.message;
    clear(contentInner).append(serverDownScreen(detail));
    renderNav();
  }
  if (!online) return;
  if (!location.hash) location.hash = '#/home';
  await render();
  pollSync();
  registerServiceWorker();
})();
