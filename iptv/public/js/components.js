/** Piezas reutilizables de la interfaz: tarjetas, filas de canal y hoja de detalle. */
import { el, clear, icon, formatCount } from './dom.js';
import { isFavorite, state, toggleFavorite } from './state.js';
import { play } from './player.js';
import { api } from './api.js';

const initials = (title) => String(title || '?').trim().slice(0, 2).toUpperCase();

function posterImage(item) {
  const src = item.poster || item.logo || '';
  const box = el('div', { class: 'poster' });
  if (src) {
    const img = el('img', { src, alt: item.title, loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.remove(); box.prepend(el('div', { class: 'fallback' }, item.title)); });
    box.append(img);
  } else {
    box.append(el('div', { class: 'fallback' }, item.title));
  }
  return box;
}

/** Tarjeta de pelicula o serie. */
export function card(item, { landscape = false, showReason = false } = {}) {
  const box = posterImage(item);

  if (item.rating) {
    box.append(el('div', { class: 'badge rating' }, icon('star', { filled: true }), Number(item.rating).toFixed(1)));
  } else if (item.type === 'series' && item.seasonCount) {
    box.append(el('div', { class: 'badge' }, `${item.seasonCount} temp.`));
  }

  const fav = el('button', {
    class: `fav-toggle ${isFavorite(item.id) ? 'on' : ''}`,
    title: 'Favorito',
    onclick: async (event) => {
      event.stopPropagation();
      const now = await toggleFavorite(item);
      fav.classList.toggle('on', now);
      clear(fav).append(icon('heart', { filled: now }));
    }
  }, icon('heart', { filled: isFavorite(item.id) }));
  box.append(fav);

  const progress = state.history.find((h) => h.id === item.id && h.duration);
  if (progress) {
    const pct = Math.min(100, Math.round((progress.position / progress.duration) * 100));
    box.append(el('div', { class: 'progress-bar' }, el('i', { style: { width: `${pct}%` } })));
  }

  const subParts = [];
  if (item.year) subParts.push(String(item.year));
  if (item.type === 'series' && item.episodeCount) subParts.push(`${item.episodeCount} ep.`);
  if (item.type === 'movie' && item.sources?.length > 1) subParts.push(`${item.sources.length} fuentes`);

  return el('button', { class: `card ${landscape ? 'landscape' : ''}`, onclick: () => openDetail(item) },
    box,
    el('div', { class: 'meta' },
      el('div', { class: 'name' }, item.title),
      el('div', { class: 'sub' },
        showReason && item.recommendation ? item.recommendation.reason : subParts.join(' · ')
      )
    )
  );
}

/** Fila compacta para canales de television. */
export function channelRow(channel) {
  const logo = el('div', { class: 'logo' }, initials(channel.title));
  if (channel.logo) {
    const img = el('img', { src: channel.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => clear(logo).append(initials(channel.title)));
    clear(logo).append(img);
  }

  const fav = el('button', {
    class: `fav ${isFavorite(channel.id) ? 'on' : ''}`,
    title: 'Favorito',
    onclick: async (event) => {
      event.stopPropagation();
      const now = await toggleFavorite(channel);
      fav.classList.toggle('on', now);
      clear(fav).append(icon('heart', { filled: now }));
    }
  }, icon('heart', { filled: isFavorite(channel.id) }));

  return el('div', { class: 'channel' },
    el('button', { class: 'channel-open', style: { display: 'contents' }, onclick: () => play({ ...channel, url: channel.url, type: 'live', subtitle: channel.group }) },
      logo,
      el('div', { class: 'info' },
        el('div', { class: 'name' }, channel.title),
        el('div', { class: 'sub' }, [channel.group, channel.playlistName].filter(Boolean).join(' · '))
      )
    ),
    fav
  );
}

/** Carrusel horizontal con titulo. */
export function rail(title, items, { subtitle, wide = false, action, showReason } = {}) {
  if (!items?.length) return null;
  return el('section', { class: 'section' },
    el('div', { class: 'section-head' },
      el('h2', { class: 'section-title' }, title),
      subtitle ? el('span', { class: 'section-sub' }, subtitle) : null,
      action ? el('button', { class: 'section-action', onclick: action.onClick }, action.label) : null
    ),
    el('div', { class: `rail ${wide ? 'wide' : ''}` }, items.map((item) => card(item, { landscape: wide, showReason })))
  );
}

export function empty(emoji, title, text, action) {
  return el('div', { class: 'empty' },
    el('div', { class: 'emoji' }, emoji),
    el('h3', {}, title),
    text ? el('p', {}, text) : null,
    action ? el('button', { class: 'button', style: { marginTop: '10px' }, onclick: action.onClick }, action.label) : null
  );
}

export function skeletonGrid(count = 12) {
  return el('div', { class: 'grid' }, Array.from({ length: count }, () => el('div', { class: 'skeleton poster' })));
}

/* ----------------------------- Hoja de detalle ---------------------------- */

let openSheet = null;

export function closeSheet() {
  openSheet?.remove();
  openSheet = null;
}

/** Abre el detalle de una pelicula o serie (los canales se reproducen directos). */
export async function openDetail(item) {
  if (item.type === 'live') return play({ ...item, type: 'live', subtitle: item.group });

  // El catalogo paginado llega ligero: se pide el item completo.
  let full = item;
  try {
    if (!item.sources && !item.seasons) full = await api.item(item.id);
  } catch { /* se usa lo que ya tenemos */ }

  closeSheet();
  // Sin imagen la cabecera se elimina: mejor un titulo limpio que un hueco gris.
  const heroSrc = full.backdrop || full.poster;
  const hero = heroSrc ? el('div', { class: 'sheet-hero' }) : null;
  if (hero) {
    const img = el('img', { src: heroSrc, alt: '', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => { hero.remove(); body.classList.add('flush'); });
    hero.append(img);
  }

  const meta = el('div', { class: 'sheet-meta' });
  if (full.rating) meta.append(el('span', { class: 'pill' }, `★ ${Number(full.rating).toFixed(1)}`));
  if (full.year) meta.append(el('span', {}, String(full.year)));
  if (full.type === 'series') meta.append(el('span', {}, `${full.seasonCount || Object.keys(full.seasons || {}).length} temporadas · ${formatCount(full.episodeCount)} episodios`));
  for (const genre of (full.genres || []).slice(0, 4)) meta.append(el('span', { class: 'pill' }, genre));
  for (const group of (full.groups || []).slice(0, 2)) meta.append(el('span', { class: 'pill' }, group));

  const favButton = el('button', {
    class: `button secondary`,
    onclick: async () => {
      const now = await toggleFavorite(full);
      favButton.replaceChildren(icon('heart', { filled: now }), now ? 'En favoritos' : 'Añadir a favoritos');
    }
  }, icon('heart', { filled: isFavorite(full.id) }), isFavorite(full.id) ? 'En favoritos' : 'Añadir a favoritos');
  favButton.style.display = 'inline-flex';
  favButton.style.alignItems = 'center';
  favButton.style.gap = '7px';

  const body = el('div', { class: 'sheet-body' },
    el('h2', {}, full.title),
    meta,
    el('div', { class: 'sheet-actions' }, buildPrimaryAction(full), favButton),
    full.plot ? el('p', { class: 'plot' }, full.plot) : null,
    full.type === 'series' ? seasonsBlock(full) : sourcesBlock(full)
  );

  if (!hero) body.classList.add('flush');
  const sheet = el('div', { class: 'sheet' },
    el('button', { class: 'sheet-close', onclick: closeSheet }, icon('close')),
    hero,
    body
  );
  const backdrop = el('div', {
    class: 'sheet-backdrop',
    onclick: (event) => { if (event.target === backdrop) closeSheet(); }
  }, sheet);

  document.body.append(backdrop);
  openSheet = backdrop;
  const onEsc = (event) => { if (event.key === 'Escape') { closeSheet(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
}

function buildPrimaryAction(item) {
  const resume = state.history.find((h) => h.id === item.id);
  if (item.type === 'movie') {
    const source = item.sources?.[0];
    if (!source) return el('span', { class: 'section-sub' }, 'Sin fuentes disponibles');
    const label = resume && resume.position > 30 ? 'Continuar' : 'Reproducir';
    return el('button', {
      class: 'button', style: { display: 'inline-flex', alignItems: 'center', gap: '7px' },
      onclick: () => play({ ...item, url: source.url, resumeAt: resume?.position, subtitle: source.label })
    }, icon('play', { filled: true }), label);
  }

  const seasons = Object.keys(item.seasons || {}).sort((a, b) => Number(a) - Number(b));
  const first = seasons.length ? item.seasons[seasons[0]][0] : null;
  const next = resume && resume.episodeId ? findEpisode(item, resume.episodeId) : null;
  const target = next || first;
  if (!target) return el('span', { class: 'section-sub' }, 'Sin episodios disponibles');
  return el('button', {
    class: 'button', style: { display: 'inline-flex', alignItems: 'center', gap: '7px' },
    onclick: () => play({
      ...item,
      url: target.episode.url,
      episodeId: target.id,
      resumeAt: next ? resume.position : 0,
      subtitle: `T${target.season} · E${target.episode.episode}${target.episode.title ? ` — ${target.episode.title}` : ''}`
    })
  }, icon('play', { filled: true }), next ? 'Continuar' : 'Reproducir T1 E1');
}

function findEpisode(show, episodeId) {
  for (const [season, episodes] of Object.entries(show.seasons || {})) {
    for (const episode of episodes) {
      if (`${season}x${episode.episode}` === episodeId) return { id: episodeId, season, episode };
    }
  }
  return null;
}

function sourcesBlock(movie) {
  if (!movie.sources?.length) return null;
  if (movie.sources.length === 1) return null;
  return el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', { class: 'section-title' }, 'Fuentes')),
    el('div', { class: 'source-list' }, movie.sources.map((source, index) =>
      el('button', { class: 'episode', onclick: () => play({ ...movie, url: source.url, subtitle: source.label }) },
        el('div', { class: 'num' }, String(index + 1)),
        el('div', { class: 'info' },
          el('div', { class: 't' }, source.label || `Fuente ${index + 1}`),
          el('div', { class: 's' }, new URL(source.url, location.origin).hostname)
        ),
        el('div', { class: 'play' }, icon('play', { filled: true }))
      )
    ))
  );
}

function seasonsBlock(show) {
  const seasons = Object.keys(show.seasons || {}).sort((a, b) => Number(a) - Number(b));
  if (!seasons.length) return null;

  const list = el('div', { class: 'source-list' });
  const chips = el('div', { class: 'chips', style: { marginBottom: '12px' } });

  const render = (season) => {
    clear(list);
    for (const episode of show.seasons[season]) {
      const still = episode.still
        ? el('img', { class: 'still', src: episode.still, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' })
        : null;
      list.append(el('button', {
        class: 'episode',
        onclick: () => play({
          ...show,
          url: episode.url,
          episodeId: `${season}x${episode.episode}`,
          subtitle: `T${season} · E${episode.episode}${episode.title ? ` — ${episode.title}` : ''}`
        })
      },
        el('div', { class: 'num' }, String(episode.episode)),
        still,
        el('div', { class: 'info' },
          el('div', { class: 't' }, episode.title || `Episodio ${episode.episode}`),
          el('div', { class: 's' }, episode.tags?.join(' · ') || '')
        ),
        el('div', { class: 'play' }, icon('play', { filled: true }))
      ));
    }
  };

  seasons.forEach((season, index) => {
    const chip = el('button', {
      class: `chip ${index === 0 ? 'active' : ''}`,
      onclick: () => {
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        render(season);
      }
    }, `Temporada ${season}`);
    chips.append(chip);
  });
  render(seasons[0]);

  return el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', { class: 'section-title' }, 'Episodios')),
    chips,
    list
  );
}
