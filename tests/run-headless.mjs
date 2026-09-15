/* Ejecuta las baterías del navegador en Chromium sin interfaz.

     python3 -m http.server 8899 &
     node tests/run-headless.mjs            → las tres
     node tests/run-headless.mjs equipo     → solo esa

   Cada batería corre en su propio contexto del navegador. No es un detalle de
   limpieza: las tres guardan en el mismo almacén local y con un contexto
   compartido lo que dejaba una se lo encontraba la siguiente. Eso ya dio un
   fallo de verdad —una sesión de una batería apareciendo en otra— y costó un
   rato entenderlo, porque cada una por separado pasaba.
*/

import puppeteer from 'puppeteer-core';

const BATERIAS = ['pizarra', 'nube', 'equipo'];

const pedidas = process.argv.slice(2)
  .map((a) => a.replace(/^tests\//, '').replace(/\.test\.html$/, ''));
const listas = pedidas.length ? pedidas : BATERIAS;

const desconocida = listas.find((n) => !BATERIAS.includes(n));
if (desconocida) {
  console.error('No hay ninguna batería que se llame «' + desconocida + '». ' +
                'Hay: ' + BATERIAS.join(', '));
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
});
const errores = [];

async function bateria(nombre) {
  const contexto = await browser.createBrowserContext();
  const page = await contexto.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  page.on('pageerror', (e) => errores.push(nombre + ' · pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    /* Con la dirección, no solo con el texto: un «404 (File not found)» a secas
       no dice de qué archivo, y sin saberlo no se puede distinguir el favicon
       que pide el propio navegador de un archivo de la aplicación que falta.
       Uno es ruido y el otro es un fallo. */
    const donde = (m.location() && m.location().url) || '';
    errores.push(nombre + ' · console: ' + m.text() + (donde ? '  [' + donde + ']' : ''));
  });
  await page.goto('http://localhost:8899/tests/' + nombre + '.test.html',
                  { waitUntil: 'networkidle0' });
  // Las tres juntas rondan los tres minutos y van creciendo con cada función
  // nueva. El tope está para avisar de un cuelgue, no para cortar una lenta.
  await page.waitForFunction(() => /^(OK|FALLOS)/.test(document.title), { timeout: 240000 });
  const out = await page.$eval('#out', (el) => el.textContent);
  console.log(out);
  await contexto.close();
  return !/FALLOS/.test(out);
}

let todoBien = true;
for (const nombre of listas) {
  if (nombre !== listas[0]) console.log('\n' + '─'.repeat(60) + '\n');
  todoBien = (await bateria(nombre)) && todoBien;
}

/* Un error de página es un fallo, no una nota al pie.

   Al partir board.js se me quedó fuera una constante que board.js seguía
   usando. El navegador lo dijo bien claro —«POCO is not defined»— y la tanda
   acabó igualmente en verde para el ojo que miraba solo la última línea,
   porque los errores se imprimían debajo del resultado sin cambiarlo. Ahora lo
   cambian.

   Se dejan fuera los del contenedor donde corre esto, que no son de la
   aplicación: el proxy bloquea supabase.co y no hay favicon. */
const delContenedor = /TUNNEL|ERR_PROXY|favicon|supabase\.co|ERR_REQUEST_RANGE|ERR_ABORTED/i;
const deVerdad = errores.filter((e) => !delContenedor.test(e));

if (errores.length) console.log('\nERRORES DE LA PÁGINA:\n' + errores.join('\n'));
if (deVerdad.length) {
  console.log('\n' + deVerdad.length + ' ERROR(ES) DE LA APLICACIÓN — la tanda no está limpia');
  todoBien = false;
}
await browser.close();
process.exit(todoBien ? 0 : 1);
