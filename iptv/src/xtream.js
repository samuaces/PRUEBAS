/**
 * Cliente minimo de Xtream Codes.
 * Estas listas exponen valoraciones y generos, que alimentan las recomendaciones.
 */

const TIMEOUT_MS = 25000;

function baseUrl(host) {
  let url = String(host || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/player_api\.php.*$/i, '');
}

async function call(account, action, params = {}) {
  const url = new URL(`${baseUrl(account.host)}/player_api.php`);
  url.searchParams.set('username', account.username);
  url.searchParams.set('password', account.password);
  if (action) url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20', Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`El servidor respondio ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('La respuesta del servidor no es JSON valido (revisa host, usuario y contrasena)');
  }
}

/** Comprueba credenciales y devuelve la info de la cuenta. */
export async function login(account) {
  const info = await call(account, null);
  if (!info?.user_info || info.user_info.auth === 0) throw new Error('Usuario o contrasena incorrectos');
  return info;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function categoryMap(list) {
  const map = new Map();
  for (const c of list || []) map.set(String(c.category_id), c.category_name);
  return map;
}

/**
 * Descarga el catalogo completo de una cuenta Xtream.
 * Devuelve entradas con la misma forma que las de una lista M3U.
 */
export async function fetchCatalog(account, { onProgress } = {}) {
  const base = baseUrl(account.host);
  const { username: u, password: p } = account;
  const entries = [];
  const report = (msg) => onProgress?.(msg);

  report('Descargando canales en directo…');
  const [liveCats, liveStreams] = await Promise.all([
    call(account, 'get_live_categories').catch(() => []),
    call(account, 'get_live_streams').catch(() => [])
  ]);
  const liveNames = categoryMap(liveCats);
  for (const s of liveStreams || []) {
    entries.push({
      title: s.name || '',
      url: `${base}/live/${u}/${p}/${s.stream_id}.m3u8`,
      attrs: {
        'tvg-id': s.epg_channel_id || '',
        'tvg-logo': s.stream_icon || '',
        'group-title': liveNames.get(String(s.category_id)) || 'Canales'
      },
      extras: {},
      forcedType: 'live'
    });
  }

  report('Descargando peliculas…');
  const [vodCats, vodStreams] = await Promise.all([
    call(account, 'get_vod_categories').catch(() => []),
    call(account, 'get_vod_streams').catch(() => [])
  ]);
  const vodNames = categoryMap(vodCats);
  for (const s of vodStreams || []) {
    const ext = s.container_extension || 'mp4';
    entries.push({
      title: s.name || s.title || '',
      url: `${base}/movie/${u}/${p}/${s.stream_id}.${ext}`,
      attrs: {
        'tvg-logo': s.stream_icon || s.cover || '',
        'group-title': vodNames.get(String(s.category_id)) || 'Peliculas'
      },
      extras: {},
      forcedType: 'movie',
      provider: {
        rating: num(s.rating),
        year: num(String(s.year || s.releaseDate || '').slice(0, 4)),
        added: s.added ? Number(s.added) * 1000 : null,
        genres: s.genre ? String(s.genre).split(/[,/|]/).map((g) => g.trim()).filter(Boolean) : [],
        plot: s.plot || ''
      }
    });
  }

  report('Descargando series…');
  const [seriesCats, seriesList] = await Promise.all([
    call(account, 'get_series_categories').catch(() => []),
    call(account, 'get_series').catch(() => [])
  ]);
  const seriesNames = categoryMap(seriesCats);

  // get_series_info es una llamada por serie: se limita la concurrencia para no saturar el panel.
  const shows = seriesList || [];
  const queue = [...shows];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const show = queue.shift();
      if (!show) break;
      let info = null;
      try {
        info = await call(account, 'get_series_info', { series_id: show.series_id });
      } catch { /* una serie que falla no debe tumbar la sincronizacion */ }
      const group = seriesNames.get(String(show.category_id)) || 'Series';
      const provider = {
        rating: num(show.rating),
        year: num(String(show.releaseDate || show.release_date || '').slice(0, 4)),
        added: show.last_modified ? Number(show.last_modified) * 1000 : null,
        genres: show.genre ? String(show.genre).split(/[,/|]/).map((g) => g.trim()).filter(Boolean) : [],
        plot: show.plot || '',
        poster: show.cover || ''
      };
      const seasons = info?.episodes || {};
      for (const [seasonKey, episodes] of Object.entries(seasons)) {
        for (const ep of episodes || []) {
          const ext = ep.container_extension || 'mp4';
          entries.push({
            title: `${show.name} S${String(seasonKey).padStart(2, '0')}E${String(ep.episode_num).padStart(2, '0')} ${ep.title && ep.title !== show.name ? ep.title : ''}`.trim(),
            url: `${base}/series/${u}/${p}/${ep.id}.${ext}`,
            attrs: { 'tvg-logo': show.cover || '', 'group-title': group },
            extras: {},
            forcedType: 'series',
            show: show.name,
            season: Number(seasonKey),
            episode: Number(ep.episode_num),
            episodeTitle: ep.title && ep.title !== show.name ? ep.title : '',
            still: ep.info?.movie_image || '',
            provider
          });
        }
      }
      if (!Object.keys(seasons).length) {
        // Serie sin episodios listados: se guarda igualmente para que aparezca en el catalogo.
        entries.push({
          title: show.name || '',
          url: '',
          attrs: { 'tvg-logo': show.cover || '', 'group-title': group },
          extras: {},
          forcedType: 'series',
          show: show.name,
          season: 1,
          episode: 0,
          provider
        });
      }
    }
  });
  await Promise.all(workers);

  return entries;
}
