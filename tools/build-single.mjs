/* Genera dist/pizarra-tactica.html: la pizarra entera en un archivo, con las
   tipografías incorporadas y sin una sola petición a internet.

   Uso:  node tools/build-single.mjs
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(raiz, p), 'utf8');

const html = leer('app/index.html');
const js   = leer('app/board.js');
// Las tipografías se incorporan más abajo, así que se quitan las que apuntan a archivos.
const css  = leer('app/board.css').replace(/^@font-face\{[^}]*\}\n/gm, '');

// --- Tipografías como data URI, para que el archivo funcione a doble clic ---
const fuente = (p) => readFileSync(join(raiz, p)).toString('base64');
const caras = [
  ['Outfit',   '400 800', 'assets/fonts/outfit-latin-var.woff2'],
  ['InterVar', '400 700', 'assets/fonts/inter-latin-var.woff2']
].map(([f, w, p]) =>
  `@font-face{font-family:'${f}';src:url(data:font/woff2;base64,${fuente(p)}) format('woff2');` +
  `font-weight:${w};font-style:normal;font-display:swap}`
).join('\n');

/* --- Cabecera: lo mismo que la aplicación, sin manifiesto ni enlaces externos ---

   Con su propia política de seguridad, y no la de app/index.html: allí se puede
   cerrar «script-src 'self'» porque son cinco archivos separados, y aquí no,
   porque el archivo único lleva todo el código dentro y las tipografías como
   datos. Así que aquí hay que admitir lo de dentro.

   Aun rebajada sirve, y hace falta: este archivo se manda por correo y se
   abre desde cualquier sitio. Lo importante es que no puede cargar código de
   fuera ni hablar con ningún servidor que no sea Supabase. Antes no llevaba
   ninguna, y eso convertía en ejecución de código lo que en la aplicación de
   verdad se quedaba en un destrozo de la hoja impresa. */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",     // el motor va dentro del archivo
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",                 // las tipografías van dentro
  "connect-src 'self' https://bbxiuzknxdeuovoytrha.supabase.co",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'"
].join('; ');

const cabecera = [
  '<meta charset="utf-8">',
  `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
  '<title>Klym</title>',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">',
  '<meta name="color-scheme" content="dark">',
  '<meta name="theme-color" content="#070A0F">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="format-detection" content="telephone=no">'
].join('\n');

// --- El cuerpo de la aplicación, tal cual ---
// El motor se copia entero: el registro del service worker sólo se activa en
// https, así que abriendo el archivo con doble clic no hace nada.
// Se busca por el principio de la etiqueta, no por la etiqueta entera: en
// cuanto se le añade un atributo —data-modo, por ejemplo— la búsqueda literal
// deja de encontrarla y el empaquetado se cae sin decir por qué.
const desde = html.indexOf('<div class="app"');
const hasta = html.indexOf('<script src="config.js"');
if (desde < 0 || hasta < 0) throw new Error('app/index.html no tiene la forma esperada');
const cuerpo = html.slice(desde, hasta).trimEnd()
  .replace(/<a href="\.\.\/"[^>]*>[^<]*<\/a>/, '')    // aquí no hay landing a la que volver
  /* Y la privacidad no está al lado, porque aquí no hay «al lado»: este
     archivo viaja solo, por correo o en un pincho. El enlace relativo sería
     un enlace muerto, y un enlace muerto en la casilla del consentimiento es
     peor que no tenerlo. Se manda al sitio. */
  .replace(/href="\.\.\/privacidad\.html"/g, 'href="https://klym.xyz/privacidad.html"');
/* El trabajador de servicio guarda la aplicación para abrirla sin conexión, y
   para eso hace falta un sw.js al lado. Aquí no lo hay ni lo puede haber: este
   archivo ES la aplicación entera, va solo. Registrarlo pide al servidor un
   archivo que no existe y deja un 404 en la consola de quien lo abra. El
   archivo suelto ya funciona sin conexión por definición, así que se quita.
   Si el registro cambia de forma, esto revienta el empaquetado en vez de
   dejar de hacer nada en silencio. */
const REGISTRO = /if \('serviceWorker' in navigator[\s\S]{0,220}?register\('sw\.js'\)[\s\S]{0,80}?\n    \}/;
if (!REGISTRO.test(js)) throw new Error('app/board.js ya no registra el sw.js como se esperaba');
const motor = js.replace(REGISTRO, 'if (false) { /* sin sw.js: este archivo va solo */ }');

// La biblioteca va incrustada: aquí no hay servidor del que traerla.
const biblioteca = readFileSync(join(raiz, 'assets/biblioteca.json'), 'utf8');

// La biblioteca común sí necesita servidor y aquí no lo hay, así que este
// archivo va siempre sin ella: la configuración se deja vacía a propósito.
const nube = leer('app/nube.js');
const enlace = leer('app/enlace.js');
const cofre = leer('app/cofre.js');
const fusion = leer('app/fusion.js');
const equipo = leer('app/equipo.js');
const sincro = leer('app/sincro.js');
const codecs = leer('app/codecs.js');
const graficos = leer('app/graficos.js');

const salida =
  cabecera + '\n' +
  '<style>\n' + caras + '\n' + css + '\n</style>\n' +
  cuerpo + '\n' +
  '<script>window.PT_NUBE = { url: "", key: "" };</script>\n' +
  '<script>\n' + nube + '\n</script>\n' +
  '<script>\n' + enlace + '\n</script>\n' +
  '<script>\n' + cofre + '\n</script>\n' +
  '<script>\n' + fusion + '\n</script>\n' +
  '<script>\n' + equipo + '\n</script>\n' +
  '<script>\n' + sincro + '\n</script>\n' +
  '<script>\n' + codecs + '\n</script>\n' +
  '<script>\n' + graficos + '\n</script>\n' +
  '<script>window.__BIBLIOTECA__ = ' + biblioteca.trim() + ';</script>\n' +
  '<script>\n' + motor + '\n</script>';

writeFileSync(join(raiz, 'dist/pizarra-tactica.html'), salida);
console.log('dist/pizarra-tactica.html · ' + Math.round(salida.length / 1024) + ' KB');
