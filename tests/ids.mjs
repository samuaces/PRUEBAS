/* Los identificadores, cuadrados con el HTML.

   Dos preguntas, y las dos se responden sin navegador:

     ¿Hay algún id repetido en la página? Un duplicado hace que
     document.getElementById devuelva el primero, y el segundo queda muerto sin
     que nadie avise. Es de los fallos que más tardan en encontrarse.

     ¿Apunta el JavaScript a algún id que no existe? Eso es un TypeError en
     cuanto se toca esa parte, y puede pasar meses escondido si está en un
     camino poco transitado.

   Uso:  node tests/ids.mjs
*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'app/index.html'), 'utf8');
const fuentes = ['app/board.js', 'app/equipo.js', 'app/nube.js', 'app/enlace.js']
  .map(f => ({ f, txt: readFileSync(join(raiz, f), 'utf8') }));

let malos = 0;
const falla = (t, x) => { malos++; console.log(' FALLA ' + t + (x ? '  (' + x + ')' : '')); };
const bien  = (t, x) => console.log('  ok   ' + t + (x ? '  (' + x + ')' : ''));

// ---------- 1 · ids repetidos en el HTML ----------
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const cuenta = {};
ids.forEach(i => { cuenta[i] = (cuenta[i] || 0) + 1; });
const repes = Object.keys(cuenta).filter(i => cuenta[i] > 1);
if (repes.length) falla('ningún id repetido en la página', repes.join(', '));
else bien('ningún id repetido en la página', ids.length + ' ids');

// ---------- 2 · lo que el JS busca, existe ----------
/* Se recogen las tres formas que usa esta aplicación:
     $('#loquesea')  ·  getElementById('loquesea')  ·  querySelector('#loquesea …')

   Dos cosas se dejan fuera a propósito, y no por pereza:

     Los selectores que se arman con variables —$('#f-' + campo)— no se pueden
     resolver leyendo el archivo. Marcarlos daría un fallo falso cada vez.

     Los que llevan un segundo argumento —$('#g-dup', insp)— se buscan dentro de
     un trozo de página que la propia aplicación acaba de construir. Ese id no
     está en index.html y no tiene por qué estar. Para esos se comprueba otra
     cosa: que el JavaScript lo cree en algún sitio.

   Un id que no esté ni en el HTML ni creado por el JavaScript sí es un fallo. */
const creadosPorJs = new Set();
for (const { txt } of fuentes) {
  for (const m of txt.matchAll(/id="([A-Za-z0-9_-]+)"/g)) creadosPorJs.add(m[1]);
}
const puestos = new Set([...ids, ...creadosPorJs]);
let mirados = 0, saltados = 0;
const huerfanos = [];

for (const { f, txt } of fuentes) {
  const usos = new Set();
  // El «(?!\s*\+)» descarta '#f-' + campo, que se arma en tiempo de ejecución.
  for (const m of txt.matchAll(/\$\$?\(\s*'#([A-Za-z0-9_-]+)'(?!\s*\+)/g)) usos.add(m[1]);
  for (const m of txt.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'(?!\s*\+)/g)) usos.add(m[1]);
  for (const m of txt.matchAll(/querySelector(?:All)?\(\s*'#([A-Za-z0-9_-]+)/g)) usos.add(m[1]);
  for (const m of txt.matchAll(/(?:\$\$?\(\s*'#|getElementById\(\s*')[A-Za-z0-9_-]*'\s*\+/g)) saltados++;
  for (const id of usos) {
    mirados++;
    if (!puestos.has(id)) huerfanos.push(f + ' → #' + id);
  }
}
if (huerfanos.length) falla('todos los ids que busca el JS existen', huerfanos.join(', '));
else bien('todos los ids que busca el JS existen',
          mirados + ' comprobados, ' + saltados + ' armados con variables');

// ---------- 3 · los archivos nuevos están enganchados ----------
for (const f of ['config.js', 'nube.js', 'enlace.js', 'equipo.js', 'board.js']) {
  if (html.includes('src="' + f + '"')) bien('index.html carga ' + f);
  else falla('index.html carga ' + f);
}
const sw = readFileSync(join(raiz, 'app/sw.js'), 'utf8');
if (sw.includes("'./equipo.js'")) bien('el service worker guarda equipo.js');
else falla('el service worker guarda equipo.js');

// ---------- 4 · nada de innerHTML con lo que escribe el usuario ----------
/* Regla de la casa. Se permite solo con literales que no llevan datos dentro:
   un icono SVG escrito a mano, o vaciar con ''. Cualquier innerHTML con una
   variable o con una plantilla se marca para mirarlo. */
const equipoJs = readFileSync(join(raiz, 'app/equipo.js'), 'utf8');
if (/innerHTML/.test(equipoJs)) falla('equipo.js no usa innerHTML en ningún sitio');
else bien('equipo.js no usa innerHTML en ningún sitio');

console.log(malos ? '\n' + malos + ' FALLOS' : '\nIdentificadores correctos');
process.exit(malos ? 1 : 0);
