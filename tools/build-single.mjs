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

// --- Cabecera: lo mismo que la aplicación, sin manifiesto ni enlaces externos ---
const cabecera = [
  '<meta charset="utf-8">',
  '<title>Pizarra Táctica</title>',
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
const desde = html.indexOf('<div class="app">');
const hasta = html.indexOf('<script src="config.js"');
if (desde < 0 || hasta < 0) throw new Error('app/index.html no tiene la forma esperada');
const cuerpo = html.slice(desde, hasta).trimEnd()
  .replace(/<a href="\.\.\/"[^>]*>[^<]*<\/a>/, '');   // aquí no hay landing a la que volver
const motor = js;

// La biblioteca va incrustada: aquí no hay servidor del que traerla.
const biblioteca = readFileSync(join(raiz, 'assets/biblioteca.json'), 'utf8');

// La biblioteca común sí necesita servidor y aquí no lo hay, así que este
// archivo va siempre sin ella: la configuración se deja vacía a propósito.
const nube = leer('app/nube.js');
const enlace = leer('app/enlace.js');

const salida =
  cabecera + '\n' +
  '<style>\n' + caras + '\n' + css + '\n</style>\n' +
  cuerpo + '\n' +
  '<script>window.PT_NUBE = { url: "", key: "" };</script>\n' +
  '<script>\n' + nube + '\n</script>\n' +
  '<script>\n' + enlace + '\n</script>\n' +
  '<script>window.__BIBLIOTECA__ = ' + biblioteca.trim() + ';</script>\n' +
  '<script>\n' + motor + '\n</script>';

writeFileSync(join(raiz, 'dist/pizarra-tactica.html'), salida);
console.log('dist/pizarra-tactica.html · ' + Math.round(salida.length / 1024) + ' KB');
