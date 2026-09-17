/* La fusión · pruebas
 *
 *   node tests/fusion.mjs
 *
 * Sin navegador: app/fusion.js no toca ni el almacén ni la pantalla, entran
 * dos objetos y sale uno. Eso es a propósito, y esto es para lo que sirve:
 * poder lanzarle mil casos al azar buscando que se descoloque.
 *
 * ---------------------------------------------------------------------------
 * Hay dos clases de prueba aquí, y las dos hacen falta.
 *
 * Las de casos concretos son las que dicen si hace lo que tiene que hacer: que
 * los tres jugadores del martes y la lista del miércoles convivan, que un
 * borrado no resucite, que un empate no se resuelva a cara o cruz.
 *
 * Las de propiedades son las que dicen si aguanta lo que no se me ocurre. Una
 * fusión tiene que cumplir dos cosas o los dispositivos no vuelven a
 * juntarse nunca: que dé igual el orden, y que fusionar dos veces no mueva
 * nada. Eso no se comprueba con tres ejemplos elegidos por mí —los elegiría
 * justo donde sé que funciona—, se comprueba con datos al azar y muchas
 * veces.
 *
 * Y para saber si estas pruebas valen algo, se rompió la fusión de doce
 * maneras —desempatar mirando a un solo lado, no juntar la marca de la
 * temporada, que la nota de borrado pierda en empate, que pierda la
 * temporada, no tirar nunca las notas, tirar las nuevas en vez de las viejas,
 * no ordenar las claves al comparar, contar la marca como contenido, mirar
 * las claves de un solo lado, que gane el más viejo, que «sin marca» valga
 * como «ahora mismo», y saltarse las notas de un almacén— y las doce se
 * cayeron aquí.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
(0, eval)(readFileSync(join(raiz, 'app/fusion.js'), 'utf8'));
const F = globalThis.PTFusion;

let malos = 0, buenos = 0;
const bien = (t, x) => { buenos++; console.log('  ok   ' + t + (x ? '  (' + x + ')' : '')); };
const falla = (t, x) => { malos++; console.log(' FALLA ' + t + (x ? '  (' + x + ')' : '')); };
const es = (t, a, b) => (a === b ? bien(t) : falla(t, 'esperaba ' + b + ', salió ' + a));
const cierto = (t, v, x) => (v ? bien(t, x) : falla(t, x));
const mismo = (t, a, b) => (F.igual(a, b) ? bien(t)
  : falla(t, '\n         A: ' + F.canon(a).slice(0, 180) +
             '\n         B: ' + F.canon(b).slice(0, 180)));

const AHORA = Date.UTC(2026, 8, 17, 12, 0, 0);
const DIA = 86400000;
const vacio = () => ({ squad: { actual: '2026/27', actualTocado: 0, temporadas: { '2026/27': [] } },
                       asistencia: {}, sesiones: {}, partidos: [], borrados: {} });

console.log('\n── la fusión ──────────────────────────────────────────────\n');

/* ---------- 1 · comparar igual en los dos lados ---------- */
es('el orden de las claves no cambia la comparación',
   F.canon({ a: 1, b: [2, { x: 1, y: 2 }] }), F.canon({ b: [2, { y: 2, x: 1 }] , a: 1 }));
cierto('dos contenidos distintos comparan distinto',
       F.canon({ a: 1 }) !== F.canon({ a: 2 }));

/* ---------- 2 · el caso que da sentido a todo esto ----------

   El martes apuntas tres jugadores en el ordenador. El miércoles, sin haber
   abierto el ordenador, pasas lista en el campo con el móvil. Tienen que
   quedar las dos cosas. */
const pc = vacio();
pc.squad.temporadas['2026/27'] = [
  { id: 'j1', nombre: 'Ana', dorsal: '1', tocado: AHORA - DIA },
  { id: 'j2', nombre: 'Bruno', dorsal: '2', tocado: AHORA - DIA },
  { id: 'j3', nombre: 'Carla', dorsal: '3', tocado: AHORA - DIA }
];
const movil = vacio();
movil.asistencia['2026-09-16'] = { temporada: '2026/27', presentes: ['j9'], tocado: AHORA };

const juntos = F.fusiona(pc, movil, AHORA).datos;
es('los tres jugadores del ordenador siguen ahí',
   juntos.squad.temporadas['2026/27'].length, 3);
cierto('y la lista del móvil también', !!juntos.asistencia['2026-09-16']);
es('sin choques: no son lo mismo', F.fusiona(pc, movil, AHORA).choques.length, 0);

/* ---------- 3 · gana el más reciente, registro a registro ---------- */
const a1 = vacio(), b1 = vacio();
a1.squad.temporadas['2026/27'] = [
  { id: 'j1', nombre: 'Ana Ferrer', tocado: AHORA - 1000 },   // el viejo
  { id: 'j2', nombre: 'Bruno', tocado: AHORA }
];
b1.squad.temporadas['2026/27'] = [
  { id: 'j1', nombre: 'Ana Ferrer Gil', tocado: AHORA },      // el nuevo
  // El mismo Bruno, guardado otra vez sin cambiar nada: marca distinta,
  // contenido igual. Esto NO puede contar como choque.
  { id: 'j2', nombre: 'Bruno', tocado: AHORA - 1000 }
];
a1.squad.temporadas['2026/27'].push({ id: 'j3', nombre: 'Carla', tocado: AHORA });
const r1 = F.fusiona(a1, b1, AHORA);
const dame = (id) => r1.datos.squad.temporadas['2026/27'].find((j) => j.id === id);
es('del jugador cambiado en los dos lados gana el más reciente',
   dame('j1').nombre, 'Ana Ferrer Gil');
es('y el que solo está en un lado no se pierde', dame('j3').nombre, 'Carla');
es('los dos tocados y distintos: eso es un choque, y se cuenta', r1.choques.length, 1);
es('y se dice de qué', r1.choques[0].qué + ' ' + r1.choques[0].clave, 'jugador j1');
/* Volver a guardar sin cambiar nada mueve la marca y no el contenido. Si eso
   contara como choque, la aplicación avisaría de una pérdida que no existe, y
   un aviso que salta sin motivo se aprende a ignorar. */
es('el mismo contenido con marca distinta no es un choque', dame('j2').nombre, 'Bruno');
es('y se queda con la marca más nueva, que es lo último que se supo',
   dame('j2').tocado, AHORA);

/* ---------- 4 · lo de antes de que esto existiera vale cero ----------

   Un registro sin marca es de antes. Cualquier cambio de verdad le gana, y
   eso NO es un choque: avisar de ello sería ruido en cada primera fusión. */
const viejo = vacio(), nuevo = vacio();
viejo.sesiones['2026-09-14'] = { nombre: 'Lo de siempre', ejercicios: [] };  // sin tocado
nuevo.sesiones['2026-09-14'] = { nombre: 'Salida de balón', ejercicios: [], tocado: AHORA };
const r2 = F.fusiona(viejo, nuevo, AHORA);
es('un registro sin marca pierde contra uno tocado',
   r2.datos.sesiones['2026-09-14'].nombre, 'Salida de balón');
es('y eso no se cuenta como choque', r2.choques.length, 0);

/* Pero dos SIN marca que digan cosas distintas sí son un choque: es la
   primera fusión de quien ya venía usando la aplicación en dos sitios. */
const viejoB = vacio();
viejoB.sesiones['2026-09-14'] = { nombre: 'Otra cosa', ejercicios: [] };
const r3 = F.fusiona(viejo, viejoB, AHORA);
es('dos registros sin marca y distintos sí son un choque', r3.choques.length, 1);
mismo('y los dos lados eligen el mismo, no a cara o cruz',
      r3.datos.sesiones, F.fusiona(viejoB, viejo, AHORA).datos.sesiones);

/* ---------- 5 · los borrados no resucitan ---------- */
const tiene = vacio(), borro = vacio();
tiene.partidos = [{ id: 'p1', fecha: '2026-09-12', rival: 'CD Ejemplo', tocado: AHORA - 5000 }];
borro.borrados['partido:p1'] = AHORA - 1000;
es('un partido borrado en un sitio no vuelve por el otro',
   F.fusiona(tiene, borro, AHORA).datos.partidos.length, 0);
mismo('y da igual el orden en que se junten',
      F.fusiona(tiene, borro, AHORA).datos, F.fusiona(borro, tiene, AHORA).datos);

/* Pero si se volvió a crear DESPUÉS de borrarlo, vale lo último que se hizo. */
const rehecho = vacio();
rehecho.partidos = [{ id: 'p1', fecha: '2026-09-12', rival: 'Otra vez', tocado: AHORA }];
es('lo que se borró y se volvió a crear después, se queda',
   F.fusiona(rehecho, borro, AHORA).datos.partidos.length, 1);

/* Y en el empate exacto —tocado y borrado en el mismo milisegundo— gana el
   borrado. No es un caso de la vida real: es que la regla tiene que decidir
   algo fijo, porque si no, dos dispositivos podrían elegir distinto y ya no
   volverían a juntarse. Que gane el borrado es además lo prudente: resucitar
   algo que alguien quitó se nota más que perder un cambio del mismo instante. */
const mismoMs = vacio();
mismoMs.partidos = [{ id: 'p1', fecha: '2026-09-12', rival: 'Justo a la vez',
                      tocado: AHORA - 1000 }];
es('tocado y borrado en el mismo milisegundo: gana el borrado',
   F.fusiona(mismoMs, borro, AHORA).datos.partidos.length, 0);

/* Lo mismo para las otras tres clases de registro, que es donde se olvida. */
const conTodo = vacio();
conTodo.squad.temporadas['2026/27'] = [{ id: 'j1', nombre: 'Ana', tocado: AHORA - 5000 }];
conTodo.sesiones['2026-09-14'] = { nombre: 'X', ejercicios: [], tocado: AHORA - 5000 };
conTodo.asistencia['2026-09-14'] = { presentes: ['j1'], tocado: AHORA - 5000 };
const notas = vacio();
notas.borrados = { 'jugador:2026/27:j1': AHORA, 'sesion:2026-09-14': AHORA,
                   'asistencia:2026-09-14': AHORA };
const r4 = F.fusiona(conTodo, notas, AHORA).datos;
es('un jugador borrado no vuelve', r4.squad.temporadas['2026/27'].length, 0);
es('una sesión borrada no vuelve', Object.keys(r4.sesiones).length, 0);
es('una lista de asistencia borrada no vuelve', Object.keys(r4.asistencia).length, 0);

/* La nota del jugador lleva la temporada dentro. Sin eso, borrar a alguien de
   la 2025/26 lo borraría también de la 2026/27, que es otro jugador. */
const dosTemps = vacio();
dosTemps.squad.temporadas['2025/26'] = [{ id: 'j1', nombre: 'Ana', tocado: AHORA - 5000 }];
dosTemps.squad.temporadas['2026/27'] = [{ id: 'j1', nombre: 'Ana', tocado: AHORA - 5000 }];
const soloUna = vacio();
soloUna.borrados = { 'jugador:2025/26:j1': AHORA };
const r5 = F.fusiona(dosTemps, soloUna, AHORA).datos;
es('borrar de una temporada no borra de la otra',
   (r5.squad.temporadas['2025/26'] || []).length + '/' +
   (r5.squad.temporadas['2026/27'] || []).length, '0/1');

/* ---------- 6 · las notas no se guardan para siempre ---------- */
const notaVieja = vacio();
notaVieja.borrados = { 'partido:p9': AHORA - (F.DIAS_NOTA + 5) * DIA,
                       'partido:p8': AHORA - 10 * DIA };
const r6 = F.fusiona(notaVieja, vacio(), AHORA).datos;
es('una nota de hace más de seis meses se tira',
   Object.keys(r6.borrados).join(','), 'partido:p8');

const muchas = vacio();
for (let i = 0; i < F.TOPE_NOTAS + 50; i++) muchas.borrados['partido:p' + i] = AHORA - i * 1000;
es('y hay un tope, para que el almacén no reviente',
   Object.keys(F.fusiona(muchas, vacio(), AHORA).datos.borrados).length, F.TOPE_NOTAS);
cierto('el tope se lleva las más viejas, no las de ayer',
       !!F.fusiona(muchas, vacio(), AHORA).datos.borrados['partido:p0']);

/* ---------- 7 · la temporada en curso ---------- */
const enA = vacio(), enB = vacio();
enA.squad.actual = '2025/26'; enA.squad.actualTocado = AHORA - 1000;
enB.squad.actual = '2026/27'; enB.squad.actualTocado = AHORA;
es('la temporada en curso la manda el último cambio',
   F.fusiona(enA, enB, AHORA).datos.squad.actual, '2026/27');
enB.squad.actualTocado = AHORA - 1000;
es('en empate manda la más adelantada: las temporadas van hacia delante',
   F.fusiona(enA, enB, AHORA).datos.squad.actual, '2026/27');
mismo('y da igual el orden', F.fusiona(enA, enB, AHORA).datos.squad,
      F.fusiona(enB, enA, AHORA).datos.squad);

/* ---------- 8 · basura por la puerta ---------- */
let reventó = false;
try {
  F.fusiona(null, undefined, AHORA);
  F.fusiona({}, {}, AHORA);
  F.fusiona({ partidos: 'no soy una lista', squad: 7, sesiones: null, borrados: [] },
            { partidos: [null, { sinId: 1 }, 3] }, AHORA);
} catch (e) { reventó = true; }
cierto('fusionar basura no revienta', !reventó);

/* ---------- 9 · las dos propiedades, con datos al azar ----------

   Aquí es donde esto se gana el sueldo. Se generan dispositivos al azar con
   claves que se pisan y marcas de tiempo de un juego pequeño —para que haya
   empates de verdad— y se comprueban las dos cosas sin las que dos
   dispositivos no vuelven a juntarse nunca:

     que fusionar A con B dé lo mismo que fusionar B con A,
     y que volver a fusionar lo ya fusionado no mueva nada.

   Y una tercera que es la que de verdad importa en la vida real: con TRES
   dispositivos, el orden en que se sincronicen no puede cambiar el resultado.
   Esa es la que se rompe cuando alguien mete un desempate que mira a un solo
   lado. */
let semilla = 20260917;
const azar = () => {                                   // repetible a propósito:
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;  // un fallo al azar que
  return semilla / 0x7fffffff;                            // no se puede repetir
};                                                        // no se puede arreglar
const de = (l) => l[Math.floor(azar() * l.length)];
const MARCAS = [0, AHORA - 2 * DIA, AHORA - DIA, AHORA];
const marca = () => { const t = de(MARCAS); return t ? { tocado: t } : {}; };

function dispositivo() {
  const d = { squad: { actual: de(['2025/26', '2026/27']),
                       actualTocado: de(MARCAS), temporadas: {} },
              asistencia: {}, sesiones: {}, partidos: [], borrados: {} };
  ['2025/26', '2026/27'].forEach((t) => {
    d.squad.temporadas[t] = [];
    for (let i = 1; i <= 4; i++) {
      if (azar() < 0.6) d.squad.temporadas[t].push(
        Object.assign({ id: 'j' + i, nombre: de(['Ana', 'Bruno', 'Carla']),
                        dorsal: String(Math.floor(azar() * 9) + 1) }, marca()));
    }
  });
  for (let i = 10; i <= 16; i++) {
    const f = '2026-09-' + i;
    if (azar() < 0.5) d.sesiones[f] = Object.assign(
      { nombre: de(['Rondos', 'Salida de balón', '']), ejercicios: [] }, marca());
    if (azar() < 0.5) d.asistencia[f] = Object.assign(
      { presentes: ['j1', 'j2'].slice(0, Math.floor(azar() * 3)) }, marca());
  }
  for (let i = 1; i <= 4; i++) {
    if (azar() < 0.5) d.partidos.push(Object.assign(
      { id: 'p' + i, fecha: '2026-09-1' + i, rival: de(['CD Uno', 'CD Dos']),
        golesFavor: Math.floor(azar() * 4) }, marca()));
  }
  ['jugador:2026/27:j2', 'sesion:2026-09-12', 'partido:p3', 'asistencia:2026-09-11']
    .forEach((k) => { if (azar() < 0.25) d.borrados[k] = de(MARCAS.slice(1)); });
  return d;
}

let noConmuta = 0, noIdempotente = 0, noConverge = 0, casos = 500;
for (let n = 0; n < casos; n++) {
  const A = dispositivo(), B = dispositivo(), C = dispositivo();

  const ab = F.fusiona(A, B, AHORA).datos;
  const ba = F.fusiona(B, A, AHORA).datos;
  if (!F.igual(ab, ba)) noConmuta++;

  if (!F.igual(F.fusiona(ab, ab, AHORA).datos, ab)) noIdempotente++;
  // Y volver a ver a B cuando ya se fusionó con B tampoco puede mover nada.
  if (!F.igual(F.fusiona(ab, B, AHORA).datos, ab)) noIdempotente++;

  /* Tres dispositivos, dos caminos distintos hasta el mismo sitio. */
  const porUnLado = F.fusiona(F.fusiona(A, B, AHORA).datos, C, AHORA).datos;
  const porOtro   = F.fusiona(A, F.fusiona(B, C, AHORA).datos, AHORA).datos;
  if (!F.igual(porUnLado, porOtro)) noConverge++;
}
es('da igual el orden: fusionar A con B es fusionar B con A  (' + casos + ' al azar)',
   noConmuta, 0);
es('fusionar lo ya fusionado no mueve nada  (' + (casos * 2) + ' comprobaciones)',
   noIdempotente, 0);
es('con tres dispositivos, el orden de sincronizar da igual  (' + casos + ' al azar)',
   noConverge, 0);

/* Y que los casos al azar estuvieran haciendo algo: si la generación se
   estropeara y saliera todo vacío, las tres de arriba pasarían sin mirar
   nada. */
let conChoque = 0, conBorrado = 0;
semilla = 20260917;
for (let n = 0; n < casos; n++) {
  const r = F.fusiona(dispositivo(), dispositivo(), AHORA);
  if (r.choques.length) conChoque++;
  if (Object.keys(r.datos.borrados).length) conBorrado++;
}
cierto('los casos al azar traen choques de verdad', conChoque > casos * 0.5,
       conChoque + ' de ' + casos);
cierto('y borrados de verdad', conBorrado > casos * 0.3, conBorrado + ' de ' + casos);

console.log('\n' + (malos ? malos + ' FALLOS de ' + (malos + buenos)
                          : 'La fusión está bien · ' + buenos + ' comprobaciones'));
process.exit(malos ? 1 : 0);
