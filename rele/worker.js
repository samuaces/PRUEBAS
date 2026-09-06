/**
 * Intermediario de Cookie Play — Cloudflare Worker (plan gratuito).
 *
 * Hace por el navegador lo que una app nativa (tipo MaxPlayer) hace sola:
 *   · pide la lista y el vídeo identificándose como un reproductor, no como
 *     una web, que es lo que esperan estos paneles;
 *   · prueba https y http, porque muchos solo atienden por el puerto 80;
 *   · devuelve todo con los permisos (CORS) que el navegador exige;
 *   · reescribe los manifiestos HLS para que los trozos de vídeo vuelvan a
 *     pasar por aquí, y respeta el rango pedido para poder avanzar una peli.
 *
 * Cómo publicarlo (5 minutos, gratis, sin tarjeta):
 *   1. Entra en https://workers.cloudflare.com y crea una cuenta.
 *   2. Create application → Create Worker → nombre → Deploy.
 *   3. Edit code, borra lo que haya, pega este archivo entero y Deploy.
 *   4. Copia la dirección (algo como https://nombre.tu-cuenta.workers.dev).
 *   5. En Cookie Play: Ajustes → «Mi intermediario» → pégala y guarda.
 */

// Si quieres limitarlo a tu proveedor, escribe aquí su dominio.
const PERMITIDOS = [];

// Estos paneles suelen contestar solo a reproductores conocidos.
const AGENTE = 'VLC/3.0.20 LibVLC/3.0.20';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range,Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
  'Cache-Control': 'no-store'
};

const error = (mensaje, codigo = 400) => new Response(mensaje, { status: codigo, headers: CORS });

/** La misma dirección en sus dos formas: como viene y por http sin cifrar. */
function variantes(destino) {
  const salida = [destino];
  if (/^https:/i.test(destino)) salida.push(destino.replace(/^https:/i, 'http:').replace(/:443(?=\/|$)/, ''));
  else if (/^http:/i.test(destino)) salida.push(destino.replace(/^http:/i, 'https:'));
  return [...new Set(salida)];
}

const esManifiesto = (direccion, tipo) =>
  /\.m3u8(\?|$)/i.test(direccion) || /mpegurl/i.test(tipo || '');

/** Deja los trozos de vídeo apuntando otra vez a este mismo intermediario. */
function reescribeManifiesto(texto, base, raiz) {
  const porAqui = (objetivo) => {
    try {
      return `${raiz}?url=${encodeURIComponent(new URL(objetivo, base).href)}`;
    } catch {
      return objetivo;
    }
  };
  return texto.split(/\r?\n/).map((linea) => {
    const limpia = linea.trim();
    if (!limpia) return linea;
    if (limpia.startsWith('#')) return linea.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${porAqui(uri)}"`);
    return porAqui(limpia);
  }).join('\n');
}

export default {
  async fetch(peticion) {
    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const entrada = new URL(peticion.url);
    const destino = entrada.searchParams.get('url');
    if (!destino) return error('Falta el parámetro url');

    let objetivo;
    try {
      objetivo = new URL(destino);
    } catch {
      return error('URL no válida');
    }
    if (!/^https?:$/.test(objetivo.protocol)) return error('Solo http y https');
    if (PERMITIDOS.length && !PERMITIDOS.includes(objetivo.hostname)) {
      return error('Ese servidor no está en la lista de permitidos', 403);
    }

    const cabeceras = { 'User-Agent': AGENTE, Accept: '*/*' };
    const rango = peticion.headers.get('Range');
    if (rango) cabeceras.Range = rango;

    const fallos = [];
    for (const direccion of variantes(objetivo.href)) {
      let respuesta;
      try {
        respuesta = await fetch(direccion, { redirect: 'follow', headers: cabeceras });
      } catch (fallo) {
        fallos.push(`${direccion}: ${fallo.message}`);
        continue;
      }
      if (respuesta.status >= 400 && respuesta.status !== 403) {
        fallos.push(`${direccion}: respondió ${respuesta.status}`);
        continue;
      }

      const tipo = respuesta.headers.get('content-type') || '';
      const raiz = `${entrada.origin}${entrada.pathname}`;

      if (esManifiesto(direccion, tipo)) {
        const texto = await respuesta.text();
        return new Response(reescribeManifiesto(texto, respuesta.url || direccion, raiz), {
          status: respuesta.status,
          headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl' }
        });
      }

      const salida = { ...CORS };
      for (const nombre of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const valor = respuesta.headers.get(nombre);
        if (valor) salida[nombre] = valor;
      }
      return new Response(respuesta.body, { status: respuesta.status, headers: salida });
    }

    return error(`No se pudo conectar. ${fallos.join(' · ')}`, 502);
  }
};
