/* ===========================================================================
   Cookie Play — versión para el móvil.
   Funciona entera dentro del navegador: no hay servidor ni cuentas. La lista
   se guarda en el propio teléfono (IndexedDB) y no sale de él.
   =========================================================================== */

/** Versión visible: sirve para saber si el móvil tiene la última. */
export const VERSION = '14';

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

/**
 * Intermediarios públicos: servicios que piden la URL por ti y te la devuelven
 * con los permisos que el navegador necesita. No hace falta configurar nada,
 * pero la dirección de tu lista pasa por ellos.
 */
const RELES_PUBLICOS = [
  { nombre: 'corsproxy', arma: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
  { nombre: 'allorigins', arma: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { nombre: 'codetabs', arma: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
  { nombre: 'cors.lol', arma: (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}` },
  { nombre: 'thingproxy', arma: (url) => `https://thingproxy.freeboard.io/fetch/${url}` },
  { nombre: 'jina', arma: (url) => `https://r.jina.ai/${url}` },
  // Este pide un permiso temporal que se concede pulsando un botón en su web.
  { nombre: 'cors-anywhere', arma: (url) => `https://cors-anywhere.herokuapp.com/${url}` }
];

/** Página donde se concede el permiso temporal de cors-anywhere. */
export const PERMISO_CORS = 'https://cors-anywhere.herokuapp.com/corsdemo';

/** Intermediario propio (un Worker de Cloudflare, por ejemplo). */
export const releDelUsuario = () => (estado.ajustes.rele || '').trim();

/**
 * Formas alternativas de la misma dirección. Muchos paneles solo atienden por
 * http en el puerto 80, aunque den la URL con https.
 */
export function variantes(url) {
  const salida = [url];
  if (/^https:/i.test(url)) salida.push(url.replace(/^https:/i, 'http:').replace(/:443(?=\/|$)/, ''));
  if (/^http:/i.test(url)) salida.push(url.replace(/^http:/i, 'https:'));
  return [...new Set(salida)];
}

function candidatos(url) {
  const propio = releDelUsuario();
  const lista = [];
  for (const variante of variantes(url)) {
    const comoLlega = /^https:/i.test(variante) ? 'https' : 'http';
    if (propio) lista.push({ nombre: `el tuyo (${comoLlega})`, direccion: `${propio}${propio.includes('?') ? '&' : '?'}url=${encodeURIComponent(variante)}` });
    for (const { nombre, arma } of RELES_PUBLICOS) {
      lista.push({ nombre: `${nombre} (${comoLlega})`, direccion: arma(variante) });
    }
  }
  return lista;
}

/**
 * Pide una URL a través de intermediarios, en orden, hasta que uno responda.
 * @returns {Promise<string>} el cuerpo de la respuesta
 */
export async function traeConRele(url, informa, detalle) {
  const opciones = candidatos(url);
  informa?.(`Probando ${opciones.length} vías a la vez…`);
  const fallos = [];

  const prueba = async ({ nombre, direccion }) => {
    try {
      const res = await fetch(direccion, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`respondió ${res.status}`);
      const texto = await res.text();
      if (!texto || texto.length < 20) throw new Error('respuesta vacía');
      if (!texto.includes('#EXT') && !texto.trim().startsWith('{')) {
        throw new Error(`devolvió otra cosa («${texto.slice(0, 40).replace(/\s+/g, ' ')}»)`);
      }
      return { nombre, texto };
    } catch (err) {
      fallos.push(`${nombre}: ${err.message}`);
      detalle?.({ nombre, ok: false, error: err.message });
      throw err;
    }
  };

  try {
    // En paralelo: la primera que traiga la lista gana. En serie se agotaba el
    // tiempo antes de llegar a las vías por http, que son las que suelen valer.
    const ganadora = await Promise.any(opciones.map(prueba));
    detalle?.({ nombre: ganadora.nombre, ok: true });
    recuerdaVia(ganadora.nombre);
    informa?.(`Vía encontrada: ${ganadora.nombre}`);
    return ganadora.texto;
  } catch {
    throw new Error(`ninguna vía funcionó — ${fallos.join(' · ')}`);
  }
}

/** Guarda qué vía funcionó para reutilizarla en los episodios y en el vídeo. */
function recuerdaVia(nombre) {
  if (estado.ajustes.via === nombre) return;
  estado.ajustes.via = nombre;
  guardaAjustes();
}

/** Reconstruye la dirección de la vía que ya funcionó una vez. */
export function viaGanadora(url) {
  const nombre = estado.ajustes.via;
  if (!nombre) return null;
  const [, base, forma] = nombre.match(/^(.*) \((https?)\)$/) || [];
  if (!base) return null;
  const destino = variantes(url).find((v) => v.startsWith(`${forma}:`)) || url;
  if (base.startsWith('el tuyo')) {
    const propio = releDelUsuario();
    return propio ? `${propio}${propio.includes('?') ? '&' : '?'}url=${encodeURIComponent(destino)}` : null;
  }
  const encontrada = RELES_PUBLICOS.find((r) => r.nombre === base);
  return encontrada ? encontrada.arma(destino) : null;
}

async function apiXtream({ base, usuario, clave, viaRele }, accion, extra = {}) {
  const url = new URL(`${base}/player_api.php`);
  url.searchParams.set('username', usuario);
  url.searchParams.set('password', clave);
  if (accion) url.searchParams.set('action', accion);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));

  if (viaRele) {
    const texto = await traeConRele(url.href);
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error('el panel no devolvió JSON válido');
    }
  }

  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
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
  refrescaListaActiva().catch(() => { /* se recargará si hace falta */ });
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
  listas: [],                 // [{ id, nombre, url, tipo, cuando, entradas, catalogo }]
  activaId: null,
  catalogo: null,             // el catálogo de la lista activa
  origen: null,
  favoritos: new Set(local.lee('favoritos', [])),
  vistos: local.lee('vistos', {}),
  ajustes: local.lee('ajustes', { filtroAdulto: true, tema: 'sistema', rele: '' }),
  vista: 'inicio',
  busqueda: ''
};

export function guardaFavoritos() { local.guarda('favoritos', [...estado.favoritos]); }
export function guardaVistos() { local.guarda('vistos', estado.vistos); }
export function guardaAjustes() { local.guarda('ajustes', estado.ajustes); }

/** Pone en `catalogo` la lista activa. */
function aplicaActiva() {
  const lista = estado.listas.find((l) => l.id === estado.activaId) || estado.listas[0] || null;
  estado.activaId = lista?.id || null;
  estado.catalogo = lista?.catalogo || null;
  estado.origen = lista ? { nombre: lista.nombre, cuando: lista.cuando, entradas: lista.entradas, tipo: lista.tipo, url: lista.url } : null;
}

/** Carga las listas guardadas (y migra la versión de una sola lista). */
export async function cargaListasGuardadas() {
  let listas = await leeDeBD('listas').catch(() => null);
  if (!listas) {
    const anterior = await leeDeBD('catalogo').catch(() => null);
    const origen = await leeDeBD('origen').catch(() => null);
    listas = anterior ? [{
      id: 'lista-1',
      nombre: origen?.nombre || 'Mi lista',
      url: origen?.url || '',
      tipo: origen?.tipo || 'm3u',
      cuando: origen?.cuando || Date.now(),
      entradas: origen?.entradas || 0,
      catalogo: anterior
    }] : [];
    if (listas.length) await guardaEnBD('listas', listas);
  }
  estado.listas = listas;
  estado.activaId = (await leeDeBD('activa').catch(() => null)) || listas[0]?.id || null;
  aplicaActiva();
  return estado.listas;
}

async function persisteListas() {
  await guardaEnBD('listas', estado.listas);
  await guardaEnBD('activa', estado.activaId);
}

/**
 * Guarda una lista nueva (o actualiza la que tenga la misma dirección) y la
 * deja como activa.
 */
export async function guardaLista({ nombre, url = '', tipo = 'm3u', entradas = 0, catalogo }) {
  const existente = url ? estado.listas.find((l) => l.url === url) : null;
  const lista = existente || { id: `lista-${Date.now().toString(36)}` };
  // Dos listas del mismo servidor no pueden llamarse igual: se numeran.
  if (!existente && nombre) {
    const base = nombre;
    let intento = base;
    let n = 2;
    while (estado.listas.some((l) => l.nombre === intento)) intento = `${base} (${n++})`;
    nombre = intento;
  }
  Object.assign(lista, { nombre: nombre || lista.nombre || 'Mi lista', url, tipo, entradas, cuando: Date.now(), catalogo });
  if (!existente) estado.listas.push(lista);
  estado.activaId = lista.id;
  aplicaActiva();
  await persisteListas();
  return lista;
}

export async function eligeLista(id) {
  estado.activaId = id;
  aplicaActiva();
  await persisteListas();
}

export async function borraLista(id) {
  estado.listas = estado.listas.filter((l) => l.id !== id);
  if (estado.activaId === id) estado.activaId = estado.listas[0]?.id || null;
  aplicaActiva();
  await persisteListas();
}

/** Vuelve a guardar la lista activa (se usa al completar los episodios). */
export async function refrescaListaActiva() {
  const lista = estado.listas.find((l) => l.id === estado.activaId);
  if (!lista) return;
  lista.catalogo = estado.catalogo;
  await persisteListas();
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

/** Pasa una dirección de vídeo por el intermediario propio, si lo hay. */
function porElRele(url) {
  const propio = releDelUsuario();
  if (propio) return `${propio}${propio.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
  return viaGanadora(url);
}

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

  // Con intermediario propio, el vídeo pasa por él: es lo que hace que
  // funcione igual que en una app nativa (identificación e http incluidos).
  const rele = porElRele(url);
  const plan = rele ? [rele] : (esMixto(url) ? [aHttps(url), url] : [url]);
  let paso = 0;

  video.addEventListener('error', () => {
    paso += 1;
    if (paso < plan.length) {
      video.src = plan[paso];
      video.play().catch(() => {});
      return;
    }
    panelBloqueado(rele
      ? 'Tu intermediario no ha podido traer este canal. Puede que ese canal ya no exista, o que el proveedor lo esté rechazando.'
      : esMixto(url)
        ? 'Tu lista sirve el vídeo sin cifrar y el iPhone no lo mezcla con una página segura. Se arregla poniendo tu intermediario en Ajustes; mientras tanto, VLC puede abrirlo.'
        : 'El servidor de la lista no responde o el canal ya no existe. Prueba con otra fuente o vuelve a cargar la lista.');
  });

  video.src = plan[0];
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

  const primeraUrl = item.tipo === 'peli'
    ? item.fuentes?.[0]?.url
    : item.temporadas?.[Object.keys(item.temporadas || {}).sort((a, b) => a - b)[0]]?.[0]?.url;

  const cuerpo = el('div', { class: 'sheet-body flush' },
    el('h2', {}, item.titulo),
    datos,
    el('div', { class: 'sheet-actions' },
      accionPrincipal(item),
      botonFav,
      primeraUrl ? el('a', { class: 'btn sec', href: enlaceVLC(primeraUrl) }, 'Ver en VLC') : null),
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

/* ------------------------------ Diagnóstico ------------------------------- */

/**
 * Comprueba, una por una, todas las vías, y dice qué falla exactamente.
 * La prueba clave es la petición «opaca»: si esa pasa, el servidor está vivo y
 * el problema es de permisos del navegador; si no pasa, no hay servidor.
 */
export async function diagnostica(url, informa) {
  const cuenta = credencialesDesdeUrl(url);
  const lineas = [];
  const apunta = (nombre, ok, detalle) => {
    lineas.push({ nombre, ok, detalle });
    informa?.(lineas);
  };

  const conTiempo = (promesa, ms) => Promise.race([
    promesa,
    new Promise((_, r) => setTimeout(() => r(new Error(`sin respuesta en ${ms / 1000} s`)), ms))
  ]);

  // 1. ¿Existe el servidor y contesta algo?
  let base = url;
  try { base = new URL(url).origin; } catch { /* se usa la url tal cual */ }
  try {
    await conTiempo(fetch(base, { mode: 'no-cors', cache: 'no-store' }), 15000);
    apunta('El servidor existe y responde', true, base);
  } catch (err) {
    apunta('El servidor existe y responde', false, err.message);
  }

  // 2. ¿Contesta a la dirección concreta de la lista?
  try {
    await conTiempo(fetch(url, { mode: 'no-cors', cache: 'no-store' }), 20000);
    apunta('La dirección de la lista responde', true, 'contesta algo');
  } catch (err) {
    apunta('La dirección de la lista responde', false, err.message);
  }

  // 3. ¿Deja que el navegador lea la respuesta? (esto es lo que suele fallar)
  try {
    const res = await conTiempo(fetch(url, { cache: 'no-store' }), 20000);
    const texto = (await res.text()).slice(0, 400);
    apunta('El navegador puede leer la lista', texto.includes('#EXT'), texto.includes('#EXT') ? `${res.status}, parece una lista` : `${res.status}, empieza por «${texto.slice(0, 60).replace(/\s+/g, ' ')}»`);
  } catch (err) {
    apunta('El navegador puede leer la lista', false, err.message);
  }

  // 4. La API del panel
  if (cuenta) {
    try {
      const info = await conTiempo(apiXtream(cuenta, null), 25000);
      const auth = info?.user_info?.auth;
      apunta('La API del panel contesta', auth === 1, auth === 1 ? `cuenta ${info.user_info.status || 'activa'}` : 'responde pero no autentica');
    } catch (err) {
      apunta('La API del panel contesta', false, err.message);
    }
  }

  // 5. Los intermediarios, uno por uno (con https y con http)
  const vias = [];
  try {
    const texto = await conTiempo(
      traeConRele(url, null, (v) => { vias.push(v); informa?.(lineas); }),
      90000
    );
    apunta('Alguna vía trae la lista', texto.includes('#EXT') || texto.trim().startsWith('{'), `funcionó: ${vias.filter((v) => v.ok).map((v) => v.nombre).join(', ')}`);
  } catch (err) {
    apunta('Alguna vía trae la lista', false, vias.length
      ? vias.map((v) => `${v.nombre}: ${v.ok ? 'ok' : v.error}`).join(' · ')
      : err.message);
  }

  return lineas;
}

/** Traduce el resultado del diagnóstico a una conclusión en cristiano. */
export function conclusion(lineas) {
  const dato = (n) => lineas.find((l) => l.nombre.startsWith(n));
  const vivo = dato('El servidor existe')?.ok;
  const direccion = dato('La dirección')?.ok;
  const lee = dato('El navegador puede leer')?.ok;
  const api = dato('La API del panel')?.ok;
  const rele = dato('Alguna vía')?.ok;

  if (lee || api || rele) return 'Hay al menos una vía que funciona: vuelve atrás y pulsa «Cargar lista».';
  if (!vivo && !direccion) {
    return 'Tu servidor no responde a nada desde este teléfono. O la lista ha caducado, o el proveedor ha cambiado de dirección, o tu operadora la bloquea. Pruébala en otra app de IPTV o con los datos móviles en vez del wifi: si allí tampoco va, el problema está en la lista, no en la app.';
  }
  if (vivo && !lee && !rele) {
    return 'Tu servidor está vivo pero no deja que ninguna web lea su respuesta, y los intermediarios tampoco llegan. La única vía que queda es meter la lista desde el propio teléfono: descárgala en Safari o cópiala con la app Atajos y usa «Otras formas de cargarla».';
  }
  return 'Resultado mixto: mira las líneas de arriba para ver qué paso falla.';
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
  await guardaLista({ nombre: 'Lista copiada', tipo: 'portapapeles', entradas: entradas.length, catalogo });
  return catalogo;
}

const cabecera = (titulo, sub) => [
  el('h1', { class: 'page-title' }, titulo),
  sub ? el('p', { class: 'page-sub' }, sub) : null
];

/** Alta de la lista: pegar el enlace y ya. Lo demás queda plegado debajo. */
function vistaAlta() {
  const caja = el('div', { class: 'onboarding' });
  const progreso = el('div', { class: 'progreso' });
  const barra = el('div', { class: 'barra' }, el('i', {}));
  const paso = (texto) => {
    progreso.replaceChildren(texto, barra);
  };
  const avance = (pct) => { barra.firstChild.style.width = `${pct}%`; };

  /** Ordena el texto de una lista y la guarda. */
  async function procesa(texto, datos) {
    if (!String(texto).includes('#EXT')) throw new Error('eso no parece una lista M3U');
    paso('Ordenando la lista…');
    avance(70);
    await new Promise((r) => setTimeout(r, 20));
    const entradas = parseaM3U(texto);
    const catalogo = construyeCatalogo(entradas, { filtroAdulto: estado.ajustes.filtroAdulto });
    paso('Guardando…');
    avance(92);
    await guardaLista({ ...datos, entradas: entradas.length, catalogo });
    listo(catalogo);
  }

  function listo(catalogo) {
    avance(100);
    aviso(`Listo: ${numero(catalogo.pelis.length)} pelis, ${numero(catalogo.series.length)} series, ${numero(catalogo.canales.length)} canales`);
    ve('inicio');
  }

  const selector = el('input', { type: 'file', style: { display: 'none' } });
  selector.addEventListener('change', async () => {
    const archivo = selector.files?.[0];
    if (!archivo) return;
    try {
      await procesa(await archivo.text(), { nombre: archivo.name.replace(/\.[^.]+$/, ''), tipo: 'archivo' });
    } catch (err) {
      aviso(err.message);
    }
  });

  /** La misma dirección por http y sin el puerto 443: así atienden estos paneles. */
  const versionHttp = (url) => url.replace(/^https:/i, 'http:').replace(/:443(?=\/|$)/, '');

  const nombreDe = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Mi lista'; }
  };

  // ---- Lo único que hay que hacer: pegar el enlace ----
  const campo = el('input', {
    type: 'url',
    placeholder: 'Pega aquí el enlace de tu lista',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: false, enterKeyHint: 'go'
  });
  const boton = el('button', { class: 'btn', style: { width: '100%', justifyContent: 'center' } }, 'Cargar lista');

  async function cargaDesdeUrl() {
    const url = campo.value.trim();
    if (!url) return aviso('Pega antes el enlace de tu lista');
    boton.disabled = true;
    boton.textContent = 'Cargando…';
    const cuenta = credencialesDesdeUrl(url);
    const fallos = [];

    const intentos = [
      ['Conectando con tu proveedor…', 12, async () => {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`respondió ${res.status}`);
        return { texto: await res.text() };
      }, 14000],
      ['Buscando la vía que sí funciona…', 40, async () => ({
        texto: await traeConRele(url, paso)
      }), 40000],
      cuenta && ['Probando la API de tu panel…', 60, async () => ({
        catalogo: await catalogoDesdeXtream(cuenta, paso)
      }), 45000],
      cuenta && ['Probando la API por otra vía…', 65, async () => ({
        catalogo: await catalogoDesdeXtream({ ...cuenta, viaRele: true }, paso)
      }), 120000]
    ].filter(Boolean);

    // Un intento no puede eternizarse: pasado su tope, se prueba el siguiente.
    // Y siempre se puede saltar a mano, sin esperar al tope.
    let saltaAhora = null;
    const botonSaltar = el('button', {
      class: 'btn sec',
      style: { marginTop: '10px', width: '100%', justifyContent: 'center' },
      onclick: () => saltaAhora?.()
    }, 'Saltar este intento');
    progreso.after(botonSaltar);

    const conTope = (promesa, ms, queEs) => Promise.race([
      promesa,
      new Promise((_, rechaza) => setTimeout(() => rechaza(new Error(`${queEs} tardó demasiado`)), ms)),
      new Promise((_, rechaza) => { saltaAhora = () => rechaza(new Error('saltado a mano')); })
    ]);

    for (const [mensaje, pct, intenta, tope] of intentos) {
      try {
        paso(mensaje);
        avance(pct);
        const desde = Date.now();
        const reloj = setInterval(() => paso(`${mensaje} (${Math.round((Date.now() - desde) / 1000)} s)`), 1000);
        let salida;
        try {
          salida = await conTope(intenta(), tope, 'este intento');
        } finally {
          clearInterval(reloj);
        }
        if (salida.texto) {
          await procesa(salida.texto, { nombre: nombreDe(url), url, tipo: 'm3u' });
        } else {
          paso('Guardando…');
          avance(92);
          const catalogo = salida.catalogo;
          await guardaLista({
            nombre: nombreDe(url), url, tipo: 'xtream',
            entradas: catalogo.pelis.length + catalogo.series.length + catalogo.canales.length,
            catalogo
          });
          listo(catalogo);
        }
        botonSaltar.remove();
        boton.disabled = false;
        boton.textContent = 'Cargar lista';
        return;
      } catch (err) {
        fallos.push(err.message);
      }
    }
    botonSaltar.remove();

    avance(0);
    paso('No se ha podido cargar esta lista.');
    aviso('Ninguna vía ha respondido todavía');
    const sinCifrar = versionHttp(url);
    caja.append(el('div', { class: 'card-opcion' },
      el('h2', {}, 'Tu servidor solo atiende a tu propio móvil'),
      el('p', {}, 'Ni desde esta página ni desde ningún intermediario se llega a él: su dirección solo existe dentro de tu conexión. Pero tu Safari sí llega. Son dos toques:'),
      el('div', { class: 'paso' }, el('div', { class: 'num' }, '1'),
        el('div', { class: 'txt' }, 'Abre tu lista en Safari con el botón de abajo. Se abrirá en otra pestaña.')),
      el('div', { class: 'paso' }, el('div', { class: 'num' }, '2'),
        el('div', { class: 'txt' }, 'Si ves un montón de texto: mantén pulsado → ', el('strong', {}, 'Seleccionar todo'), ' → ', el('strong', {}, 'Copiar'), '. Si se descarga un archivo, no hagas nada más.')),
      el('div', { class: 'paso' }, el('div', { class: 'num' }, '3'),
        el('div', { class: 'txt' }, 'Vuelve a esta pestaña y pulsa el botón que corresponda.')),
      el('a', {
        class: 'btn',
        style: { width: '100%', justifyContent: 'center', marginBottom: '10px' },
        href: sinCifrar, target: '_blank', rel: 'noopener'
      }, 'Abrir mi lista en Safari'),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              const texto = await navigator.clipboard.readText();
              await procesa(texto, { nombre: nombreDe(url), url, tipo: 'copiada' });
            } catch (err) {
              aviso(`No se ha podido pegar: ${err.message}`);
            }
          }
        }, 'Pegar lo copiado'),
        el('button', { class: 'btn sec', onclick: () => selector.click() }, 'Elegir el archivo descargado')),
      el('div', { style: { marginTop: '12px', fontSize: '12px', opacity: '0.65' } },
        `Detalle — ${[...new Set(fallos)].join(' · ')}`)));
    boton.disabled = false;
    boton.textContent = 'Cargar lista';
  }

  boton.addEventListener('click', cargaDesdeUrl);
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') cargaDesdeUrl(); });

  caja.append(
    el('div', { class: 'marca' },
      el('img', { class: 'logo', src: 'icons/logo.png', alt: '' }),
      el('img', { class: 'logotipo', src: 'icons/wordmark.png', alt: 'Cookie Play' })),
    el('h1', {}, estado.listas.length ? 'Añade otra lista' : 'Pega tu lista y listo'),
    el('p', { class: 'intro' }, 'Se ordena sola en películas, series y canales, y se queda guardada en este teléfono.'),
    el('div', { class: 'card-opcion' },
      campo,
      boton,
      progreso,
      el('small', { style: { display: 'block', marginTop: '10px', color: 'var(--text-2)', fontSize: '12.5px', lineHeight: '1.5' } },
        'Si tu proveedor solo atiende a apps (como MaxPlayer) y no a los navegadores, hace falta un intermediario: ponlo en Ajustes y la lista y el vídeo pasarán por él, igual que en una app nativa.')));

  // ---- Otras formas, plegadas: solo estorban si todo va bien ----

  const area = el('textarea', { placeholder: '#EXTM3U\n#EXTINF:-1 …' });

  const detalles = el('details', { class: 'card-opcion' },
    el('summary', { style: { fontWeight: '600', fontSize: '15px', cursor: 'pointer' } }, 'Otras formas de cargarla'),
    el('div', { style: { paddingTop: '14px' } },
      el('p', {}, 'Por si tu proveedor no responde: descarga la lista en el iPhone (Safari o la app Atajos) y cárgala desde aquí.'),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('button', { class: 'btn sec', onclick: () => selector.click() }, 'Elegir un archivo'),
        el('button', {
          class: 'btn sec',
          onclick: async () => {
            try {
              const texto = await navigator.clipboard.readText();
              await procesa(texto, { nombre: 'Lista copiada', tipo: 'portapapeles' });
            } catch (err) {
              aviso(`No se ha podido pegar: ${err.message}`);
            }
          }
        }, 'Pegar lo copiado')),
      selector,
      el('p', { style: { marginTop: '14px' } }, 'O pega aquí el contenido de la lista:'),
      area,
      el('button', {
        class: 'btn sec',
        onclick: async () => {
          try { await procesa(area.value, { nombre: 'Lista pegada', tipo: 'pegada' }); }
          catch (err) { aviso(err.message); }
        }
      }, 'Cargar lo pegado')));
  // Diagnóstico: para cuando nada funciona y hay que saber por qué.
  const informe = el('div', {});
  const botonDiag = el('button', { class: 'btn sec', style: { width: '100%', justifyContent: 'center' } }, 'No carga: ver qué falla');
  botonDiag.addEventListener('click', async () => {
    const url = campo.value.trim();
    if (!url) return aviso('Pega antes el enlace de tu lista');
    botonDiag.disabled = true;
    botonDiag.textContent = 'Comprobando…';
    vaciar(informe);
    const caja2 = el('div', { class: 'nota-aviso' });
    informe.append(caja2);

    const pinta = (lineas) => {
      vaciar(caja2);
      for (const l of lineas) {
        caja2.append(el('div', { style: { display: 'flex', gap: '8px', padding: '3px 0', alignItems: 'flex-start' } },
          el('span', { style: { color: l.ok ? '#34c759' : 'var(--danger)', fontWeight: '700' } }, l.ok ? '✓' : '✗'),
          el('span', {}, l.nombre, el('div', { style: { fontSize: '12px', opacity: '0.7' } }, l.detalle))));
      }
    };

    try {
      const lineas = await diagnostica(url, pinta);
      pinta(lineas);
      const texto = conclusion(lineas);
      caja2.append(el('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--separator)' } },
        el('strong', {}, 'Conclusión: '), texto));
      const resumen = lineas.map((l) => `${l.ok ? 'OK' : 'FALLA'} — ${l.nombre}: ${l.detalle}`).join('\n');
      caja2.append(el('button', {
        class: 'btn sec',
        style: { marginTop: '12px' },
        onclick: async () => {
          try { await navigator.clipboard.writeText(`${resumen}\n\n${texto}`); aviso('Informe copiado'); }
          catch { aviso('Haz una captura de pantalla y mándala'); }
        }
      }, 'Copiar informe'));
    } finally {
      botonDiag.disabled = false;
      botonDiag.textContent = 'No carga: ver qué falla';
    }
  });

  caja.append(el('div', { style: { marginTop: '4px' } }, botonDiag), informe);
  caja.append(detalles);

  if (estado.listas.length) {
    caja.append(el('div', { style: { marginTop: '16px', textAlign: 'center' } },
      el('button', { class: 'btn sec', onclick: () => ve('inicio') }, 'Volver a mis listas')));
  }

  caja.append(el('div', { style: { marginTop: '18px', textAlign: 'center', fontSize: '12px', color: 'var(--text-3)' } },
    `Cookie Play v${VERSION}`,
    el('button', {
      class: 'btn sec',
      style: { display: 'block', margin: '10px auto 0', fontSize: '12.5px', padding: '6px 14px' },
      onclick: forzarActualizacion
    }, 'Buscar actualización')));

  return caja;
}

function vistaInicio() {
  const catalogo = estado.catalogo;
  const nodos = [];

  // Con varias listas guardadas, se cambia de una a otra desde aquí mismo.
  if (estado.listas.length > 1) {
    const chips = el('div', { class: 'chips' });
    for (const lista of estado.listas) {
      chips.append(el('button', {
        class: `chip ${lista.id === estado.activaId ? 'active' : ''}`,
        onclick: async () => {
          if (lista.id === estado.activaId) return;
          await eligeLista(lista.id);
          ve('inicio');
        }
      }, lista.nombre));
    }
    chips.append(el('button', { class: 'chip', onclick: () => ve('alta') }, '+ Añadir'));
    nodos.push(chips);
  }
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

/** Mis listas: elegir cuál ver, actualizarla o quitarla. */
function panelListas() {
  const caja = el('div', { class: 'card-opcion' },
    el('h2', {}, estado.listas.length > 1 ? 'Mis listas' : 'Mi lista'),
    el('p', {}, 'Toca una para verla. Puedes tener las que quieras y cambiar cuando te apetezca.'));

  for (const lista of estado.listas) {
    const activa = lista.id === estado.activaId;
    const c = lista.catalogo || { pelis: [], series: [], canales: [] };
    caja.append(el('div', { class: 'lista-info' },
      el('button', {
        style: { display: 'contents' },
        onclick: async () => {
          if (activa) return;
          await eligeLista(lista.id);
          aviso(`Viendo «${lista.nombre}»`);
          ve('inicio');
        }
      },
        el('div', { class: 'logo', style: { width: '38px', height: '38px', borderRadius: '10px', background: activa ? 'var(--accent)' : 'var(--fill)', color: activa ? '#fff' : 'var(--text-2)', display: 'grid', placeItems: 'center', flex: 'none', fontWeight: '700', fontSize: '13px' } },
          activa ? '✓' : String(estado.listas.indexOf(lista) + 1)),
        el('div', { style: { flex: '1', minWidth: '0' } },
          el('div', { class: 'n' }, lista.nombre),
          el('div', { class: 'd' }, `${numero(c.pelis.length)} pelis · ${numero(c.series.length)} series · ${numero(c.canales.length)} canales`))),
      el('button', {
        class: 'btn sec',
        style: { padding: '6px 12px', fontSize: '13px' },
        onclick: async () => {
          if (!confirm(`¿Quitar «${lista.nombre}»? Los favoritos se conservan.`)) return;
          await borraLista(lista.id);
          aviso('Lista quitada');
          ve(estado.catalogo ? 'ajustes' : 'alta');
        }
      }, 'Quitar')));
  }

  caja.append(el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
    el('button', { class: 'btn', onclick: () => ve('alta') }, 'Añadir otra lista'),
    estado.origen?.url
      ? el('button', {
          class: 'btn sec',
          onclick: () => { ve('alta'); setTimeout(() => { const c = document.querySelector('.onboarding input[type=url]'); if (c) c.value = estado.origen.url; }, 60); }
        }, 'Actualizar la actual')
      : null));
  return caja;
}

/** Permite usar un intermediario propio en vez de los públicos. */
function campoRele() {
  const campo = el('input', { type: 'url', placeholder: 'https://mi-intermediario.workers.dev', value: estado.ajustes.rele || '', autocapitalize: 'off', spellcheck: false });
  const guardar = el('button', { class: 'btn sec' }, 'Guardar');
  guardar.addEventListener('click', () => {
    estado.ajustes.rele = campo.value.trim();
    guardaAjustes();
    aviso(estado.ajustes.rele ? 'Intermediario propio guardado' : 'Se usarán los intermediarios públicos');
  });
  return el('div', { style: { paddingTop: '14px' } },
    el('div', { class: 'label', style: { fontSize: '14.5px', marginBottom: '4px' } }, 'Mi intermediario (opcional)'),
    el('small', { style: { display: 'block', color: 'var(--text-2)', fontSize: '12.5px', marginBottom: '8px', lineHeight: '1.5' } },
      'Es lo que hace que la app funcione igual que un reproductor nativo: pide la lista y el vídeo como lo hace una app, prueba también sin cifrar y no pasa por servicios ajenos. Receta de 5 minutos en rele/worker.js del repositorio.'),
    el('div', { style: { display: 'flex', gap: '8px' } }, campo, guardar));
}

function vistaAjustes() {
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
    panelListas(),
    el('div', { class: 'card-opcion' },
      el('h2', {}, 'Preferencias'),
      el('div', { class: 'switch-row' },
        el('div', { class: 'label' }, 'Ocultar contenido adulto', el('small', {}, 'Filtra las categorías marcadas como XXX o +18')),
        el('div', { class: 'spacer' }), interruptor),
      el('div', { class: 'switch-row' },
        el('div', { class: 'label' }, 'Apariencia'),
        el('div', { class: 'spacer' }), tema),
      campoRele()),
    el('div', { class: 'card-opcion' },
      el('h2', {}, 'La app'),
      el('p', {}, `Estás usando la versión ${VERSION}. Si te he dicho que hay algo nuevo y no lo ves, pulsa aquí.`),
      el('button', { class: 'btn', onclick: forzarActualizacion }, 'Buscar actualización')),
    el('div', { class: 'nota-aviso' },
      el('strong', {}, 'Para actualizar la lista: '),
      'ejecuta tu atajo de Atajos (copia la lista al portapapeles) y pulsa «Actualizar desde el portapapeles». Los favoritos se mantienen.'),
    el('div', { class: 'nota-aviso' },
      el('strong', {}, 'Si un canal no arranca: '),
      'tu lista sirve el vídeo por http y el iPhone no lo mezcla con una página https. En esos casos la app te ofrece abrirlo en VLC, que es gratis y sí puede.')
  ];
}

/** Borra lo guardado de la propia app (no las listas) y recarga la última versión. */
export async function forzarActualizacion() {
  aviso('Buscando la última versión…');
  try {
    if ('serviceWorker' in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((r) => r.unregister()));
    }
    if (window.caches) {
      const claves = await caches.keys();
      await Promise.all(claves.map((k) => caches.delete(k)));
    }
  } catch { /* si no se puede, la recarga con marca de tiempo suele bastar */ }
  const destino = new URL(location.href);
  destino.searchParams.set('v', Date.now().toString(36));
  location.replace(destino.href);
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
    await cargaListasGuardadas();
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
