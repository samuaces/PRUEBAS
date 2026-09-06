/**
 * Intermediario de Cookie Play — Cloudflare Worker (plan gratuito).
 *
 * Pide por ti la lista a tu proveedor y te la devuelve con los permisos que
 * el navegador necesita. Así la app funciona pegando solo la URL, sin que la
 * dirección de tu lista pase por ningún servicio ajeno.
 *
 * Cómo publicarlo (5 minutos, gratis, sin tarjeta):
 *   1. Entra en https://workers.cloudflare.com y crea una cuenta.
 *   2. Create application → Create Worker → ponle un nombre → Deploy.
 *   3. Edit code, borra lo que haya, pega este archivo entero y Deploy.
 *   4. Copia la dirección que te da (algo como https://nombre.tu-cuenta.workers.dev).
 *   5. En Cookie Play: Ajustes → «Mi intermediario» → pégala y guarda.
 */

// Solo se permite pedir a estos servidores. Añade el tuyo aquí.
const PERMITIDOS = [
  // 'user.kasubnya.com',
];

const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

export default {
  async fetch(peticion) {
    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECERAS });

    const entrada = new URL(peticion.url);
    const destino = entrada.searchParams.get('url');
    if (!destino) {
      return new Response('Falta el parámetro url', { status: 400, headers: CABECERAS });
    }

    let objetivo;
    try {
      objetivo = new URL(destino);
    } catch {
      return new Response('URL no válida', { status: 400, headers: CABECERAS });
    }
    if (!/^https?:$/.test(objetivo.protocol)) {
      return new Response('Solo http y https', { status: 400, headers: CABECERAS });
    }
    if (PERMITIDOS.length && !PERMITIDOS.includes(objetivo.hostname)) {
      return new Response('Ese servidor no está en la lista de permitidos', { status: 403, headers: CABECERAS });
    }

    let respuesta;
    try {
      respuesta = await fetch(objetivo, {
        redirect: 'follow',
        headers: {
          // Muchos paneles solo contestan a reproductores conocidos.
          'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
          Accept: '*/*'
        }
      });
    } catch (error) {
      return new Response(`No se pudo conectar: ${error.message}`, { status: 502, headers: CABECERAS });
    }

    return new Response(respuesta.body, {
      status: respuesta.status,
      headers: {
        ...CABECERAS,
        'Content-Type': respuesta.headers.get('content-type') || 'text/plain; charset=utf-8'
      }
    });
  }
};
