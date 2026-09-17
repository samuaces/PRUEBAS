/* El cofre · pruebas del cifrado de extremo a extremo
 *
 *   node tests/cofre.mjs
 *
 * Esto corre en Node, sin navegador, porque WebCrypto está en Node desde la 19
 * y es exactamente la misma API. Y corre aquí a propósito: si las pruebas del
 * cifrado necesitaran levantar un Chromium, se acabarían saltando.
 *
 * ---------------------------------------------------------------------------
 * QUÉ SE COMPRUEBA Y POR QUÉ ESTAS COSAS Y NO OTRAS
 *
 * Un fallo de cifrado no se ve. No hay una pantalla torcida ni un botón que no
 * responda: o los datos de alguien viajan en claro sin que nadie se entere, o
 * se quedan ilegibles para siempre. Así que aquí no vale «pasa el caso bueno».
 * Cada prueba busca una de las formas conocidas de estropear esto:
 *
 *   Que el bloque no lleve el nombre dentro. Es la promesa entera. Se mira
 *   byte a byte, no confiando en que «claro, está cifrado».
 *
 *   Que dos cifrados del mismo dato den bloques distintos. Si salieran
 *   iguales, el IV se estaría repitiendo, y repetir un IV en AES-GCM no es un
 *   descuido: se puede recuperar la clave de autenticación.
 *
 *   Que un bloque tocado NO se abra. Esa es la diferencia entre GCM y cifrar a
 *   secas: tiene que fallar, no devolver basura.
 *
 *   Que una contraseña mala devuelva null y no reviente. Quien llama tiene que
 *   poder distinguir «no es la llave» de «hay un error de programa», porque lo
 *   primero pasa todos los días —contraseña cambiada en otro dispositivo— y lo
 *   segundo no debería pasar nunca.
 *
 *   Que cambiar la contraseña abra los datos VIEJOS. Es el motivo de que haya
 *   dos claves. Si esto falla, el diseño entero no sirve para nada.
 *
 *   Que el base64 sea el de todo el mundo. Está escrito a mano porque «btoa»
 *   no existe en Node ni «Buffer» en el navegador. Uno escrito a mano puede
 *   ser coherente consigo mismo y aun así ilegible para cualquier otra cosa,
 *   y eso no se nota hasta que alguien mira la columna del servidor.
 *
 * ---------------------------------------------------------------------------
 * Estas pruebas se han probado a ellas mismas: se rompió el cofre de diez
 * maneras —IV fijo, sal fija, no cifrar, tragarse el fallo de autenticación,
 * reenvolver con otra clave, menos vueltas, dos formas de estropear el base64,
 * la clave de la contraseña exportable— y nueve se cayeron aquí. La décima
 * —quitar la guarda del largo mínimo en «abre»— no se cayó porque no cambia
 * nada: «decrypt» rechaza igual un bloque más corto que su etiqueta. Está
 * escrito en el propio cofre para que nadie la tome por lo que no es.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Se carga el archivo tal cual, sin tocarlo ni envolverlo: lo que se prueba
   tiene que ser exactamente lo que se sirve. El eval indirecto lo ejecuta en
   el ámbito global, que es donde el módulo espera dejar su PTCofre. */
(0, eval)(readFileSync(join(raiz, 'app/cofre.js'), 'utf8'));
const C = globalThis.PTCofre;

let malos = 0, buenos = 0;
const bien = (t, x) => { buenos++; console.log('  ok   ' + t + (x ? '  (' + x + ')' : '')); };
const falla = (t, x) => { malos++; console.log(' FALLA ' + t + (x ? '  (' + x + ')' : '')); };
const es = (t, a, b) => (a === b ? bien(t) : falla(t, 'esperaba ' + b + ', salió ' + a));
const cierto = (t, v, x) => (v ? bien(t, x) : falla(t, x));

/* Los dos ayudantes que hacen de «otro programa»: si nuestro base64 y el de
   Node no se entienden, alguna de las pruebas de abajo se cae. */
const aBytes = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
const aB64 = (bytes) => Buffer.from(bytes).toString('base64');

// Una plantilla de verdad, con lo que trae un nombre de verdad: tildes y ñ.
const PLANTILLA = {
  jugadores: [
    { id: 'j1', nombre: 'Ainhoa Peñaranda', dorsal: '7', nota: 'zurda, muy técnica' },
    { id: 'j2', nombre: 'Íker Sánchez-Ruiz', dorsal: '1', nota: '' }
  ],
  sesiones: { '2026-09-17': { titulo: 'Finalización', ejercicios: [] } },
  vacio: null, cero: 0, no: false
};

console.log('\n── el cofre ───────────────────────────────────────────────\n');

/* ---------- 1 · está y es el de siempre ---------- */
cierto('hay WebCrypto en este entorno', C.hay());
es('las vueltas de PBKDF2 siguen siendo las de OWASP', C.VUELTAS, 310000);

/* ---------- 2 · estrenar un cofre ---------- */
const cofre = await C.estrena('caballo-correcto-grapa-pila');
cierto('estrena devuelve sal, maestra envuelta y clave',
       !!(cofre.sal && cofre.maestra && cofre.clave));
es('la sal son 16 bytes', aBytes(cofre.sal).length, 16);
es('la clave maestra son 32 bytes (AES-256)',
   aBytes(await C.maestraATexto(cofre.clave)).length, 32);

const otro = await C.estrena('caballo-correcto-grapa-pila');
cierto('dos cofres con la MISMA contraseña tienen sales distintas',
       otro.sal !== cofre.sal);
cierto('dos cofres con la misma contraseña tienen envoltorios distintos',
       otro.maestra !== cofre.maestra);
/* Y las maestras también, claro: si dos personas con la misma contraseña
   acabaran con la misma clave, la contraseña sería la clave. */
cierto('dos cofres con la misma contraseña tienen maestras distintas',
       (await C.maestraATexto(otro.clave)) !== (await C.maestraATexto(cofre.clave)));

/* ---------- 3 · abrir con la contraseña ---------- */
const bloque = await C.cierra(cofre.clave, PLANTILLA);

const buena = await C.abreConContraseña('caballo-correcto-grapa-pila',
                                        cofre.sal, cofre.maestra);
cierto('la contraseña buena devuelve una clave', !!buena);
const leido = await C.abre(buena, bloque);
es('y esa clave abre lo que cifró la del estreno',
   JSON.stringify(leido), JSON.stringify(PLANTILLA));

const mala = await C.abreConContraseña('caballo-correcto-grapa-pil',
                                       cofre.sal, cofre.maestra);
es('una contraseña mala devuelve null, no revienta', mala, null);
const vacia = await C.abreConContraseña('', cofre.sal, cofre.maestra);
es('una contraseña vacía devuelve null', vacia, null);
const salAjena = await C.abreConContraseña('caballo-correcto-grapa-pila',
                                           otro.sal, cofre.maestra);
es('la contraseña buena con la sal de otro cofre devuelve null', salAjena, null);
const envoltorioAjeno = await C.abreConContraseña('caballo-correcto-grapa-pila',
                                                  cofre.sal, otro.maestra);
es('la contraseña buena con el envoltorio de otro cofre devuelve null',
   envoltorioAjeno, null);

/* ---------- 4 · lo que se sube NO lleva los nombres dentro ----------

   La promesa de todo esto en una prueba. Se buscan los nombres en los bytes
   del bloque, en las tres formas en las que podrían aparecer si alguien
   «optimizara» el cifrado por accidente. */
const crudo = aBytes(bloque);
const comoTexto = Buffer.from(crudo).toString('latin1');
const rastros = ['Ainhoa', 'Peñaranda', 'Íker', 'Finalización', 'jugadores', 'dorsal']
  .filter((p) => comoTexto.includes(p) ||
                 comoTexto.includes(Buffer.from(p, 'utf8').toString('latin1')) ||
                 bloque.includes(Buffer.from(p, 'utf8').toString('base64').replace(/=+$/, '')));
if (rastros.length) falla('el bloque cifrado no lleva ningún nombre dentro', rastros.join(', '));
else bien('el bloque cifrado no lleva ningún nombre dentro',
          crudo.length + ' bytes revisados');

/* ---------- 5 · el IV es distinto en cada cifrado ----------

   Repetir IV con la misma clave en GCM rompe el cifrado de verdad. Diez
   cifrados del MISMO objeto con la MISMA clave tienen que dar diez bloques
   distintos y diez cabeceras de 12 bytes distintas. */
const diez = [];
for (let i = 0; i < 10; i++) diez.push(await C.cierra(cofre.clave, PLANTILLA));
es('diez cifrados del mismo dato dan diez bloques distintos',
   new Set(diez).size, 10);
es('y diez vectores de inicialización distintos',
   new Set(diez.map((b) => aB64(aBytes(b).subarray(0, 12)))).size, 10);

/* ---------- 6 · un bloque tocado no se abre ----------

   Es lo que da GCM por encima de cifrar a secas. Se toca un byte de cada
   parte: el IV, el centro del cifrado, y la etiqueta de autenticación del
   final. Las tres tienen que dar null. */
async function tocaByte(b64, pos) {
  const b = aBytes(b64);
  b[pos] = b[pos] ^ 0x01;
  return C.abre(cofre.clave, aB64(b));
}
es('un bloque con el IV tocado no se abre', await tocaByte(bloque, 3), null);
es('un bloque con el cifrado tocado no se abre',
   await tocaByte(bloque, Math.floor(crudo.length / 2)), null);
es('un bloque con la etiqueta tocada no se abre',
   await tocaByte(bloque, crudo.length - 1), null);
es('un bloque recortado no se abre',
   await C.abre(cofre.clave, aB64(crudo.subarray(0, crudo.length - 1))), null);
es('un bloque alargado no se abre',
   await C.abre(cofre.clave, bloque + 'AAAA'), null);

/* ---------- 7 · basura por la puerta ----------

   Lo que llega del servidor puede ser cualquier cosa: una fila a medio
   escribir, una columna vacía, el bloque de otra cuenta. Ninguna de esas
   puede ser una excepción sin capturar en medio del arranque. */
for (const [qué, v] of [['una cadena vacía', ''], ['un null', null],
                        ['un undefined', undefined], ['un número', 12345],
                        ['texto que no es base64', '¡hola qué tal!'],
                        ['un objeto', { a: 1 }],
                        ['doce bytes justos (solo el IV)', aB64(new Uint8Array(12))],
                        ['base64 de tres bytes', 'AAAA']]) {
  let r, reventó = false;
  try { r = await C.abre(cofre.clave, v); } catch (e) { reventó = true; }
  if (reventó) falla('abrir con ' + qué + ' devuelve null sin reventar', 'lanzó');
  else es('abrir con ' + qué + ' devuelve null', r, null);
}

/* Y la clave de otra cuenta sobre un bloque bueno. */
es('la clave de otro cofre no abre este bloque',
   await C.abre(otro.clave, bloque), null);

/* ---------- 8 · cambiar la contraseña sin tocar los datos ----------

   El motivo de que haya dos claves. Después de reenvolver, la contraseña
   NUEVA tiene que abrir el bloque que se cifró ANTES del cambio. Si esto
   falla, cambiar la contraseña quema la temporada. */
const nuevo = await C.reenvuelve(cofre.clave, 'otra-contraseña-larga-y-distinta');
cierto('reenvuelve devuelve sal y maestra', !!(nuevo.sal && nuevo.maestra));
cierto('reenvuelve estrena una sal nueva', nuevo.sal !== cofre.sal);

const conLaNueva = await C.abreConContraseña('otra-contraseña-larga-y-distinta',
                                             nuevo.sal, nuevo.maestra);
cierto('la contraseña nueva devuelve una clave', !!conLaNueva);
es('y abre el bloque cifrado ANTES de cambiar la contraseña',
   JSON.stringify(await C.abre(conLaNueva, bloque)), JSON.stringify(PLANTILLA));
es('la clave no ha cambiado, solo el envoltorio',
   await C.maestraATexto(conLaNueva), await C.maestraATexto(cofre.clave));
es('la contraseña vieja ya no abre el envoltorio nuevo',
   await C.abreConContraseña('caballo-correcto-grapa-pila', nuevo.sal, nuevo.maestra),
   null);
/* Y lo que esto obliga al servidor: el envoltorio viejo SIGUE abriéndose con
   la contraseña vieja. No es un fallo del cofre —es una propiedad de cifrar—,
   pero significa que cambiar la contraseña tiene que SUSTITUIR la fila, no
   añadir una. Se deja escrito aquí para que nadie lo descubra tarde. */
cierto('el envoltorio viejo sigue abriéndose con la vieja: hay que sustituirlo',
       !!(await C.abreConContraseña('caballo-correcto-grapa-pila',
                                    cofre.sal, cofre.maestra)));

/* Y se puede volver a cambiar, encadenando. */
const tercero = await C.reenvuelve(conLaNueva, 'la-tercera-contraseña');
const conLaTercera = await C.abreConContraseña('la-tercera-contraseña',
                                               tercero.sal, tercero.maestra);
es('se puede cambiar la contraseña otra vez y sigue abriendo lo de siempre',
   JSON.stringify(await C.abre(conLaTercera, bloque)), JSON.stringify(PLANTILLA));

/* ---------- 9 · guardar la clave en este dispositivo ----------

   Esto es lo que salva a quien olvida la contraseña: el dispositivo donde ya
   entró tiene la maestra guardada y puede volver a envolverla. Así que el
   viaje clave → texto → clave tiene que ser exacto. */
const texto = await C.maestraATexto(cofre.clave);
const vuelta = await C.maestraDeTexto(texto);
es('la clave guardada y recuperada abre lo mismo',
   JSON.stringify(await C.abre(vuelta, bloque)), JSON.stringify(PLANTILLA));
es('y vuelve a salir como el mismo texto', await C.maestraATexto(vuelta), texto);
/* Y una clave recuperada sirve para cifrar, no solo para abrir. */
es('la clave recuperada también cifra',
   JSON.stringify(await C.abre(cofre.clave, await C.cierra(vuelta, PLANTILLA))),
   JSON.stringify(PLANTILLA));

/* ---------- 10 · el base64 es el de todo el mundo ----------

   Escrito a mano, así que hay que comprobarlo contra otro. Se cifran datos de
   todos los tamaños módulo 3 —que es donde el relleno cambia— y se comprueban
   dos direcciones: que Node entiende lo que escribimos (el largo decodificado
   es el que toca) y que nosotros entendemos lo que escribe Node (vuelve a
   entrar por «abre» después de pasar por Buffer). */
let base64Bien = 0;
const base64Mal = [], rellenos = new Set();
for (let n = 0; n < 24; n++) {
  const datos = { t: 'x'.repeat(n) };
  const b = await C.cierra(cofre.clave, datos);
  const largoClaro = Buffer.byteLength(JSON.stringify(datos), 'utf8');
  const bytes = aBytes(b);
  // 12 del IV + el claro + 16 de la etiqueta de GCM
  if (bytes.length !== 12 + largoClaro + 16) {
    base64Mal.push('n=' + n + ' largo ' + bytes.length +
                   ' esperaba ' + (12 + largoClaro + 16));
    continue;
  }
  /* El relleno, que es lo que más fácil se escribe mal y menos se nota. Node
     y el navegador perdonan un base64 sin los «=» del final; Postgres no:
     decode(…,'base64') se queja. Y eso saldría el día que alguien mire la
     columna, no aquí. La regla dura es que el largo sea múltiplo de 4. */
  if (b.length % 4 !== 0) { base64Mal.push('n=' + n + ' relleno «' + b.slice(-4) + '»'); continue; }
  rellenos.add((b.match(/=*$/) || [''])[0].length);
  // Ida y vuelta por el codificador de Node: tiene que seguir abriéndose.
  const otraVez = await C.abre(cofre.clave, aB64(bytes));
  if (!otraVez || otraVez.t !== datos.t) { base64Mal.push('n=' + n + ' no vuelve'); continue; }
  base64Bien++;
}
if (base64Mal.length) falla('el base64 es el estándar, en todos los largos',
                            base64Mal.slice(0, 4).join(' · '));
else bien('el base64 es el estándar, en todos los largos',
          base64Bien + ' largos, ida y vuelta contra Buffer');
/* Y que el barrido de arriba haya visto de verdad los tres casos de relleno:
   sin «=», con uno y con dos. Si solo hubiera visto uno, la regla del
   múltiplo de 4 estaría mirando a un sitio donde no pasa nada. */
es('el barrido pasa por los tres casos de relleno (ninguno, «=», «==»)',
   [...rellenos].sort().join(','), '0,1,2');

/* La maestra son 32 bytes, que acaban en un «=». Que nuestro decodificador
   trague el relleno y que nuestro codificador lo ponga. */
cierto('el relleno «=» se escribe donde toca', texto.endsWith('='));
es('y se lee un base64 escrito por otro',
   await C.maestraATexto(await C.maestraDeTexto(aB64(aBytes(texto)))), texto);

/* ---------- 12 · dos cosas que solo se ven en el código ----------

   No todo lo que importa se puede observar desde fuera. La clave que sale de
   la contraseña nunca asoma por la API, así que no hay forma de comprobar
   probando que no se pueda exportar; y ese «false» es justo lo que impide que
   un script inyectado se la lleve. Se mira el código, como se hace con las
   otras reglas de la casa en tests/ids.mjs. */
const fuente = readFileSync(join(raiz, 'app/cofre.js'), 'utf8');
const derivacion = (fuente.match(/subtle\.deriveKey\(([\s\S]*?)\);/) || [, ''])[1];
cierto('la clave de la contraseña no se puede exportar',
       /length:\s*256\s*\}\s*,\s*false\s*,/.test(derivacion));
cierto('el IV se saca al azar dentro de «cierra», nadie lo pasa desde fuera',
       /function cierra\(clave, obj\) \{\s*\n\s*var iv = alAzar\(IV_BYTES\);/.test(fuente) &&
       !/function cierra\([^)]*iv/.test(fuente));

/* ---------- 11 · una temporada entera cabe y va rápida ----------

   El bloque va a una columna de texto de Postgres. Una temporada cargada
   medía 169 KB en claro; aquí se comprueba con algo parecido que ni el
   cifrado ni el base64 lo convierten en otra cosa, y que cifrarlo no tarda
   tanto como para que guardar se note. */
const gorda = { jugadores: [], sesiones: {}, partidos: [] };
for (let i = 0; i < 30; i++) {
  gorda.jugadores.push({ id: 'j' + i, nombre: 'Jugador Número ' + i, dorsal: String(i),
                         nota: 'Observaciones del jugador '.repeat(4) });
}
for (let d = 0; d < 200; d++) {
  gorda.sesiones['2026-' + String((d % 12) + 1).padStart(2, '0') + '-' +
                 String((d % 28) + 1).padStart(2, '0')] =
    { titulo: 'Sesión ' + d, ejercicios: Array.from({ length: 6 }, (_, k) =>
      ({ titulo: 'Ejercicio ' + k, momento: 'Técnica individual', duracion: '15 min',
         objetivo: 'Un objetivo escrito con cierto detalle. '.repeat(3) })) };
}
const claroKB = Math.round(Buffer.byteLength(JSON.stringify(gorda), 'utf8') / 1024);
const t0 = Date.now();
const bloqueGordo = await C.cierra(cofre.clave, gorda);
const msCifrar = Date.now() - t0;
const t1 = Date.now();
const gordaVuelta = await C.abre(cofre.clave, bloqueGordo);
const msAbrir = Date.now() - t1;
const cifradoKB = Math.round(bloqueGordo.length / 1024);

es('una temporada entera vuelve igual', JSON.stringify(gordaVuelta), JSON.stringify(gorda));
cierto('el bloque no engorda más allá del base64 (un tercio)',
       cifradoKB < claroKB * 1.4 + 2, claroKB + ' KB → ' + cifradoKB + ' KB');
cierto('cifrar y abrir una temporada no se nota',
       msCifrar < 400 && msAbrir < 400, msCifrar + ' ms / ' + msAbrir + ' ms');

/* Y derivar la clave de la contraseña SÍ tiene que costar: es lo que protege
   de que alguien pruebe contraseñas contra un bloque robado. Si un día esto
   baja de golpe, es que alguien tocó las vueltas. */
const t2 = Date.now();
await C.abreConContraseña('caballo-correcto-grapa-pila', cofre.sal, cofre.maestra);
const msClave = Date.now() - t2;
cierto('derivar la clave de la contraseña cuesta lo suyo, a propósito',
       msClave >= 15, msClave + ' ms con ' + C.VUELTAS + ' vueltas');

console.log('\n' + (malos ? malos + ' FALLOS de ' + (malos + buenos)
                          : 'El cofre está bien · ' + buenos + ' comprobaciones'));
process.exit(malos ? 1 : 0);
