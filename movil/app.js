/* ===========================================================================
   Cookie Play — versión para el móvil.
   Funciona entera dentro del navegador: no hay servidor ni cuentas. La lista
   se guarda en el propio teléfono (IndexedDB) y no sale de él.
   =========================================================================== */

/* ----------------------------- Utilidades -------------------------------- */

export function el(tag, props, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(nodo.style, v);
    else if (k === 'html') nodo.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
    else if (k in nodo && k !== 'list') nodo[k] = v;
    else nodo.setAttribute(k, v);
  }
  for (const hijo of hijos.flat(3)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

export const vaciar = (nodo) => { while (nodo.firstChild) nodo.firstChild.remove(); return nodo; };

const TRAZOS = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  chispa: '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z"/>',
  peli: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/>',
  serie: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M6 3h12"/>',
  tv: '<rect x="2.5" y="4" width="19" height="13" rx="2.5"/><path d="M8 21h8"/>',
  corazon: '<path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
  play: '<path d="M7 4.5 19.5 12 7 19.5Z"/>',
  estrella: '<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7L7 19.5l1-5.7-4.1-4 5.7-.8L12 3.8Z"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  ajustes: '<circle cx="12" cy="12" r="3.2"/><path d="M4.5 12a7.5 7.5 0 0 1 .3-2l-2-1.5 2-3.4 2.3 1a7.5 7.5 0 0 1 1.7-1L9.2 2h4l.4 2.6c.6.2 1.2.6 1.7 1l2.3-1 2 3.4-2 1.5c.1.6.1 1.3 0 2l2 1.5-2 3.4-2.3-1c-.5.4-1.1.8-1.7 1L13.2 22h-4l-.4-2.6c-.6-.2-1.2-.6-1.7-1l-2.3 1-2-3.4 2-1.5a7.5 7.5 0 0 1-.3-2Z"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>'
};

export function icono(nombre, relleno) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', relleno ? 'currentColor' : 'none');
  svg.setAttribute('stroke', relleno ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = TRAZOS[nombre] || '';
  return svg;
}

let pilaAvisos = null;
export function aviso(texto, ms = 2800) {
  if (!pilaAvisos) {
    pilaAvisos = el('div', { class: 'toasts' });
    document.body.append(pilaAvisos);
  }
  const nodo = el('div', { class: 'toast' }, texto);
  pilaAvisos.append(nodo);
  setTimeout(() => {
    nodo.style.transition = 'opacity .3s, transform .3s';
    nodo.style.opacity = '0';
    nodo.style.transform = 'translateY(8px)';
    setTimeout(() => nodo.remove(), 320);
  }, ms);
}

export function retrasa(fn, ms = 220) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const numero = (n) => new Intl.NumberFormat('es-ES').format(n || 0);
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const normaliza = sinTildes;

/* --------------------------- Parseo de la lista --------------------------- */

const ATRIBUTO = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

export function parseaM3U(texto) {
  const lineas = String(texto).split(/\r?\n/);
  const entradas = [];
  let pendiente = null;

  for (const cruda of lineas) {
    const linea = cruda.trim();
    if (!linea) continue;

    if (linea.startsWith('#EXTINF')) {
      const coma = linea.indexOf(',');
      const cabeza = coma === -1 ? linea : linea.slice(0, coma);
      const titulo = coma === -1 ? '' : linea.slice(coma + 1).trim();
      const attrs = {};
      let m;
      ATRIBUTO.lastIndex = 0;
      while ((m = ATRIBUTO.exec(cabeza)) !== null) attrs[m[1].toLowerCase()] = m[2];
      pendiente = { titulo: titulo || attrs['tvg-name'] || '', attrs };
      continue;
    }
    if (linea.startsWith('#EXTGRP') && pendiente) {
      pendiente.attrs['group-title'] = linea.split(':').slice(1).join(':').trim();
      continue;
    }
    if (linea.startsWith('#')) continue;
    if (pendiente) {
      entradas.push({ ...pendiente, url: linea });
      pendiente = null;
    }
  }
  return entradas;
}

const CALIDAD = /\b(4k|uhd|fhd|hd|sd|hq|hevc|h265|x265|x264|1080p?|720p?|480p?|2160p?|dolby|atmos|dts|multi|dual|remux|bluray|web-?dl|webrip|hdrip|dvdrip|ac3|aac|10bit)\b/gi;
const IDIOMA = /\b(cast(ellano)?|lat(ino)?|esp|spa|eng|vose|vos|sub(titulad[oa]s?)?|dual|multi|original)\b/gi;
const PREFIJO_PAIS = /^\s*(?:\|?\s*[A-Z]{2,4}\s*\|)\s*|^\s*[A-Z]{2,4}\s*[-:]\s+/;
const PARENTESIS = /[\[(\{][^\])\}]*[\])\}]/g;
const ANYO = /\b(19\d{2}|20\d{2})\b/;

const PATRONES_EP = [
  /\bS\s?(\d{1,2})\s?[\sxE._-]?\s?E\s?(\d{1,3})\b/i,
  /\bT\s?(\d{1,2})\s?[\sxE._-]?\s?E?\s?(\d{1,3})\b/i,
  /\b(\d{1,2})\s?x\s?(\d{1,3})\b/,
  /temporada\s*(\d{1,2}).{0,12}?(?:cap[ií]tulo|episodio|ep)\s*(\d{1,3})/i
];

export function parseaEpisodio(titulo) {
  const nombre = String(titulo || '');
  for (const re of PATRONES_EP) {
    const m = nombre.match(re);
    if (!m) continue;
    const temporada = Number(m[1]);
    const episodio = Number(m[2]);
    if (!Number.isFinite(temporada) || !Number.isFinite(episodio)) continue;
    if (temporada > 60 || episodio > 999) continue;
    return {
      serie: nombre.slice(0, m.index).replace(/[\s\-–—_:.]+$/, '').trim() || nombre,
      temporada,
      episodio,
      titulo: nombre.slice(m.index + m[0].length).replace(/^[\s\-–—_:.]+/, '').trim()
    };
  }
  return null;
}

export function extraeAnyo(titulo) {
  const m = String(titulo || '').match(ANYO);
  if (!m) return null;
  const anyo = Number(m[1]);
  return anyo >= 1900 && anyo <= new Date().getFullYear() + 2 ? anyo : null;
}

export function limpiaTitulo(crudo) {
  let t = String(crudo || '').trim();
  t = t.replace(PREFIJO_PAIS, '').replace(PARENTESIS, ' ').replace(CALIDAD, ' ');
  for (let i = 0; i < 4; i++) {
    const corto = t.replace(/[\s\-–—|:.]*\b(cast(ellano)?|lat(ino)?|esp|spa|eng|vose|vos|sub(titulad[oa]s?)?|dual|multi|original)\b[\s\-–—|:.]*$/i, '');
    if (corto === t) break;
    t = corto;
  }
  t = t.replace(ANYO, ' ').replace(/[._]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^[\s\-–—|:.]+|[\s\-–—|:.]+$/g, '').trim();
  return t || String(crudo || '').trim();
}

export function etiquetas(crudo) {
  const set = new Set();
  for (const m of String(crudo || '').matchAll(CALIDAD)) set.add(m[0].toUpperCase());
  for (const m of String(crudo || '').matchAll(IDIOMA)) set.add(m[0].toUpperCase());
  return [...set].slice(0, 5);
}

export const claveTexto = (t) => sinTildes(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-titulo';

const EXT_VIDEO = /\.(mp4|mkv|avi|m4v|mov|mpg|mpeg|wmv|flv)(\?.*)?$/i;
const GRUPO_SERIE = /(series?|s[ée]ries|tv ?show|temporadas?|anime|novelas?|doramas?)/i;
const GRUPO_PELI = /(pel[ií]culas?|peliculas|movies?|cine|film|vod|estrenos?|documental)/i;
const GRUPO_TV = /(canal(es)?|tv|directo|live|deportes?|sports?|noticias?|news|24 ?h|radio)/i;
const ADULTO = /(\bxxx\b|adult|porn|erotic|\+18|hot ?tv)/i;

export function clasifica(entrada) {
  const grupo = entrada.attrs?.['group-title'] || '';
  const ruta = (entrada.url || '').split('?')[0];
  if (/\/series\//i.test(ruta)) return 'serie';
  if (/\/movie(s)?\//i.test(ruta)) return 'peli';
  if (/\/live\//i.test(ruta)) return 'canal';
  if (parseaEpisodio(entrada.titulo)) return 'serie';
  if (GRUPO_SERIE.test(grupo) && !GRUPO_TV.test(grupo)) return 'serie';
  if (GRUPO_PELI.test(grupo)) return 'peli';
  if (EXT_VIDEO.test(ruta)) return 'peli';
  return 'canal';
}

export const esAdulto = (entrada) =>
  ADULTO.test(entrada.attrs?.['group-title'] || '') || ADULTO.test(entrada.titulo || '');

/** Convierte las entradas crudas en catálogo: pelis, series y canales. */
export function construyeCatalogo(entradas, { filtroAdulto = true } = {}) {
  const pelis = new Map();
  const series = new Map();
  const canales = [];
  const vistosCanal = new Set();

  for (const entrada of entradas) {
    if (filtroAdulto && esAdulto(entrada)) continue;
    const tipo = clasifica(entrada);
    const grupo = entrada.attrs?.['group-title'] || 'Otros';
    const logo = entrada.attrs?.['tvg-logo'] || '';

    if (tipo === 'canal') {
      const titulo = limpiaTitulo(entrada.titulo) || entrada.titulo;
      const clave = `${titulo}|${entrada.url}`;
      if (vistosCanal.has(clave)) continue;
      vistosCanal.add(clave);
      canales.push({
        id: `canal-${claveTexto(titulo)}-${canales.length}`,
        tipo: 'canal', titulo, logo, grupo, url: entrada.url
      });
      continue;
    }

    if (tipo === 'serie') {
      const ep = parseaEpisodio(entrada.titulo);
      const nombre = limpiaTitulo(ep?.serie || entrada.titulo) || entrada.titulo;
      const id = `serie-${claveTexto(nombre)}`;
      let serie = series.get(id);
      if (!serie) {
        serie = { id, tipo: 'serie', titulo: nombre, poster: logo, grupos: [], temporadas: {}, episodios: 0 };
        series.set(id, serie);
      }
      if (!serie.poster && logo) serie.poster = logo;
      if (grupo && !serie.grupos.includes(grupo)) serie.grupos.push(grupo);
      const temporada = String(ep?.temporada ?? 1);
      const lista = (serie.temporadas[temporada] ||= []);
      const numeroEp = ep?.episodio ?? lista.length + 1;
      if (!lista.some((e) => e.n === numeroEp && e.url === entrada.url)) {
        lista.push({ n: numeroEp, titulo: ep?.titulo || '', url: entrada.url, etiquetas: etiquetas(entrada.titulo) });
        serie.episodios += 1;
      }
      continue;
    }

    const titulo = limpiaTitulo(entrada.titulo) || entrada.titulo;
    const anyo = extraeAnyo(entrada.titulo);
    const id = `peli-${claveTexto(titulo)}${anyo ? `-${anyo}` : ''}`;
    let peli = pelis.get(id);
    if (!peli) {
      peli = { id, tipo: 'peli', titulo, anyo, poster: logo, grupos: [], fuentes: [] };
      pelis.set(id, peli);
    }
    if (!peli.poster && logo) peli.poster = logo;
    if (grupo && !peli.grupos.includes(grupo)) peli.grupos.push(grupo);
    if (!peli.fuentes.some((f) => f.url === entrada.url)) {
      peli.fuentes.push({ url: entrada.url, etiqueta: etiquetas(entrada.titulo).join(' · ') || 'Fuente' });
    }
  }

  for (const serie of series.values()) {
    for (const clave of Object.keys(serie.temporadas)) serie.temporadas[clave].sort((a, b) => a.n - b.n);
    serie.numTemporadas = Object.keys(serie.temporadas).length;
  }

  const porTitulo = (a, b) => a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' });
  return {
    pelis: [...pelis.values()].sort(porTitulo),
    series: [...series.values()].sort(porTitulo),
    canales: canales.sort((a, b) => a.grupo.localeCompare(b.grupo, 'es') || porTitulo(a, b)),
    creado: Date.now()
  };
}

/* ---------------------- Cuentas Xtream desde el navegador ----------------- */

/** Saca servidor, usuario y contraseña de una URL get.php de Xtream. */
export function credencialesDesdeUrl(entrada) {
  try {
    const url = new URL(entrada);
    const usuario = url.searchParams.get('username');
    const clave = url.searchParams.get('password');
    if (!usuario || !clave) return null;
    return { base: `${url.protocol}//${url.host}`, usuario, clave };
  } catch {
    return null;
  }
}

async function apiXtream({ base, usuario, clave }, accion, extra = {}) {
  const url = new URL(`${base}/player_api.php`);
  url.searchParams.set('username', usuario);
  url.searchParams.set('password', clave);
  if (accion) url.searchParams.set('action', accion);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`el panel respondió ${res.status}`);
  return res.json();
}

const mapaCategorias = (lista) => new Map((lista || []).map((c) => [String(c.category_id), c.category_name]));

/**
 * Construye el catálogo con la API del panel. Trae valoraciones y géneros, y
 * deja los episodios de cada serie para cuando se abra su ficha.
 */
export async function catalogoDesdeXtream(cuenta, aviso) {
  const { base, usuario, clave } = cuenta;

  aviso?.('Comprobando la cuenta…');
  const info = await apiXtream(cuenta, null);
  if (!info?.user_info || info.user_info.auth === 0) throw new Error('usuario o contraseña incorrectos');

  aviso?.('Descargando canales…');
  const [catDirecto, directos] = await Promise.all([
    apiXtream(cuenta, 'get_live_categories').catch(() => []),
    apiXtream(cuenta, 'get_live_streams').catch(() => [])
  ]);
  const nombresDirecto = mapaCategorias(catDirecto);
  const canales = (directos || []).map((c, i) => ({
    id: `canal-${claveTexto(c.name || '')}-${i}`,
    tipo: 'canal',
    titulo: limpiaTitulo(c.name || '') || c.name || 'Canal',
    logo: c.stream_icon || '',
    grupo: nombresDirecto.get(String(c.category_id)) || 'Canales',
    url: `${base}/live/${usuario}/${clave}/${c.stream_id}.m3u8`
  }));

  aviso?.('Descargando películas…');
  const [catVod, vod] = await Promise.all([
    apiXtream(cuenta, 'get_vod_categories').catch(() => []),
    apiXtream(cuenta, 'get_vod_streams').catch(() => [])
  ]);
  const nombresVod = mapaCategorias(catVod);
  const pelis = (vod || []).map((v) => ({
    id: `peli-${claveTexto(v.name || v.title || '')}-${v.stream_id}`,
    tipo: 'peli',
    titulo: limpiaTitulo(v.name || v.title || '') || v.name || 'Película',
    anyo: Number(String(v.year || v.releaseDate || '').slice(0, 4)) || null,
    nota: Number(v.rating) || null,
    poster: v.stream_icon || v.cover || '',
    grupos: [nombresVod.get(String(v.category_id)) || 'Películas'],
    generos: v.genre ? String(v.genre).split(/[,\/|]/).map((g) => g.trim()).filter(Boolean) : [],
    fuentes: [{ url: `${base}/movie/${usuario}/${clave}/${v.stream_id}.${v.container_extension || 'mp4'}`, etiqueta: 'Fuente principal' }]
  }));

  aviso?.('Descargando series…');
  const [catSeries, listaSeries] = await Promise.all([
    apiXtream(cuenta, 'get_series_categories').catch(() => []),
    apiXtream(cuenta, 'get_series').catch(() => [])
  ]);
  const nombresSeries = mapaCategorias(catSeries);
  const series = (listaSeries || []).map((s) => ({
    id: `serie-${claveTexto(s.name || '')}-${s.series_id}`,
    tipo: 'serie',
    titulo: limpiaTitulo(s.name || '') || s.name || 'Serie',
    anyo: Number(String(s.releaseDate || s.release_date || '').slice(0, 4)) || null,
    nota: Number(s.rating) || null,
    poster: s.cover || '',
    grupos: [nombresSeries.get(String(s.category_id)) || 'Series'],
    generos: s.genre ? String(s.genre).split(/[,\/|]/).map((g) => g.trim()).filter(Boolean) : [],
    sinopsis: s.plot || '',
    temporadas: {},
    episodios: 0,
    numTemporadas: 0,
    serieId: s.series_id,
    pendiente: true                 // los episodios se piden al abrir la ficha
  }));

  const porTitulo = (a, b) => a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' });
  return {
    pelis: pelis.sort(porTitulo),
    series: series.sort(porTitulo),
    canales: canales.sort((a, b) => a.grupo.localeCompare(b.grupo, 'es') || porTitulo(a, b)),
    creado: Date.now(),
    cuenta                            // hace falta para pedir los episodios después
  };
}

/** Rellena los episodios de una serie la primera vez que se abre su ficha. */
export async function completaSerie(serie) {
  const cuenta = estado.catalogo?.cuenta;
  if (!cuenta || !serie.pendiente) return serie;
  const info = await apiXtream(cuenta, 'get_series_info', { series_id: serie.serieId });
  const temporadas = {};
  let total = 0;
  for (const [numero, episodios] of Object.entries(info?.episodes || {})) {
    temporadas[numero] = (episodios || []).map((e) => ({
      n: Number(e.episode_num) || 1,
      titulo: e.title && e.title !== serie.titulo ? e.title : '',
      url: `${cuenta.base}/series/${cuenta.usuario}/${cuenta.clave}/${e.id}.${e.container_extension || 'mp4'}`,
      etiquetas: []
    })).sort((a, b) => a.n - b.n);
    total += temporadas[numero].length;
  }
  serie.temporadas = temporadas;
  serie.episodios = total;
  serie.numTemporadas = Object.keys(temporadas).length;
  serie.pendiente = false;
  guardaCatalogo(estado.catalogo, estado.origen).catch(() => { /* se recargará si hace falta */ });
  return serie;
}

/* ------------------------- Guardado en el teléfono ------------------------ */

const BD = 'cookieplay';
const ALMACEN = 'datos';

function abreBD() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error || new Error('No se pudo abrir el almacén'));
  });
}

async function guardaEnBD(clave, valor) {
  const bd = await abreBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(ALMACEN, 'readwrite');
    tx.objectStore(ALMACEN).put(valor, clave);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('No se pudo guardar'));
  });
}

async function leeDeBD(clave) {
  const bd = await abreBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(ALMACEN, 'readonly');
    const p = tx.objectStore(ALMACEN).get(clave);
    p.onsuccess = () => resolve(p.result ?? null);
    p.onerror = () => reject(p.error || new Error('No se pudo leer'));
  });
}

async function borraDeBD(clave) {
  const bd = await abreBD();
  return new Promise((resolve) => {
    const tx = bd.transaction(ALMACEN, 'readwrite');
    tx.objectStore(ALMACEN).delete(clave);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

const local = {
  lee(clave, porDefecto) {
    try {
      const crudo = localStorage.getItem(`cookieplay-${clave}`);
      return crudo ? JSON.parse(crudo) : porDefecto;
    } catch { return porDefecto; }
  },
  guarda(clave, valor) {
    try { localStorage.setItem(`cookieplay-${clave}`, JSON.stringify(valor)); } catch { /* sin espacio: no es crítico */ }
  }
};

export const estado = {
  catalogo: null,
  origen: null,               // de dónde salió la lista y cuándo
  favoritos: new Set(local.lee('favoritos', [])),
  vistos: local.lee('vistos', {}),          // id -> { at, posicion, duracion }
  ajustes: local.lee('ajustes', { filtroAdulto: true, tema: 'sistema' }),
  vista: 'inicio',
  busqueda: ''
};

export function guardaFavoritos() { local.guarda('favoritos', [...estado.favoritos]); }
export function guardaVistos() { local.guarda('vistos', estado.vistos); }
export function guardaAjustes() { local.guarda('ajustes', estado.ajustes); }

export async function cargaCatalogoGuardado() {
  estado.catalogo = await leeDeBD('catalogo').catch(() => null);
  estado.origen = await leeDeBD('origen').catch(() => null);
  return estado.catalogo;
}

export async function guardaCatalogo(catalogo, origen) {
  estado.catalogo = catalogo;
  estado.origen = origen;
  await guardaEnBD('catalogo', catalogo);
  await guardaEnBD('origen', origen);
}

export async function olvidaCatalogo() {
  estado.catalogo = null;
  estado.origen = null;
  await borraDeBD('catalogo');
  await borraDeBD('origen');
}

/* ----------------------- Búsqueda y recomendaciones ----------------------- */

export function busca(catalogo, consulta, limite = 80) {
  const q = sinTildes(consulta).trim();
  if (!q || !catalogo) return [];
  const trozos = q.split(/\s+/).filter(Boolean);
  const salida = [];

  const revisa = (lista) => {
    for (const item of lista) {
      const heno = sinTildes(`${item.titulo} ${(item.grupos || [item.grupo] || []).join(' ')} ${(item.generos || []).join(' ')}`);
      if (!trozos.every((t) => heno.includes(t))) continue;
      const titulo = sinTildes(item.titulo);
      let punto = titulo === q ? 100 : titulo.startsWith(q) ? 60 : titulo.includes(q) ? 40 : 10;
      if (item.tipo === 'serie') punto += 4;
      salida.push({ item, punto });
      if (salida.length > 600) break;
    }
  };
  revisa(catalogo.series);
  revisa(catalogo.pelis);
  revisa(catalogo.canales);

  return salida.sort((a, b) => b.punto - a.punto).slice(0, limite).map((x) => x.item);
}

/**
 * Recomendaciones sin valoraciones externas: manda la afinidad con lo que
 * guardas y ves (categorías), y se premia lo que tiene ficha completa.
 */
export function recomienda(catalogo, limite = 24, tipo) {
  if (!catalogo) return [];
  const peso = new Map();
  const anota = (item, valor) => {
    for (const g of item?.grupos || []) peso.set(g, (peso.get(g) || 0) + valor);
    for (const g of item?.generos || []) peso.set(g, (peso.get(g) || 0) + valor);
  };
  const indice = new Map([...catalogo.pelis, ...catalogo.series].map((i) => [i.id, i]));
  for (const id of estado.favoritos) anota(indice.get(id), 2);
  for (const id of Object.keys(estado.vistos)) anota(indice.get(id), 1);

  const conjunto = [];
  if (tipo !== 'serie') conjunto.push(...catalogo.pelis);
  if (tipo !== 'peli') conjunto.push(...catalogo.series);

  const anyoActual = new Date().getFullYear();
  return conjunto.map((item) => {
    let punto = item.nota ? Number(item.nota) * 10 : 30;
    let afinidad = 0;
    for (const g of item.grupos || []) afinidad += peso.get(g) || 0;
    for (const g of item.generos || []) afinidad += peso.get(g) || 0;
    punto += Math.min(afinidad, 12) * 5;
    if (item.poster) punto += 8;
    if (item.anyo && item.anyo >= anyoActual - 2) punto += 10;
    if (item.tipo === 'serie' && item.episodios > 8) punto += 6;
    if (estado.favoritos.has(item.id)) punto -= 1000;
    if (estado.vistos[item.id]) punto -= 30;
    return {
      item,
      punto,
      motivo: afinidad >= 6 ? 'De una categoría que sigues'
        : afinidad > 0 ? 'Encaja con lo que sueles ver'
        : Number(item.nota) >= 8 ? 'Muy bien valorada'
        : item.anyo && item.anyo >= anyoActual - 1 ? 'Estreno en tu lista'
        : 'Puede que te guste'
    };
  })
    .filter((x) => x.punto > -100)
    .sort((a, b) => b.punto - a.punto)
    .slice(0, limite);
}

/* ------------------------------ Reproductor ------------------------------- */

const esMixto = (url) => location.protocol === 'https:' && /^http:\/\//i.test(url);
const aHttps = (url) => url.replace(/^http:\/\//i, 'https://');

/** Enlaces para abrir el canal en VLC, que sí reproduce http en el iPhone. */
const enlaceVLC = (url) => `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`;

export function reproduce(item, url, subtitulo) {
  if (item.id) {
    estado.vistos[item.id] = { at: Date.now(), ...(estado.vistos[item.id] || {}) };
    guardaVistos();
  }

  const cerrar = () => { capa.remove(); document.removeEventListener('keydown', escuchaEsc); };
  const escuchaEsc = (e) => { if (e.key === 'Escape') cerrar(); };

  const video = el('video', { controls: true, autoplay: true, playsInline: true, preload: 'auto' });
  const barra = el('div', { class: 'bar' },
    el('button', { class: 'round', onclick: cerrar, 'aria-label': 'Cerrar' }, icono('cerrar')),
    el('div', {},
      el('div', { class: 't' }, item.titulo),
      subtitulo ? el('div', { class: 's' }, subtitulo) : null));

  const capa = el('div', { class: 'player' }, video, barra);
  document.body.append(capa);
  document.addEventListener('keydown', escuchaEsc);

  const panelBloqueado = (motivo) => {
    video.remove();
    capa.append(el('div', { class: 'aviso-mixto' },
      el('strong', {}, 'Este canal no se puede reproducir aquí'),
      el('p', {}, motivo),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('a', { class: 'btn', href: enlaceVLC(url) }, 'Abrir en VLC'),
        el('button', {
          class: 'btn sec',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(url);
              aviso('Enlace copiado');
            } catch {
              aviso('Mantén pulsado el enlace para copiarlo');
            }
          }
        }, 'Copiar enlace'))));
  };

  let intentadoHttps = false;
  video.addEventListener('error', () => {
    if (esMixto(url) && !intentadoHttps) {
      // Muchos servidores sirven lo mismo por https en el mismo dominio.
      intentadoHttps = true;
      video.src = aHttps(url);
      video.play().catch(() => {});
      return;
    }
    panelBloqueado(esMixto(url)
      ? 'Tu lista sirve el vídeo por http y el iPhone no deja mezclarlo con una página https. VLC sí puede: es gratis y se abre con un toque.'
      : 'El servidor de la lista no responde o el canal ya no existe. Prueba con otra fuente o vuelve a cargar la lista.');
  });

  video.src = esMixto(url) ? aHttps(url) : url;
  video.play().catch(() => { /* iOS pide un toque: los controles ya están */ });
}

/* ------------------------------ Componentes ------------------------------- */

const hash = (t) => { let h = 0; for (const c of String(t)) h = (h * 31 + c.codePointAt(0)) % 100000; return h; };
const arte = (t) => `linear-gradient(155deg, hsl(${hash(t) % 360} 62% 46%), hsl(${(hash(t) % 360 + 46) % 360} 58% 26%))`;
const monograma = (t) => String(t).split(/[\s:]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function marcaFavorito(item, alCambiar) {
  const activo = estado.favoritos.has(item.id);
  if (activo) estado.favoritos.delete(item.id);
  else estado.favoritos.add(item.id);
  guardaFavoritos();
  aviso(activo ? 'Quitado de favoritos' : 'Añadido a favoritos');
  alCambiar?.(!activo);
  return !activo;
}

export function tarjeta(item, motivo) {
  const caja = el('div', { class: 'poster', style: { background: arte(item.titulo) } },
    el('div', { class: 'mono' }, monograma(item.titulo)));

  if (item.poster) {
    const img = el('img', { src: item.poster, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    caja.append(img);
  }
  if (item.nota) {
    caja.append(el('div', { class: 'badge' }, icono('estrella', true), Number(item.nota).toFixed(1)));
  } else if (item.tipo === 'serie' && item.numTemporadas) {
    caja.append(el('div', { class: 'badge plain' }, `${item.numTemporadas} temp.`));
  }

  const corazon = el('button', {
    class: `fav ${estado.favoritos.has(item.id) ? 'on' : ''}`,
    'aria-label': `Guardar ${item.titulo} en favoritos`,
    onclick: (e) => {
      e.stopPropagation();
      marcaFavorito(item, (activo) => {
        corazon.classList.toggle('on', activo);
        vaciar(corazon).append(icono('corazon', activo));
      });
    }
  }, icono('corazon', estado.favoritos.has(item.id)));
  caja.append(corazon);

  const detalle = motivo || (item.tipo === 'serie'
    ? `${item.numTemporadas} temp. · ${item.episodios} ep.`
    : [item.anyo, item.fuentes?.length > 1 ? `${item.fuentes.length} fuentes` : null].filter(Boolean).join(' · '));

  return el('button', { class: 'card', onclick: () => abreFicha(item) },
    caja,
    el('div', { class: 'meta' },
      el('div', { class: 'name' }, item.titulo),
      el('div', { class: 'sub' }, detalle || '')));
}

export function filaCanal(canal) {
  const logo = el('div', { class: 'logo', style: { background: arte(canal.titulo) } }, monograma(canal.titulo));
  if (canal.logo) {
    const img = el('img', { src: canal.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    vaciar(logo).append(img);
  }

  const corazon = el('button', {
    class: `heart ${estado.favoritos.has(canal.id) ? 'on' : ''}`,
    'aria-label': `Guardar ${canal.titulo} en favoritos`,
    onclick: (e) => {
      e.stopPropagation();
      marcaFavorito(canal, (activo) => {
        corazon.classList.toggle('on', activo);
        vaciar(corazon).append(icono('corazon', activo));
      });
    }
  }, icono('corazon', estado.favoritos.has(canal.id)));

  return el('div', { class: 'channel' },
    el('button', { style: { display: 'contents' }, onclick: () => reproduce(canal, canal.url, canal.grupo) },
      logo,
      el('div', { class: 'info' },
        el('div', { class: 'n' }, canal.titulo),
        el('div', { class: 'g' }, canal.grupo))),
    corazon);
}

export function carrusel(titulo, items, opciones = {}) {
  if (!items?.length) return null;
  return el('section', { class: 'section' },
    el('div', { class: 'sec-head' },
      el('h2', { class: 'sec-title' }, titulo),
      opciones.sub ? el('span', { class: 'sec-sub' }, opciones.sub) : null,
      opciones.ir ? el('button', { class: 'sec-more', onclick: () => ve(opciones.ir) }, 'Ver todo') : null),
    el('div', { class: 'rail' }, items.map((x) => x.item ? tarjeta(x.item, opciones.motivos ? x.motivo : null) : tarjeta(x))));
}

export function vacio(ico, titulo, texto, accion) {
  return el('div', { class: 'empty' },
    el('div', { class: 'ico' }, ico),
    el('h3', {}, titulo),
    texto ? el('p', {}, texto) : null,
    accion ? el('button', { class: 'btn', style: { marginTop: '8px' }, onclick: accion.alPulsar }, accion.texto) : null);
}

/** Rejilla que pinta por tandas: con listas de miles de títulos el móvil lo agradece. */
function rejillaPorTandas(items, porTanda = 60) {
  const contenedor = el('div', {});
  const rejilla = el('div', { class: 'grid' });
  const masCaja = el('div', { style: { display: 'grid', placeItems: 'center', padding: '18px' } });
  let pintados = 0;

  const pinta = () => {
    const trozo = items.slice(pintados, pintados + porTanda);
    for (const item of trozo) rejilla.append(tarjeta(item));
    pintados += trozo.length;
    vaciar(masCaja);
    if (pintados < items.length) {
      masCaja.append(el('button', { class: 'btn sec', onclick: pinta },
        `Ver más (${numero(items.length - pintados)} restantes)`));
    }
  };
  pinta();
  contenedor.append(rejilla, masCaja);
  return contenedor;
}

/* --------------------------------- Ficha ---------------------------------- */

let fichaAbierta = null;
export function cierraFicha() { fichaAbierta?.remove(); fichaAbierta = null; }

export function abreFicha(item) {
  if (item.tipo === 'canal') return reproduce(item, item.url, item.grupo);
  cierraFicha();

  const cerrar = () => { fondo.remove(); fichaAbierta = null; document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') cerrar(); };

  const botonFav = el('button', { class: 'btn sec' },
    icono('corazon', estado.favoritos.has(item.id)),
    estado.favoritos.has(item.id) ? 'En favoritos' : 'Añadir a favoritos');
  botonFav.addEventListener('click', () => {
    const activo = marcaFavorito(item);
    botonFav.replaceChildren(icono('corazon', activo), activo ? 'En favoritos' : 'Añadir a favoritos');
  });

  const datos = el('div', { class: 'sheet-facts' });
  if (item.nota) datos.append(el('span', { class: 'pill' }, `★ ${Number(item.nota).toFixed(1)}`));
  if (item.anyo) datos.append(el('span', {}, String(item.anyo)));
  for (const g of (item.generos || []).slice(0, 3)) datos.append(el('span', { class: 'pill' }, g));
  if (item.tipo === 'serie') datos.append(el('span', {}, `${item.numTemporadas} temporadas · ${numero(item.episodios)} episodios`));
  for (const g of (item.grupos || []).slice(0, 3)) datos.append(el('span', { class: 'pill' }, g));

  const cuerpo = el('div', { class: 'sheet-body flush' },
    el('h2', {}, item.titulo),
    datos,
    el('div', { class: 'sheet-actions' }, accionPrincipal(item), botonFav),
    item.sinopsis ? el('p', { class: 'plot' }, item.sinopsis) : null);

  if (item.tipo === 'serie') {
    if (item.pendiente) {
      const cargando = el('p', { class: 'page-sub' }, 'Cargando episodios…');
      cuerpo.append(cargando);
      completaSerie(item)
        .then(() => { cargando.remove(); cuerpo.append(bloqueTemporadas(item)); accionesFicha(cuerpo, item); })
        .catch((err) => { cargando.textContent = `No se han podido cargar los episodios: ${err.message}`; });
    } else {
      cuerpo.append(bloqueTemporadas(item));
    }
  } else if (item.fuentes?.length > 1) {
    cuerpo.append(bloqueFuentes(item));
  }

  const ficha = el('div', { class: 'sheet' },
    el('button', { class: 'sheet-close', onclick: cerrar, 'aria-label': 'Cerrar' }, icono('cerrar')),
    cuerpo);
  const fondo = el('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === fondo) cerrar(); } }, ficha);

  document.body.append(fondo);
  fichaAbierta = fondo;
  document.addEventListener('keydown', esc);
}

/** Rehace el botón de reproducir cuando los episodios llegan más tarde. */
function accionesFicha(cuerpo, item) {
  const acciones = cuerpo.querySelector('.sheet-actions');
  if (acciones) acciones.replaceChild(accionPrincipal(item), acciones.firstChild);
}

function accionPrincipal(item) {
  if (item.tipo === 'peli') {
    const fuente = item.fuentes?.[0];
    if (!fuente) return el('span', { class: 'sec-sub' }, 'Sin fuentes disponibles');
    return el('button', { class: 'btn', onclick: () => reproduce(item, fuente.url, fuente.etiqueta) },
      icono('play', true), 'Reproducir');
  }
  const temporadas = Object.keys(item.temporadas).sort((a, b) => a - b);
  const primero = temporadas.length ? item.temporadas[temporadas[0]][0] : null;
  if (!primero) return el('span', { class: 'sec-sub' }, 'Sin episodios disponibles');
  return el('button', {
    class: 'btn',
    onclick: () => reproduce(item, primero.url, `T${temporadas[0]} · E${primero.n}`)
  }, icono('play', true), `Reproducir T${temporadas[0]} E${primero.n}`);
}

function bloqueFuentes(peli) {
  return el('div', { class: 'section' },
    el('div', { class: 'sec-head' }, el('h2', { class: 'sec-title' }, 'Fuentes')),
    el('div', {}, peli.fuentes.map((f, i) =>
      el('button', { class: 'ep', onclick: () => reproduce(peli, f.url, f.etiqueta) },
        el('div', { class: 'n' }, String(i + 1)),
        el('div', {}, el('div', { class: 't' }, f.etiqueta || `Fuente ${i + 1}`)),
        el('div', { class: 'go' }, icono('play', true))))));
}

function bloqueTemporadas(serie) {
  const temporadas = Object.keys(serie.temporadas).sort((a, b) => a - b);
  if (!temporadas.length) return null;
  const lista = el('div', {});
  const chips = el('div', { class: 'chips' });

  const pinta = (num) => {
    vaciar(lista);
    for (const ep of serie.temporadas[num]) {
      lista.append(el('button', {
        class: 'ep',
        onclick: () => reproduce(serie, ep.url, `T${num} · E${ep.n}${ep.titulo ? ` — ${ep.titulo}` : ''}`)
      },
        el('div', { class: 'n' }, String(ep.n)),
        el('div', {},
          el('div', { class: 't' }, ep.titulo || `Episodio ${ep.n}`),
          ep.etiquetas?.length ? el('div', { class: 'd' }, ep.etiquetas.join(' · ')) : null),
        el('div', { class: 'go' }, icono('play', true))));
    }
  };

  temporadas.forEach((num, i) => {
    const chip = el('button', {
      class: `chip ${i === 0 ? 'active' : ''}`,
      onclick: () => {
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        pinta(num);
      }
    }, `Temporada ${num}`);
    chips.append(chip);
  });
  pinta(temporadas[0]);

  return el('div', { class: 'section' },
    el('div', { class: 'sec-head' }, el('h2', { class: 'sec-title' }, 'Episodios')),
    chips, lista);
}

/* --------------------------------- Vistas --------------------------------- */

/** Lee la lista del portapapeles (la deja ahí el atajo) y rehace el catálogo. */
export async function cargaDesdePortapapeles(informa) {
  if (!navigator.clipboard?.readText) throw new Error('este navegador no deja leer el portapapeles');
  const texto = await navigator.clipboard.readText();
  if (!texto || !texto.includes('#EXT')) throw new Error('en el portapapeles no hay ninguna lista');
  informa?.('Ordenando la lista…');
  const entradas = parseaM3U(texto);
  const catalogo = construyeCatalogo(entradas, { filtroAdulto: estado.ajustes.filtroAdulto });
  await guardaCatalogo(catalogo, { tipo: 'atajo', nombre: 'Lista copiada con Atajos', cuando: Date.now(), entradas: entradas.length });
  return catalogo;
}

const cabecera = (titulo, sub) => [
  el('h1', { class: 'page-title' }, titulo),
  sub ? el('p', { class: 'page-sub' }, sub) : null
];

/** Alta de la lista: lo primero que ve alguien que abre la app vacía. */
function vistaAlta() {
  const caja = el('div', { class: 'onboarding' });

  caja.append(
    el('div', { class: 'marca' },
      el('img', { class: 'logo', src: 'icons/logo.png', alt: '' }),
      el('img', { class: 'logotipo', src: 'icons/wordmark.png', alt: 'Cookie Play' })),
    el('h1', {}, 'Carga tu lista y listo'),
    el('p', { class: 'intro' },
      'Cookie Play ordena tu lista en películas, series y canales. Todo se queda guardado en este teléfono: la lista no se sube a ningún sitio.'));

  const area = el('textarea', { placeholder: '#EXTM3U\n#EXTINF:-1 …' });
  const progreso = el('div', { class: 'progreso' });
  const barra = el('div', { class: 'barra' }, el('i', {}));
  const paso = (texto) => {
    progreso.replaceChildren(texto, barra);
    if (!progreso.isConnected) caja.append(progreso);
  };
  const avance = (pct) => { barra.firstChild.style.width = `${pct}%`; };

  async function procesa(texto, origen) {
    if (!String(texto).includes('#EXT')) {
      aviso('Ese archivo no parece una lista M3U');
      return;
    }
    paso('Leyendo la lista…');
    avance(25);
    await new Promise((r) => setTimeout(r, 30));      // deja pintar antes de bloquear
    const entradas = parseaM3U(texto);
    paso(`Ordenando ${numero(entradas.length)} entradas…`);
    avance(65);
    await new Promise((r) => setTimeout(r, 30));
    const catalogo = construyeCatalogo(entradas, { filtroAdulto: estado.ajustes.filtroAdulto });
    paso('Guardando en el teléfono…');
    avance(90);
    try {
      await guardaCatalogo(catalogo, { ...origen, cuando: Date.now(), entradas: entradas.length });
    } catch (err) {
      aviso('No se pudo guardar la lista en el teléfono');
      paso(`Error al guardar: ${err.message}`);
      return;
    }
    avance(100);
    aviso(`Listo: ${numero(catalogo.pelis.length)} pelis, ${numero(catalogo.series.length)} series, ${numero(catalogo.canales.length)} canales`);
    ve('inicio');
  }

  // 0. Atajos: es la única forma en el iPhone de pedirle la lista al proveedor
  //    sin las restricciones del navegador. Copia y se pega aquí de un toque.
  const botonPegar = el('button', { class: 'btn' }, 'Pegar la lista copiada');
  botonPegar.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('sin acceso al portapapeles');
      const texto = await navigator.clipboard.readText();
      if (!texto || !texto.includes('#EXT')) {
        aviso('En el portapapeles no hay ninguna lista');
        return;
      }
      await procesa(texto, { tipo: 'atajo', nombre: 'Lista copiada con Atajos' });
    } catch {
      aviso('Pégala a mano en el recuadro de abajo');
      area.focus();
      area.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  caja.append(el('div', { class: 'card-opcion' },
    el('h2', {}, 'Con la app Atajos (lo más cómodo en iPhone)'),
    el('p', {}, 'Tu proveedor no atiende a Safari, pero sí a Atajos. Se prepara una vez en dos minutos y luego es un toque cada vez que quieras actualizar.'),
    el('div', { class: 'paso' }, el('div', { class: 'num' }, '1'),
      el('div', { class: 'txt' }, 'Abre ', el('strong', {}, 'Atajos'), ' → ', el('strong', {}, '+'), ' → ', el('strong', {}, 'Añadir acción'), ' → busca ', el('strong', {}, '«Obtener contenido de la URL»'), ' y pega ahí la dirección de tu lista.')),
    el('div', { class: 'paso' }, el('div', { class: 'num' }, '2'),
      el('div', { class: 'txt' }, 'Añade debajo la acción ', el('strong', {}, '«Copiar en el portapapeles»'), '. Ponle nombre, por ejemplo ', el('strong', {}, 'Lista IPTV'), ', y guarda.')),
    el('div', { class: 'paso' }, el('div', { class: 'num' }, '3'),
      el('div', { class: 'txt' }, 'Ejecuta el atajo (tarda unos segundos) y vuelve aquí.')),
    el('div', { class: 'paso' }, el('div', { class: 'num' }, '4'),
      el('div', { class: 'txt' }, 'Pulsa el botón de abajo y acepta cuando el iPhone pregunte si quieres pegar.')),
    botonPegar));

  // 1. Archivo guardado en el iPhone
  // Sin filtro de extensión: Safari suele guardar la lista como "get.php".
  const selector = el('input', { type: 'file', style: { display: 'none' } });
  selector.addEventListener('change', async () => {
    const archivo = selector.files?.[0];
    if (!archivo) return;
    procesa(await archivo.text(), { tipo: 'archivo', nombre: archivo.name });
  });

  caja.append(el('div', { class: 'card-opcion' },
    el('h2', {}, 'Desde un archivo (la vía que siempre funciona)'),
    el('p', {}, 'Descargas la lista en el iPhone una vez y la cargas aquí. Después ya no hace falta repetirlo.'),
    el('div', { class: 'paso' }, el('div', { class: 'num' }, '1'),
      el('div', { class: 'txt' }, 'Abre en Safari el enlace de tu proveedor y pulsa ', el('strong', {}, 'Descargar'), '.')),
    el('div', { class: 'paso' }, el('div', { class: 'num' }, '2'),
      el('div', { class: 'txt' }, 'Vuelve aquí y elige el archivo en ', el('strong', {}, 'Descargas'), '. Puede llamarse ', el('strong', {}, 'get.php'), ' en vez de acabar en .m3u: da igual, sirve.')),
    el('div', { class: 'paso' }, el('div', { class: 'num' }, '3'),
      el('div', { class: 'txt' }, 'Si Safari te enseña un montón de texto en vez de descargar nada, mantén pulsado, ', el('strong', {}, 'Seleccionar todo → Copiar'), ', y pégalo abajo del todo.')),
    selector,
    el('button', { class: 'btn', onclick: () => selector.click() }, 'Elegir el archivo de la lista')));

  // 2. Desde la dirección: se prueba la descarga directa y, si no, la API del panel
  const campoUrl = el('input', { type: 'url', placeholder: 'https://servidor/get.php?username=…&type=m3u_plus', autocapitalize: 'off', autocorrect: 'off', spellcheck: false });
  const botonUrl = el('button', { class: 'btn' }, 'Cargar desde la URL');
  const ayudaUrl = el('div', {});

  botonUrl.addEventListener('click', async () => {
    const url = campoUrl.value.trim();
    if (!url) return aviso('Pega antes la dirección de tu lista');
    vaciar(ayudaUrl);
    botonUrl.disabled = true;
    const fallos = [];

    // Intento 1: descargar el .m3u tal cual.
    paso('Descargando la lista…');
    avance(15);
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`el servidor respondió ${res.status}`);
      await procesa(await res.text(), { tipo: 'url', nombre: url });
      botonUrl.disabled = false;
      return;
    } catch (err) {
      fallos.push(`descarga directa: ${err.message}`);
    }

    // Intento 2: la API del panel (Xtream). Muchos la dejan abierta aunque
    // bloqueen el .m3u, y además trae valoraciones, géneros y carátulas.
    const cuenta = credencialesDesdeUrl(url);
    if (cuenta) {
      try {
        paso('Probando con la API de tu proveedor…');
        avance(35);
        const catalogo = await catalogoDesdeXtream(cuenta, (texto) => paso(texto));
        paso('Guardando en el teléfono…');
        avance(90);
        await guardaCatalogo(catalogo, { tipo: 'xtream', nombre: cuenta.base.replace(/^https?:\/\//, ''), cuando: Date.now(), entradas: catalogo.pelis.length + catalogo.series.length + catalogo.canales.length });
        avance(100);
        aviso(`Listo: ${numero(catalogo.pelis.length)} pelis, ${numero(catalogo.series.length)} series, ${numero(catalogo.canales.length)} canales`);
        botonUrl.disabled = false;
        ve('inicio');
        return;
      } catch (err) {
        fallos.push(`API del panel: ${err.message}`);
      }
    }

    // Las dos vías fallaron: se explica y se ofrece el camino del archivo.
    paso('No se ha podido cargar desde la dirección.');
    avance(0);
    ayudaUrl.append(el('div', { class: 'nota-aviso' },
      el('strong', {}, 'Tu proveedor no atiende peticiones hechas desde una web. '),
      'Es lo más habitual, y tiene solución en dos toques:',
      el('div', { class: 'paso', style: { marginTop: '12px' } }, el('div', { class: 'num' }, '1'),
        el('div', { class: 'txt' }, 'Pulsa ', el('strong', {}, 'Abrir la lista en Safari'), ' y, cuando pregunte, ', el('strong', {}, 'Descargar'), '.')),
      el('div', { class: 'paso' }, el('div', { class: 'num' }, '2'),
        el('div', { class: 'txt' }, 'Vuelve a esta pestaña y pulsa ', el('strong', {}, 'Elegir el archivo descargado'), ' (estará en Descargas, quizá llamado ', el('strong', {}, 'get.php'), ').')),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' } },
        el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Abrir la lista en Safari'),
        el('button', { class: 'btn', onclick: () => selector.click() }, 'Elegir el archivo descargado'),
        el('button', {
          class: 'btn sec',
          onclick: async () => {
            try { await navigator.clipboard.writeText(url); aviso('Dirección copiada'); }
            catch { aviso('Mantén pulsado el campo para copiarla'); }
          }
        }, 'Copiar la dirección')),
      el('div', { style: { marginTop: '10px', fontSize: '12px', opacity: '0.75' } },
        'Si Safari muestra el texto de la lista en vez de descargarla: mantén pulsado, Seleccionar todo, Copiar, y pégalo en «Pegar el contenido».'),
      el('div', { style: { marginTop: '6px', fontSize: '12px', opacity: '0.6' } }, `Detalle técnico — ${fallos.join(' · ')}`)));
    botonUrl.disabled = false;
  });

  caja.append(el('div', { class: 'card-opcion' },
    el('h2', {}, 'Desde la dirección de tu lista'),
    el('p', {}, 'Pega el enlace de tu proveedor. Pruebo dos formas: la descarga directa y la API del panel.'),
    campoUrl, botonUrl, ayudaUrl));

  // 3. Pegar el contenido a mano
  caja.append(el('div', { class: 'card-opcion' },
    el('h2', {}, 'Pegar el contenido'),
    el('p', {}, 'Para listas pequeñas o para probar.'),
    area,
    el('button', { class: 'btn sec', onclick: () => procesa(area.value, { tipo: 'pegada', nombre: 'Lista pegada' }) }, 'Cargar lo pegado')));

  return caja;
}

function vistaInicio() {
  const catalogo = estado.catalogo;
  const nodos = [];
  const recomendadas = recomienda(catalogo, 16);
  const destacada = recomendadas[0];

  if (destacada) {
    const item = destacada.item;
    nodos.push(el('div', { class: 'hero', style: { background: arte(item.titulo) } },
      el('div', { class: 'body' },
        el('div', { class: 'eyebrow' }, destacada.motivo),
        el('h2', {}, item.titulo),
        el('div', { class: 'facts' },
          item.anyo ? el('span', {}, String(item.anyo)) : null,
          item.tipo === 'serie' ? el('span', {}, `${item.numTemporadas} temporadas`) : null,
          item.grupos?.[0] ? el('span', {}, item.grupos[0]) : null),
        el('div', { class: 'actions' },
          el('button', { class: 'btn', onclick: () => abreFicha(item) }, icono('play', true), 'Ver ficha')))));
  }

  const continuar = Object.keys(estado.vistos)
    .map((id) => [...catalogo.pelis, ...catalogo.series].find((i) => i.id === id))
    .filter(Boolean).slice(0, 12);
  const canalesFav = catalogo.canales.filter((c) => estado.favoritos.has(c.id)).slice(0, 8);

  for (const seccion of [
    carrusel('Continuar viendo', continuar, { sub: 'Donde lo dejaste' }),
    carrusel('Recomendado para ti', recomendadas.slice(1), { sub: 'Según lo que guardas y ves', motivos: true, ir: 'recomendados' }),
    carrusel('Películas', catalogo.pelis.slice(0, 14), { ir: 'pelis' }),
    carrusel('Series', catalogo.series.slice(0, 14), { ir: 'series' })
  ]) if (seccion) nodos.push(seccion);

  if (canalesFav.length) {
    nodos.push(el('section', { class: 'section' },
      el('div', { class: 'sec-head' },
        el('h2', { class: 'sec-title' }, 'Tus canales'),
        el('button', { class: 'sec-more', onclick: () => ve('favoritos') }, 'Ver todo')),
      el('div', { class: 'channels' }, canalesFav.map(filaCanal))));
  }
  return nodos;
}

function vistaCatalogo(tipo) {
  const items = tipo === 'peli' ? estado.catalogo.pelis : estado.catalogo.series;
  const grupos = new Map();
  for (const item of items) for (const g of item.grupos || []) grupos.set(g, (grupos.get(g) || 0) + 1);

  const contenedor = el('div', {});
  const chips = el('div', { class: 'chips' });
  let filtro = '';

  const pinta = () => {
    const lista = filtro ? items.filter((i) => (i.grupos || []).includes(filtro)) : items;
    vaciar(contenedor).append(lista.length
      ? rejillaPorTandas(lista)
      : vacio('🔍', 'Nada en esta categoría', 'Prueba con otra.'));
  };
  const marca = (nodo) => { chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); nodo.classList.add('active'); };

  const todo = el('button', { class: 'chip active', onclick: () => { filtro = ''; marca(todo); pinta(); } }, 'Todo');
  chips.append(todo);
  for (const [nombre, cuenta] of [...grupos].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    const chip = el('button', { class: 'chip', onclick: () => { filtro = nombre; marca(chip); pinta(); } }, `${nombre} · ${cuenta}`);
    chips.append(chip);
  }
  pinta();

  return [
    ...cabecera(tipo === 'peli' ? 'Películas' : 'Series', `${numero(items.length)} en tu lista`),
    chips,
    contenedor
  ];
}

function vistaTV() {
  const canales = estado.catalogo.canales;
  const grupos = new Map();
  for (const c of canales) grupos.set(c.grupo, (grupos.get(c.grupo) || 0) + 1);

  const buscador = el('input', { type: 'search', placeholder: 'Filtrar canales…', autocapitalize: 'off' });
  const chips = el('div', { class: 'chips' });
  const lista = el('div', {});
  let grupo = '';

  const pinta = () => {
    const termino = sinTildes(buscador.value.trim());
    const filtrados = canales.filter((c) =>
      (!grupo || c.grupo === grupo) && (!termino || sinTildes(c.titulo).includes(termino)));
    vaciar(lista);
    if (!filtrados.length) return lista.append(vacio('📡', 'Ningún canal', 'Cambia de categoría o borra el filtro.'));
    const trozo = filtrados.slice(0, 200);
    lista.append(el('div', { class: 'channels' }, trozo.map(filaCanal)));
    if (filtrados.length > trozo.length) {
      lista.append(el('p', { class: 'page-sub', style: { textAlign: 'center', padding: '16px' } },
        `Mostrando 200 de ${numero(filtrados.length)}. Afina con el filtro o elige categoría.`));
    }
  };
  buscador.addEventListener('input', retrasa(pinta, 180));

  const marca = (nodo) => { chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); nodo.classList.add('active'); };
  const todos = el('button', { class: 'chip active', onclick: () => { grupo = ''; marca(todos); pinta(); } }, 'Todos');
  chips.append(todos);
  for (const [nombre, cuenta] of [...grupos].sort((a, b) => b[1] - a[1])) {
    const chip = el('button', { class: 'chip', onclick: () => { grupo = nombre; marca(chip); pinta(); } }, `${nombre} · ${cuenta}`);
    chips.append(chip);
  }
  pinta();

  return [
    ...cabecera('TV en directo', `${numero(canales.length)} canales`),
    el('div', { class: 'toolbar' }, el('div', { class: 'search', style: { margin: '0', maxWidth: '320px' } }, icono('buscar'), buscador)),
    chips,
    lista
  ];
}

function vistaRecomendados() {
  const rejilla = el('div', {});
  const pinta = (tipo) => {
    const items = recomienda(estado.catalogo, 40, tipo);
    vaciar(rejilla).append(items.length
      ? el('div', { class: 'grid' }, items.map((x) => tarjeta(x.item, x.motivo)))
      : vacio('✨', 'Sin recomendaciones', 'Guarda algún favorito para afinar la selección.'));
  };
  const filtro = el('div', { class: 'segmented' });
  [['', 'Todo'], ['peli', 'Películas'], ['serie', 'Series']].forEach(([valor, etiqueta], i) => {
    const boton = el('button', {
      class: i === 0 ? 'active' : '',
      onclick: () => {
        filtro.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        boton.classList.add('active');
        pinta(valor || undefined);
      }
    }, etiqueta);
    filtro.append(boton);
  });
  pinta();

  return [...cabecera('Recomendado para ti', 'Por afinidad con lo que guardas y ves'), el('div', { class: 'toolbar' }, filtro), rejilla];
}

function vistaFavoritos() {
  const todos = [...estado.catalogo.pelis, ...estado.catalogo.series, ...estado.catalogo.canales]
    .filter((i) => estado.favoritos.has(i.id));
  if (!todos.length) {
    return [...cabecera('Favoritos'), vacio('♡', 'Todavía no hay favoritos', 'Pulsa el corazón en cualquier película, serie o canal.')];
  }
  const seccion = (titulo, contenido) => el('section', { class: 'section' },
    el('div', { class: 'sec-head' }, el('h2', { class: 'sec-title' }, titulo)), contenido);

  const series = todos.filter((i) => i.tipo === 'serie');
  const pelis = todos.filter((i) => i.tipo === 'peli');
  const canales = todos.filter((i) => i.tipo === 'canal');
  const salida = cabecera('Favoritos', `${todos.length} guardados en este teléfono`);
  if (series.length) salida.push(seccion('Series', el('div', { class: 'grid' }, series.map((i) => tarjeta(i)))));
  if (pelis.length) salida.push(seccion('Películas', el('div', { class: 'grid' }, pelis.map((i) => tarjeta(i)))));
  if (canales.length) salida.push(seccion('Canales', el('div', { class: 'channels' }, canales.map(filaCanal))));
  return salida;
}

function vistaBuscar() {
  const consulta = estado.busqueda;
  if (!consulta) return cabecera('Buscar', 'Escribe arriba para buscar en toda tu lista');
  const resultados = busca(estado.catalogo, consulta);
  if (!resultados.length) {
    return [...cabecera('Buscar', `Sin resultados para «${consulta}»`),
      vacio('🔍', 'Nada coincide', 'Prueba con menos palabras.')];
  }
  const series = resultados.filter((i) => i.tipo === 'serie');
  const pelis = resultados.filter((i) => i.tipo === 'peli');
  const canales = resultados.filter((i) => i.tipo === 'canal');
  const seccion = (titulo, contenido) => el('section', { class: 'section' },
    el('div', { class: 'sec-head' }, el('h2', { class: 'sec-title' }, titulo)), contenido);

  const salida = cabecera('Buscar', `${resultados.length} resultados para «${consulta}»`);
  if (series.length) salida.push(seccion(`Series · ${series.length}`, el('div', { class: 'grid' }, series.map((i) => tarjeta(i)))));
  if (pelis.length) salida.push(seccion(`Películas · ${pelis.length}`, el('div', { class: 'grid' }, pelis.map((i) => tarjeta(i)))));
  if (canales.length) salida.push(seccion(`Canales · ${canales.length}`, el('div', { class: 'channels' }, canales.map(filaCanal))));
  return salida;
}

function vistaAjustes() {
  const origen = estado.origen || {};
  const catalogo = estado.catalogo;

  const interruptor = el('button', { class: `switch ${estado.ajustes.filtroAdulto ? 'on' : ''}` }, el('i', {}));
  interruptor.addEventListener('click', () => {
    estado.ajustes.filtroAdulto = !estado.ajustes.filtroAdulto;
    interruptor.classList.toggle('on', estado.ajustes.filtroAdulto);
    guardaAjustes();
    aviso('Se aplicará cuando vuelvas a cargar la lista');
  });

  const tema = el('select', {},
    el('option', { value: 'sistema' }, 'Automático (como el iPhone)'),
    el('option', { value: 'claro' }, 'Claro'),
    el('option', { value: 'oscuro' }, 'Oscuro'));
  tema.value = estado.ajustes.tema || 'sistema';
  tema.addEventListener('change', () => {
    estado.ajustes.tema = tema.value;
    guardaAjustes();
    aplicaTema();
  });

  return [
    ...cabecera('Ajustes', 'Todo se guarda solo en este teléfono'),
    el('div', { class: 'card-opcion' },
      el('h2', {}, 'Tu lista'),
      el('div', { class: 'lista-info' },
        el('div', {},
          el('div', { class: 'n' }, origen.nombre || 'Lista cargada'),
          el('div', { class: 'd' }, `${numero(origen.entradas || 0)} entradas · ${numero(catalogo.pelis.length)} pelis · ${numero(catalogo.series.length)} series · ${numero(catalogo.canales.length)} canales`))),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
        el('button', {
          class: 'btn',
          onclick: async (evento) => {
            const boton = evento.currentTarget;
            boton.disabled = true;
            boton.textContent = 'Actualizando…';
            try {
              const catalogo = await cargaDesdePortapapeles();
              aviso(`Actualizada: ${numero(catalogo.pelis.length)} pelis, ${numero(catalogo.series.length)} series, ${numero(catalogo.canales.length)} canales`);
              ve('inicio');
            } catch (err) {
              aviso(`No se ha podido actualizar: ${err.message}`);
              boton.disabled = false;
              boton.textContent = 'Actualizar desde el portapapeles';
            }
          }
        }, 'Actualizar desde el portapapeles'),
        el('button', { class: 'btn sec', onclick: () => ve('alta') }, 'Cargar otra lista'),
        el('button', {
          class: 'btn sec',
          onclick: async () => {
            if (!confirm('¿Borrar la lista de este teléfono? Los favoritos se conservan.')) return;
            await olvidaCatalogo();
            aviso('Lista borrada');
            ve('alta');
          }
        }, 'Borrar la lista'))),
    el('div', { class: 'card-opcion' },
      el('h2', {}, 'Preferencias'),
      el('div', { class: 'switch-row' },
        el('div', { class: 'label' }, 'Ocultar contenido adulto', el('small', {}, 'Filtra las categorías marcadas como XXX o +18')),
        el('div', { class: 'spacer' }), interruptor),
      el('div', { class: 'switch-row' },
        el('div', { class: 'label' }, 'Apariencia'),
        el('div', { class: 'spacer' }), tema)),
    el('div', { class: 'nota-aviso' },
      el('strong', {}, 'Para actualizar la lista: '),
      'ejecuta tu atajo de Atajos (copia la lista al portapapeles) y pulsa «Actualizar desde el portapapeles». Los favoritos se mantienen.'),
    el('div', { class: 'nota-aviso' },
      el('strong', {}, 'Si un canal no arranca: '),
      'tu lista sirve el vídeo por http y el iPhone no lo mezcla con una página https. En esos casos la app te ofrece abrirlo en VLC, que es gratis y sí puede.')
  ];
}

/* ------------------------- Navegación y arranque -------------------------- */

const MENU = [
  { id: 'inicio', etiqueta: 'Inicio', icono: 'inicio' },
  { id: 'recomendados', etiqueta: 'Recomendados', icono: 'chispa' },
  { id: 'pelis', etiqueta: 'Películas', icono: 'peli', total: () => estado.catalogo?.pelis.length },
  { id: 'series', etiqueta: 'Series', icono: 'serie', total: () => estado.catalogo?.series.length },
  { id: 'tv', etiqueta: 'TV en directo', icono: 'tv', total: () => estado.catalogo?.canales.length },
  { id: 'favoritos', etiqueta: 'Favoritos', icono: 'corazon', total: () => estado.favoritos.size },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: 'ajustes' }
];
const MENU_MOVIL = ['inicio', 'pelis', 'series', 'tv', 'favoritos'];

export function ve(destino) {
  estado.vista = destino;
  if (destino !== 'buscar') {
    estado.busqueda = '';
    const campo = document.getElementById('buscador');
    if (campo) campo.value = '';
  }
  pinta();
  document.querySelector('.content')?.scrollTo({ top: 0 });
  window.scrollTo({ top: 0 });
}

export function aplicaTema() {
  const raiz = document.documentElement;
  const tema = estado.ajustes.tema;
  if (tema === 'claro') raiz.dataset.theme = 'light';
  else if (tema === 'oscuro') raiz.dataset.theme = 'dark';
  else delete raiz.dataset.theme;
}

function pintaMenu() {
  const barra = document.getElementById('sidebar');
  vaciar(barra).append(el('div', { class: 'brand' },
    el('img', { src: 'icons/logo.png', alt: '', width: 30, height: 30 }),
    'Cookie Play'));

  const hayCatalogo = Boolean(estado.catalogo);
  for (const item of MENU) {
    if (item.id === 'ajustes') barra.append(el('div', { class: 'nav-label' }, 'Biblioteca'));
    const total = hayCatalogo ? item.total?.() : null;
    barra.append(el('button', {
      class: `nav-item ${estado.vista === item.id ? 'active' : ''}`,
      disabled: !hayCatalogo && item.id !== 'ajustes',
      onclick: () => ve(item.id)
    }, icono(item.icono, estado.vista === item.id && item.id === 'favoritos'),
      item.etiqueta,
      total ? el('span', { class: 'count' }, numero(total)) : null));
  }

  if (hayCatalogo) {
    const c = estado.catalogo;
    barra.append(el('div', { class: 'side-foot' },
      el('div', { class: 'lib-card' },
        el('strong', {}, `${numero(c.pelis.length + c.series.length + c.canales.length)} títulos`),
        `${numero(c.pelis.length)} pelis · ${numero(c.series.length)} series · ${numero(c.canales.length)} canales`)));
  }

  const pestanyas = document.getElementById('tabs');
  vaciar(pestanyas);
  if (!hayCatalogo) return;
  for (const id of MENU_MOVIL) {
    const item = MENU.find((m) => m.id === id);
    pestanyas.append(el('button', {
      class: estado.vista === id ? 'active' : '',
      onclick: () => ve(id)
    }, icono(item.icono, estado.vista === id && id === 'favoritos'), item.etiqueta));
  }
}

export function pinta() {
  if (!estado.catalogo && !['alta', 'ajustes'].includes(estado.vista)) estado.vista = 'alta';
  pintaMenu();
  cierraFicha();

  const destino = document.getElementById('view');
  const contenido =
    estado.vista === 'alta' ? vistaAlta()
      : estado.vista === 'inicio' ? vistaInicio()
      : estado.vista === 'recomendados' ? vistaRecomendados()
      : estado.vista === 'pelis' ? vistaCatalogo('peli')
      : estado.vista === 'series' ? vistaCatalogo('serie')
      : estado.vista === 'tv' ? vistaTV()
      : estado.vista === 'favoritos' ? vistaFavoritos()
      : estado.vista === 'ajustes' ? vistaAjustes()
      : vistaBuscar();

  vaciar(destino).append(...[contenido].flat().filter(Boolean));
  document.getElementById('barra-superior').hidden = !estado.catalogo;
}

async function arranca() {
  aplicaTema();
  try {
    await cargaCatalogoGuardado();
  } catch { /* primera vez o almacenamiento no disponible */ }

  const campo = document.getElementById('buscador');
  campo.addEventListener('input', retrasa(() => {
    estado.busqueda = campo.value.trim();
    if (estado.busqueda) { estado.vista = 'buscar'; pinta(); }
    else if (estado.vista === 'buscar') ve('inicio');
  }, 240));

  estado.vista = estado.catalogo ? 'inicio' : 'alta';
  pinta();

  // El service worker es lo que permite instalarla en la pantalla de inicio.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin instalación, la app funciona igual */ });
  }
}

arranca();
