/** Vistas principales de la app. Cada funcion devuelve el nodo de la pagina. */
import { el, clear, append, icon, toast, formatCount, timeAgo, debounce } from './dom.js';
import { api } from './api.js';
import { state, navigate, refreshState, toggleFavorite, applyTheme } from './state.js';
import { card, channelRow, rail, empty, skeletonGrid, openDetail } from './components.js';
import { play } from './player.js';

const head = (title, subtitle) => el('div', { class: 'page-head' },
  el('h1', { class: 'page-title' }, title),
  subtitle ? el('p', { class: 'page-sub' }, subtitle) : null
);

const needsPlaylist = () => !state.counts.movies && !state.counts.series && !state.counts.live;

const noLibrary = () => empty('📺', 'Aún no hay contenido',
  'Añade tu primera lista (M3U o Xtream) en Ajustes y sincroniza: la app organizará sola películas, series y canales.',
  { label: 'Ir a Ajustes', onClick: () => navigate('ajustes') });

/* ================================  Inicio  =============================== */

export async function homeView() {
  const page = el('div', {});
  if (needsPlaylist()) return page.appendChild(noLibrary()), page;

  page.append(el('div', { class: 'skeleton', style: { height: '320px', marginBottom: '30px' } }), skeletonGrid(6));

  const [recs, topMovies, topSeries, recent] = await Promise.all([
    api.recommendations({ limit: 20 }).then((r) => r.items).catch(() => []),
    api.catalog({ type: 'movie', sort: 'rating', size: 20 }).then((r) => r.items).catch(() => []),
    api.catalog({ type: 'series', sort: 'rating', size: 20 }).then((r) => r.items).catch(() => []),
    api.catalog({ type: 'movie', sort: 'recent', size: 20 }).then((r) => r.items).catch(() => [])
  ]);

  clear(page);
  const featured = recs[0];
  if (featured) page.append(heroBlock(featured));

  const continueItems = state.history
    .filter((h) => h.duration && h.position / h.duration < 0.95)
    .slice(0, 12)
    .map((h) => ({ ...h, id: h.id, title: h.title, poster: h.poster, type: h.type }));

  append(page,
    rail('Continuar viendo', continueItems, { subtitle: 'Donde lo dejaste' }),
    rail('Recomendado para ti', recs.slice(1, 19), {
      subtitle: 'Según valoraciones y tus favoritos',
      showReason: true,
      action: { label: 'Ver todo', onClick: () => navigate('recomendados') }
    }),
    rail('Películas mejor valoradas', topMovies, { action: { label: 'Ver todo', onClick: () => navigate('peliculas', { sort: 'rating' }) } }),
    rail('Series mejor valoradas', topSeries, { action: { label: 'Ver todo', onClick: () => navigate('series', { sort: 'rating' }) } }),
    rail('Añadido recientemente', recent),
    favouriteChannelsRail()
  );

  if (!page.children.length) page.append(empty('✨', 'Todo listo', 'Sincroniza tus listas para ver aquí tus recomendaciones.'));
  return page;
}

function heroBlock(item) {
  const hero = el('div', { class: 'hero' });
  const src = item.backdrop || item.poster;
  if (src) {
    const img = el('img', { src, alt: '', referrerPolicy: 'no-referrer' });
    const layer = el('div', { class: 'backdrop' }, img);
    img.addEventListener('error', () => layer.remove());
    hero.append(layer);
  }

  const metaBits = [];
  if (item.rating) metaBits.push(`★ ${Number(item.rating).toFixed(1)}`);
  if (item.year) metaBits.push(String(item.year));
  if (item.type === 'series' && item.seasonCount) metaBits.push(`${item.seasonCount} temporadas`);
  if (item.genres?.length) metaBits.push(item.genres.slice(0, 3).join(' · '));

  hero.append(el('div', { class: 'hero-body' },
    el('div', { class: 'eyebrow' }, item.recommendation?.reason || 'Destacado para ti'),
    el('h2', {}, item.title),
    el('div', { class: 'hero-meta' }, metaBits.map((b) => el('span', {}, b))),
    item.plot ? el('p', {}, item.plot) : null,
    el('div', { class: 'actions' },
      el('button', { class: 'button', style: { display: 'inline-flex', alignItems: 'center', gap: '7px' }, onclick: () => openDetail(item) },
        icon('play', { filled: true }), 'Reproducir'),
      el('button', { class: 'button secondary', onclick: () => openDetail(item) }, 'Más información')
    )
  ));
  return hero;
}

function favouriteChannelsRail() {
  const channels = state.favorites.filter((f) => f.type === 'live').slice(0, 12);
  if (!channels.length) return null;
  return el('section', { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', { class: 'section-title' }, 'Tus canales'),
      el('button', { class: 'section-action', onclick: () => navigate('favoritos') }, 'Ver todo')),
    el('div', { class: 'channel-list' }, channels.map((c) => channelRow({ ...c, group: c.group || 'Favorito' })))
  );
}

/* =========================  Peliculas y series  ========================== */

const SORTS = [
  ['title', 'A-Z'],
  ['rating', 'Valoración'],
  ['recent', 'Recientes'],
  ['year', 'Año']
];

export async function catalogView(type) {
  const isMovie = type === 'movie';
  const page = el('div', {});
  if (needsPlaylist()) return page.appendChild(noLibrary()), page;

  const params = { sort: state.params.sort || 'title', group: state.params.group || '', genre: state.params.genre || '' };
  append(page, head(isMovie ? 'Películas' : 'Series',
    `${formatCount(isMovie ? state.counts.movies : state.counts.series)} títulos en tu biblioteca`));

  const sorter = el('div', { class: 'segmented' }, SORTS.map(([value, label]) =>
    el('button', {
      class: params.sort === value ? 'active' : '',
      onclick: () => { params.sort = value; sorter.querySelectorAll('button').forEach((b) => b.classList.remove('active')); sorter.querySelector(`button:nth-child(${SORTS.findIndex((s) => s[0] === value) + 1})`).classList.add('active'); reload(); }
    }, label)));

  const filters = el('div', { class: 'chips' });
  const gridWrap = el('div', {}, skeletonGrid(12));
  const more = el('div', { style: { display: 'grid', placeItems: 'center', padding: '20px' } });

  page.append(el('div', { class: 'toolbar' }, sorter), filters, gridWrap, more);

  api.groups(type).then(({ groups, genres }) => {
    clear(filters);
    const all = el('button', { class: 'chip active', onclick: () => { params.group = ''; params.genre = ''; markActive(all); reload(); } }, 'Todo');
    filters.append(all);
    const markActive = (node) => { filters.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); node.classList.add('active'); };
    for (const genre of (genres || []).slice(0, 18)) {
      const chip = el('button', { class: 'chip', onclick: () => { params.genre = genre.name; params.group = ''; markActive(chip); reload(); } }, `${genre.name}`);
      filters.append(chip);
    }
    for (const group of (groups || []).slice(0, 24)) {
      const chip = el('button', { class: 'chip', onclick: () => { params.group = group.name; params.genre = ''; markActive(chip); reload(); } }, `${group.name} · ${group.count}`);
      filters.append(chip);
    }
  }).catch(() => {});

  let page_ = 1;
  let loading = false;

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) { page_ = 1; clear(gridWrap).append(skeletonGrid(12)); }
    clear(more);
    try {
      const res = await api.catalog({ type, page: page_, size: 60, ...params });
      if (reset) clear(gridWrap);
      const grid = gridWrap.querySelector('.grid') && !reset ? gridWrap.querySelector('.grid') : el('div', { class: 'grid' });
      if (!grid.isConnected) gridWrap.append(grid);
      for (const item of res.items) grid.append(card(item));
      if (!res.total) clear(gridWrap).append(empty('🔍', 'Nada por aquí', 'Prueba con otro filtro o sincroniza de nuevo tus listas.'));
      else if (page_ < res.pages) {
        more.append(el('button', { class: 'button secondary', onclick: () => { page_ += 1; load(false); } }, `Cargar más (${formatCount(res.total - page_ * res.size)} restantes)`));
      }
    } catch (err) {
      clear(gridWrap).append(empty('⚠️', 'No se pudo cargar', err.message));
    } finally {
      loading = false;
    }
  }
  const reload = () => load(true);
  load(true);

  return page;
}

/* ==============================  Television  ============================= */

export async function liveView() {
  const page = el('div', {});
  if (needsPlaylist()) return page.appendChild(noLibrary()), page;

  page.append(head('TV en directo', `${formatCount(state.counts.live)} canales organizados por categoría`));

  const filters = el('div', { class: 'chips' });
  const search = el('input', { type: 'search', placeholder: 'Filtrar canales…', class: '' });
  const listWrap = el('div', {}, el('div', { class: 'channel-list' }, Array.from({ length: 8 }, () => el('div', { class: 'skeleton', style: { height: '62px' } }))));

  const field = el('div', { class: 'search-field', style: { margin: '0', maxWidth: '320px' } }, icon('search'), search);
  page.append(el('div', { class: 'toolbar' }, field), filters, listWrap);

  let group = state.params.group || '';
  let items = [];

  const render = () => {
    const term = search.value.trim().toLowerCase();
    const filtered = items.filter((c) =>
      (!group || c.group === group) && (!term || c.title.toLowerCase().includes(term)));
    clear(listWrap);
    if (!filtered.length) return listWrap.append(empty('📡', 'Ningún canal', 'Cambia de categoría o borra el filtro.'));
    // Se limita lo pintado para que listas de miles de canales no bloqueen el navegador.
    const slice = filtered.slice(0, 300);
    listWrap.append(el('div', { class: 'channel-list' }, slice.map(channelRow)));
    if (filtered.length > slice.length) {
      listWrap.append(el('p', { class: 'page-sub', style: { textAlign: 'center', padding: '18px' } },
        `Mostrando 300 de ${formatCount(filtered.length)} canales. Afina con el filtro o elige una categoría.`));
    }
  };

  search.addEventListener('input', debounce(render, 180));

  try {
    const [{ groups }, res] = await Promise.all([api.groups('live'), api.catalog({ type: 'live', size: 500, page: 1 })]);
    items = res.items;
    // Se cargan el resto de paginas en segundo plano para poder filtrar sobre todo el listado.
    (async () => {
      for (let p = 2; p <= res.pages; p += 1) {
        const next = await api.catalog({ type: 'live', size: 500, page: p });
        items = items.concat(next.items);
      }
      render();
    })();

    clear(filters);
    const all = el('button', { class: `chip ${group ? '' : 'active'}`, onclick: () => { group = ''; mark(all); render(); } }, 'Todos');
    const mark = (node) => { filters.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); node.classList.add('active'); };
    filters.append(all);
    for (const g of groups) {
      const chip = el('button', { class: `chip ${group === g.name ? 'active' : ''}`, onclick: () => { group = g.name; mark(chip); render(); } }, `${g.name} · ${g.count}`);
      filters.append(chip);
    }
    render();
  } catch (err) {
    clear(listWrap).append(empty('⚠️', 'No se pudieron cargar los canales', err.message));
  }

  return page;
}

/* ==============================  Favoritos  ============================== */

export async function favoritesView() {
  const page = el('div', {}, head('Favoritos', 'Lo que has guardado, siempre a mano'));
  const favorites = state.favorites;
  if (!favorites.length) {
    page.append(empty('❤️', 'Todavía no hay favoritos', 'Pulsa el corazón en cualquier película, serie o canal para guardarlo aquí.'));
    return page;
  }

  const movies = favorites.filter((f) => f.type === 'movie');
  const series = favorites.filter((f) => f.type === 'series');
  const channels = favorites.filter((f) => f.type === 'live');

  if (series.length) append(page, section('Series', el('div', { class: 'grid' }, series.map((i) => card(i)))));
  if (movies.length) page.append(section('Películas', el('div', { class: 'grid' }, movies.map((i) => card(i)))));
  if (channels.length) page.append(section('Canales', el('div', { class: 'channel-list' }, channels.map((c) => channelRow({ ...c, group: c.group || 'Favorito' })))));
  return page;
}

const section = (title, content) => el('section', { class: 'section' },
  el('div', { class: 'section-head' }, el('h2', { class: 'section-title' }, title)), content);

/* ===========================  Recomendaciones  =========================== */

export async function recommendationsView() {
  const page = el('div', {}, head('Recomendado para ti', 'Ordenado por valoración y afinidad con lo que ves'));
  if (needsPlaylist()) return page.appendChild(noLibrary()), page;

  const filter = el('div', { class: 'segmented' });
  const grid = el('div', {}, skeletonGrid(12));
  page.append(el('div', { class: 'toolbar' }, filter), grid);

  const load = async (type) => {
    clear(grid).append(skeletonGrid(12));
    try {
      const { items } = await api.recommendations({ limit: 60, type });
      clear(grid);
      if (!items.length) return grid.append(empty('✨', 'Sin recomendaciones todavía', 'Sincroniza tus listas y guarda algún favorito para afinar la selección.'));
      grid.append(el('div', { class: 'grid' }, items.map((item) => card(item, { showReason: true }))));
    } catch (err) {
      clear(grid).append(empty('⚠️', 'No se pudieron calcular', err.message));
    }
  };

  [['', 'Todo'], ['movie', 'Películas'], ['series', 'Series']].forEach(([value, label], index) => {
    const button = el('button', {
      class: index === 0 ? 'active' : '',
      onclick: () => { filter.querySelectorAll('button').forEach((b) => b.classList.remove('active')); button.classList.add('active'); load(value || undefined); }
    }, label);
    filter.append(button);
  });

  load();
  return page;
}

/* ==============================  Busqueda  =============================== */

export async function searchView() {
  const query = state.params.q || '';
  const page = el('div', {}, head('Buscar', query ? `Resultados para “${query}”` : 'Escribe arriba para buscar en toda tu biblioteca'));
  if (!query) return page;

  const results = el('div', {}, skeletonGrid(8));
  page.append(results);

  try {
    const { results: items } = await api.search(query);
    clear(results);
    if (!items.length) {
      results.append(empty('🔍', 'Sin resultados', `No hay nada que coincida con “${query}”. Prueba con menos palabras.`));
      return page;
    }
    const movies = items.filter((i) => i.type === 'movie');
    const series = items.filter((i) => i.type === 'series');
    const channels = items.filter((i) => i.type === 'live');
    if (series.length) results.append(section(`Series · ${series.length}`, el('div', { class: 'grid' }, series.map((i) => card(i)))));
    if (movies.length) results.append(section(`Películas · ${movies.length}`, el('div', { class: 'grid' }, movies.map((i) => card(i)))));
    if (channels.length) results.append(section(`Canales · ${channels.length}`, el('div', { class: 'channel-list' }, channels.map(channelRow))));
  } catch (err) {
    clear(results).append(empty('⚠️', 'Error al buscar', err.message));
  }
  return page;
}

/* ===============================  Ajustes  =============================== */

export async function settingsView() {
  const page = el('div', {}, head('Ajustes', 'Tus listas, tus datos. Todo se guarda solo en este equipo.'));
  append(page, playlistsPanel(), addPlaylistPanel(), preferencesPanel(), sessionPanel(), aboutPanel());
  return page;
}

function playlistsPanel() {
  const panel = el('div', { class: 'panel' },
    el('h3', {}, 'Mis listas'),
    el('p', { class: 'hint' }, 'Sincroniza cuando añadas o renueves una lista. El proceso puede tardar unos minutos con catálogos grandes.')
  );

  if (!state.playlists.length) {
    panel.append(el('p', { class: 'page-sub' }, 'Aún no has añadido ninguna lista.'));
    return panel;
  }

  for (const playlist of state.playlists) {
    const detail = playlist.error
      ? el('div', { class: 'd error' }, playlist.error)
      : el('div', { class: 'd' }, [
          playlist.kind === 'xtream' ? 'Xtream' : playlist.kind === 'file' ? 'Archivo M3U' : 'URL M3U',
          playlist.itemCount ? `${formatCount(playlist.itemCount)} entradas` : null,
          `sincronizada ${timeAgo(playlist.lastSync)}`
        ].filter(Boolean).join(' · '));

    panel.append(el('div', { class: 'playlist-row' },
      el('div', { class: 'dot-kind' }, playlist.kind === 'xtream' ? '🔑' : '📄'),
      el('div', { class: 'info' }, el('div', { class: 'n' }, playlist.name), detail),
      el('button', {
        class: 'button danger',
        onclick: async () => {
          if (!confirm(`¿Eliminar la lista "${playlist.name}"?`)) return;
          await api.removePlaylist(playlist.id);
          await refreshState();
          navigate('ajustes');
          toast('Lista eliminada');
        }
      }, 'Eliminar')
    ));
  }

  panel.append(el('div', { style: { marginTop: '14px' } },
    el('button', { class: 'button', onclick: startSync }, 'Sincronizar ahora')
  ));
  return panel;
}

async function startSync() {
  try {
    await api.sync();
    toast('Sincronizando en segundo plano…');
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

function addPlaylistPanel() {
  const panel = el('div', { class: 'panel' },
    el('h3', {}, 'Añadir lista'),
    el('p', { class: 'hint' }, 'Puedes usar una URL M3U, una cuenta Xtream Codes (servidor + usuario + contraseña) o pegar el contenido de un archivo .m3u.')
  );

  const tabs = el('div', { class: 'segmented', style: { marginBottom: '16px' } });
  const forms = el('div', {});

  const urlForm = formBlock([
    { name: 'name', label: 'Nombre', placeholder: 'Mi lista' },
    { name: 'url', label: 'URL de la lista M3U', placeholder: 'http://servidor/get.php?username=…&type=m3u_plus' }
  ], async (values) => {
    if (!values.url) throw new Error('Escribe la URL de la lista');
    await api.addPlaylist({ kind: 'm3u', ...values });
  });

  const xtreamForm = formBlock([
    { name: 'name', label: 'Nombre', placeholder: 'Mi proveedor' },
    { name: 'host', label: 'Servidor', placeholder: 'http://servidor.com:8080' },
    { name: 'username', label: 'Usuario', placeholder: 'usuario', half: true },
    { name: 'password', label: 'Contraseña', placeholder: '••••••••', type: 'password', half: true }
  ], async (values) => {
    await api.addPlaylist({ kind: 'xtream', ...values });
  });

  const pasteForm = formBlock([
    { name: 'name', label: 'Nombre', placeholder: 'Lista pegada' },
    { name: 'content', label: 'Contenido del archivo .m3u', textarea: true, placeholder: '#EXTM3U\n#EXTINF:-1 …' }
  ], async (values) => {
    if (!values.content) throw new Error('Pega el contenido de la lista');
    await api.addPlaylist({ kind: 'file', ...values });
  }, { file: true });

  const options = [['URL M3U', urlForm], ['Xtream Codes', xtreamForm], ['Pegar / archivo', pasteForm]];
  options.forEach(([label, form], index) => {
    const button = el('button', {
      class: index === 0 ? 'active' : '',
      onclick: () => {
        tabs.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        button.classList.add('active');
        clear(forms).append(form);
      }
    }, label);
    tabs.append(button);
  });
  forms.append(urlForm);

  panel.append(tabs, forms);
  return panel;
}

function formBlock(fields, onSubmit, { file = false } = {}) {
  const inputs = {};
  const wrap = el('div', {});
  let row = null;

  for (const field of fields) {
    const input = field.textarea
      ? el('textarea', { placeholder: field.placeholder || '' })
      : el('input', { type: field.type || 'text', placeholder: field.placeholder || '' });
    inputs[field.name] = input;
    const block = el('div', { class: 'field' }, el('label', {}, field.label), input);
    if (field.half) {
      if (!row) { row = el('div', { class: 'field-row' }); wrap.append(row); }
      row.append(block);
      if (row.children.length === 2) row = null;
    } else {
      wrap.append(block);
    }
  }

  if (file) {
    const picker = el('input', { type: 'file', accept: '.m3u,.m3u8,text/plain', style: { display: 'none' } });
    picker.addEventListener('change', async () => {
      const chosen = picker.files?.[0];
      if (!chosen) return;
      inputs.content.value = await chosen.text();
      if (!inputs.name.value) inputs.name.value = chosen.name.replace(/\.[^.]+$/, '');
      toast(`Cargado ${chosen.name}`);
    });
    wrap.append(picker, el('button', { class: 'button secondary', style: { marginBottom: '12px' }, onclick: () => picker.click() }, 'Elegir archivo…'));
  }

  const submit = el('button', { class: 'button' }, 'Añadir y sincronizar');
  submit.addEventListener('click', async () => {
    const values = Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, input.value.trim()]));
    submit.disabled = true;
    submit.textContent = 'Comprobando…';
    try {
      await onSubmit(values);
      toast('Lista añadida. Sincronizando…');
      await api.sync();
      await refreshState();
      navigate('ajustes');
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      submit.disabled = false;
      submit.textContent = 'Añadir y sincronizar';
    }
  });

  wrap.append(el('div', { style: { marginTop: '6px' } }, submit));
  return wrap;
}

function preferencesPanel() {
  const panel = el('div', { class: 'panel' }, el('h3', {}, 'Preferencias'));

  const themeSelect = el('select', {},
    el('option', { value: 'system' }, 'Automático (como el sistema)'),
    el('option', { value: 'light' }, 'Claro'),
    el('option', { value: 'dark' }, 'Oscuro')
  );
  themeSelect.value = state.settings.theme || 'system';
  themeSelect.addEventListener('change', async () => {
    applyTheme(themeSelect.value);
    await api.saveSettings({ theme: themeSelect.value });
    state.settings.theme = themeSelect.value;
  });

  const adult = el('button', { class: `switch ${state.settings.adultFilter ? 'on' : ''}` }, el('i', {}));
  adult.addEventListener('click', async () => {
    const next = !adult.classList.contains('on');
    adult.classList.toggle('on', next);
    await api.saveSettings({ adultFilter: next });
    state.settings.adultFilter = next;
    toast('Se aplicará en la próxima sincronización');
  });

  const tmdbInput = el('input', { type: 'password', placeholder: state.settings.tmdbApiKey || 'Clave de API de TMDB (opcional)' });
  const tmdbSave = el('button', { class: 'button secondary' }, 'Guardar clave');
  tmdbSave.addEventListener('click', async () => {
    try {
      await api.saveSettings({ tmdbApiKey: tmdbInput.value.trim() });
      tmdbInput.value = '';
      toast('Clave guardada. Sincroniza para traer valoraciones.');
      await refreshState();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  });

  panel.append(
    el('div', { class: 'switch-row' },
      el('div', { class: 'label' }, 'Apariencia', el('small', {}, 'La interfaz sigue el aspecto del sistema por defecto')),
      el('div', { class: 'spacer' }), themeSelect),
    el('div', { class: 'switch-row' },
      el('div', { class: 'label' }, 'Ocultar contenido adulto', el('small', {}, 'Filtra las categorías marcadas como XXX o +18')),
      el('div', { class: 'spacer' }), adult),
    el('div', { class: 'field', style: { marginTop: '16px' } },
      el('label', {}, 'Clave de TMDB (opcional)'),
      el('div', { style: { display: 'flex', gap: '8px' } }, tmdbInput, tmdbSave),
      el('small', { class: 'page-sub', style: { display: 'block', marginTop: '6px' } },
        'Con una clave gratuita de themoviedb.org la app añade carátulas, sinopsis y valoraciones reales, que es lo que alimenta las recomendaciones.')
    ),
    el('div', { style: { marginTop: '10px' } },
      el('button', {
        class: 'button danger',
        onclick: async () => { await api.clearMetaCache(); toast('Caché de metadatos vaciada'); }
      }, 'Vaciar caché de metadatos'),
      el('button', {
        class: 'button danger',
        onclick: async () => { await api.clearHistory(); await refreshState(); toast('Historial borrado'); }
      }, 'Borrar historial')
    )
  );
  return panel;
}

function sessionPanel() {
  if (!state.auth) return null;
  return el('div', { class: 'panel' },
    el('h3', {}, 'Acceso'),
    el('p', { class: 'hint' }, 'Esta copia está protegida con contraseña. Cierra la sesión si usas un dispositivo compartido.'),
    el('button', {
      class: 'button secondary',
      onclick: async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
      }
    }, 'Cerrar sesión'));
}

function aboutPanel() {
  const { builtAt } = state.counts;
  return el('div', { class: 'panel' },
    el('h3', {}, 'Tu biblioteca'),
    el('p', { class: 'hint' }, builtAt ? `Última organización del catálogo ${timeAgo(builtAt)}.` : 'Todavía no se ha construido el catálogo.'),
    el('div', { style: { display: 'flex', gap: '26px', flexWrap: 'wrap' } },
      stat('Películas', state.counts.movies),
      stat('Series', state.counts.series),
      stat('Canales', state.counts.live),
      stat('Favoritos', state.favorites.length))
  );
}

const stat = (label, value) => el('div', {},
  el('div', { style: { fontSize: '25px', fontWeight: '700', letterSpacing: '-0.02em' } }, formatCount(value)),
  el('div', { class: 'page-sub' }, label));

export { startSync };
