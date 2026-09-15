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
const fuentes = ['app/board.js', 'app/equipo.js', 'app/nube.js', 'app/enlace.js', 'app/codecs.js']
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
for (const f of ['config.js', 'nube.js', 'enlace.js', 'equipo.js', 'codecs.js', 'board.js']) {
  if (html.includes('src="' + f + '"')) bien('index.html carga ' + f);
  else falla('index.html carga ' + f);
}
const sw = readFileSync(join(raiz, 'app/sw.js'), 'utf8');
for (const f of ['equipo.js', 'codecs.js']) {
  if (sw.includes("'./" + f + "'")) bien('el service worker guarda ' + f);
  else falla('el service worker guarda ' + f);
}

// ---------- 4 · nada de innerHTML con lo que escribe el usuario ----------
/* Regla de la casa. Se permite solo con literales que no llevan datos dentro:
   un icono SVG escrito a mano, o vaciar con ''. Cualquier innerHTML con una
   variable o con una plantilla se marca para mirarlo. */
const equipoJs = readFileSync(join(raiz, 'app/equipo.js'), 'utf8');
if (/innerHTML/.test(equipoJs)) falla('equipo.js no usa innerHTML en ningún sitio');
else bien('equipo.js no usa innerHTML en ningún sitio');

/* ---------- 5 · nada de la ficha entra en HTML sin escapar ----------

   La ficha de un ejercicio puede llegar de un enlace que te manden o de la
   biblioteca común: es texto de otro. Todo sitio que arme HTML con ella tiene
   que pasarlo por esc().

   Esto no es una regla de estilo. Había un caso real —el título de la hoja de
   sesión, que se arma con «card().titulo» y se metía crudo en un <h1> y en un
   <title>— y no lo encontré yo leyendo el código, lo encontró una revisión de
   seguridad. Una regla que se comprueba sola no se olvida. */
const boardJs = readFileSync(join(raiz, 'app/board.js'), 'utf8');

/* Los campos de la ficha, leídos del propio código para que la regla no se
   quede atrás si mañana se añade uno. */
const campos = (boardJs.match(/var CARD_FIELDS = \[([\s\S]*?)\];/) || [, ''])[1]
  .match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1)) || [];

/* La primera versión de esta regla marcaba cualquier «+ algo» en una línea con
   una etiqueta, y daba tres falsos positivos de tres: el nombre de una sección
   («Consignas»), un color de una tabla fija, y un «it.map» cuyo interior sí
   escapaba. Una regla que grita por nada se acaba apagando, y entonces no
   protege de nada. Así que mira solo lo que de verdad viene de fuera: los
   campos de la ficha, leídos por «c.campo» o «card().campo». */
const sospechosas = [];
if (!campos.length) falla('la regla encuentra la lista de campos de la ficha');
const patron = new RegExp('\\+\\s*\\(?\\s*((?:c|card\\(\\))\\.(?:' + campos.join('|') + '))\\b', 'g');
boardJs.split('\n').forEach((linea, i) => {
  if (!/'<[a-z!/]/i.test(linea)) return;                 // no está armando HTML
  let m;
  while ((m = patron.exec(linea)) !== null) {
    const antes = linea.slice(0, m.index + m[0].length - m[1].length);
    if (!/esc\(\s*$/.test(antes)) {
      sospechosas.push('board.js:' + (i + 1) + '  ' + m[1] + '  →  ' + linea.trim().slice(0, 64));
    }
  }
});

/* Y el título de la hoja de sesión, que es el caso que se escapó de verdad: se
   rellena con «card().titulo» a través de un cuadro de texto, así que el rastro
   se pierde y la regla de arriba no lo ve. Aquí se mira su función entera. */
const hoja = boardJs.slice(boardJs.indexOf('function printSheet'),
                           boardJs.indexOf('function printSheet') + 4000);
const titulos = hoja.match(/\+\s*\(?\s*(?:esc\()?\s*title\b/g) || [];
titulos.forEach((t) => { if (!/esc\(/.test(t)) sospechosas.push('printSheet: «' + t.trim() + '» sin esc()'); });
if (!titulos.length) falla('la regla encuentra el título de la hoja de sesión');

if (sospechosas.length) {
  falla('nada de la ficha entra en HTML sin escapar');
  sospechosas.forEach((s) => console.log('       ' + s));
} else {
  bien('nada de la ficha entra en HTML sin escapar  (' + campos.length + ' campos vigilados)');
}

/* ---------- 6 · la versión de las condiciones, cuadrada en los tres sitios ----------

   Hay tres copias de la misma cadena y tienen que decir lo mismo:

     privacidad.html — el texto que la persona lee
     nube.js         — la que la aplicación dice que enseña
     schema.sql      — la que el servidor anota como aceptada

   Quién manda es el servidor: el navegador manda un sí pelado y nada más, para
   que nadie pueda anotarse una versión inventada. Pero si las tres no
   coinciden, lo anotado no corresponde al texto que había delante, y entonces
   el registro del consentimiento no vale para lo único que sirve. Cambiar el
   texto y olvidar una de las tres es el fallo silencioso que esto impide. */
const nubeJs  = readFileSync(join(raiz, 'app/nube.js'), 'utf8');
const esquema = readFileSync(join(raiz, 'supabase/schema.sql'), 'utf8');
const privaci = readFileSync(join(raiz, 'privacidad.html'), 'utf8');

const vCliente  = (nubeJs.match(/var CONDICIONES = '([^']+)'/) || [])[1];
const vServidor = (esquema.match(/condiciones_vigentes\(\)[\s\S]{0,160}?select '([^']+)'::text/) || [])[1];
const vTexto    = (privaci.match(/Versión <code>([^<]+)<\/code>/) || [])[1];

if (!vCliente || !vServidor || !vTexto) {
  falla('se encuentra la versión de las condiciones en los tres sitios',
        'nube.js=' + vCliente + '  schema.sql=' + vServidor + '  privacidad.html=' + vTexto);
} else if (vCliente === vServidor && vServidor === vTexto) {
  bien('la versión de las condiciones coincide en los tres sitios', vCliente);
} else {
  falla('la versión de las condiciones coincide en los tres sitios',
        'nube.js=' + vCliente + '  schema.sql=' + vServidor + '  privacidad.html=' + vTexto);
}

/* Y el navegador no manda la versión, solo el sí. Si algún día alguien
   «simplifica» esto mandando CONDICIONES en el registro, el servidor lo
   seguiría ignorando, pero el código diría una mentira a quien lo lea. */
if (/acepto:\s*acepto\s*\?\s*CONDICIONES/.test(nubeJs)) {
  falla('el navegador manda el sí, no la versión', 'nube.js manda CONDICIONES en el registro');
} else {
  bien('el navegador manda el sí, no la versión: la pone el servidor');
}

/* ---------- 7 · la privacidad promete una puerta y tiene que existir ----------

   La página dice que puedes pedir una copia de tus datos o poner una queja. Sin
   una dirección a la que escribir, eso es una frase sin puerta, y además no
   sirve como aviso legal. Estuvo un tiempo con un «pendiente de publicar» y un
   comentario en el código pidiendo que se rellenara: un comentario no impide
   publicar nada. Esto sí. */
const correo = privaci.match(/mailto:([^"']+)/);
if (!correo) {
  falla('la privacidad da una dirección a la que escribir', 'no hay ningún mailto:');
} else if (/pendiente|PENDIENTE|por definir|TODO/.test(privaci)) {
  falla('la privacidad no se publica con huecos por rellenar',
        (privaci.match(/[^.]*\b(?:pendiente|PENDIENTE|por definir|TODO)\b[^.]*/) || [''])[0].trim().slice(0, 80));
} else {
  bien('la privacidad da una dirección a la que escribir, y sin huecos', correo[1]);
}

console.log(malos ? '\n' + malos + ' FALLOS' : '\nIdentificadores correctos');
process.exit(malos ? 1 : 0);
