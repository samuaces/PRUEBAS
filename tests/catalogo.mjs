/* Comprueba el catálogo que trae la aplicación: assets/biblioteca.json.
 *
 *   node tests/catalogo.mjs
 *
 * No hace falta navegador ni nada instalado. Lo que se mira no es que el JSON
 * sea válido —eso ya lo dice el propio JSON.parse— sino que cada ejercicio se
 * pueda DIBUJAR: que la modalidad y el encuadre existan, que las piezas sean de
 * las que el motor sabe pintar, que estén dentro del campo y dentro del
 * encuadre elegido, que no se tapen unas a otras, y que la ficha esté completa
 * y con un momento de los que ofrece el filtro de la biblioteca.
 *
 * Es la red que impide meter un ejercicio mal puesto sin enterarse: colocado a
 * ojo sobre la pantalla es fácil dejar una pieza fuera del medio campo, o dos
 * fichas una encima de otra, y eso no se ve hasta que alguien lo abre.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const PITCHES = { f11: [105, 68], f7: [65, 45], futsal: [40, 20] };
const VISTAS = ['full', 'half', 'area', 'blank'];
const PIEZAS = ['player', 'ball', 'cone', 'disc', 'goal', 'minigoal', 'hurdle',
                'ladder', 'pole', 'dummy', 'ring', 'flag', 'text'];
const TRAZOS = ['pass', 'run', 'dribble', 'free', 'zone', 'measure'];
const CAMPOS = ['titulo', 'categoria', 'momento', 'fecha', 'sesion', 'duracion', 'series',
  'descanso', 'jugadores', 'porteros', 'espacio', 'material', 'objetivo', 'descripcion',
  'consignas', 'normas', 'variantes'];
const OBLIGATORIOS = ['titulo', 'momento', 'duracion', 'espacio', 'material',
  'objetivo', 'descripcion', 'consignas', 'normas', 'variantes'];

// Los momentos válidos no se copian aquí: se leen del propio desplegable, para
// que no puedan separarse el catálogo y el filtro que lo busca.
const MOMENTOS = readFileSync(join(RAIZ, 'app/index.html'), 'utf8')
  .split('id="lib-momento"')[1].split('</select>')[0]
  .match(/<option>([^<]+)</g).map((s) => s.slice(8, -1));

const cat = JSON.parse(readFileSync(join(RAIZ, 'assets/biblioteca.json'), 'utf8'));
let fallos = 0;
const mal = (e, t) => { fallos++; console.log(` FALLA ${e.id || '(sin id)'}: ${t}`); };

if (!cat.version) { console.log(' FALLA el catálogo no lleva versión'); fallos++; }
if (!Array.isArray(cat.ejercicios) || !cat.ejercicios.length) {
  console.log(' FALLA el catálogo no trae ejercicios'); process.exit(1);
}

const ids = new Set();
for (const e of cat.ejercicios) {
  if (!e.id) mal(e, 'sin id');
  if (ids.has(e.id)) mal(e, 'el id está repetido'); ids.add(e.id);
  if (!PITCHES[e.pitch]) { mal(e, 'modalidad desconocida: ' + e.pitch); continue; }
  if (VISTAS.indexOf(e.view) < 0) mal(e, 'encuadre desconocido: ' + e.view);
  const [LARGO, ANCHO] = PITCHES[e.pitch];

  // --- la ficha ---
  if (!e.card || typeof e.card !== 'object') { mal(e, 'sin ficha'); continue; }
  for (const k of Object.keys(e.card)) if (CAMPOS.indexOf(k) < 0) mal(e, 'campo inventado en la ficha: ' + k);
  for (const k of OBLIGATORIOS) if (!e.card[k]) mal(e, 'la ficha no trae ' + k);
  if (MOMENTOS.indexOf(e.card.momento) < 0)
    mal(e, `momento que el filtro no ofrece: «${e.card.momento}»`);
  if ((e.card.titulo || '').length > 120) mal(e, 'título de más de 120 caracteres');
  if ((e.card.objetivo || '').length > 400) mal(e, 'objetivo de más de 400 caracteres');

  // --- las piezas ---
  const suyos = new Set();
  if (!Array.isArray(e.objects) || !e.objects.length) { mal(e, 'sin piezas'); continue; }
  for (const o of e.objects) {
    if (suyos.has(o.id)) mal(e, 'id repetido dentro del ejercicio: ' + o.id); suyos.add(o.id);
    if (PIEZAS.indexOf(o.kind) < 0) mal(e, 'pieza que el motor no sabe pintar: ' + o.kind);
    if (!(o.x >= 0 && o.x <= LARGO)) mal(e, `${o.kind} fuera del campo: x=${o.x} (0..${LARGO})`);
    if (!(o.y >= 0 && o.y <= ANCHO)) mal(e, `${o.kind} fuera del campo: y=${o.y} (0..${ANCHO})`);
    if (o.kind === 'player' && ['home', 'away', 'neutral'].indexOf(o.team) < 0)
      mal(e, 'equipo desconocido: ' + o.team);
  }
  if (e.objects.filter((o) => o.kind === 'ball').length !== 1)
    mal(e, 'tiene que haber un balón, y solo uno');

  // Dos metros es lo que hay entre un defensa y el atacante al que marca. Por
  // debajo de eso las fichas se solapan y el dibujo deja de entenderse.
  const fichas = e.objects.filter((o) => o.kind === 'player');
  for (let i = 0; i < fichas.length; i++) for (let j = i + 1; j < fichas.length; j++) {
    const d = Math.hypot(fichas[i].x - fichas[j].x, fichas[i].y - fichas[j].y);
    if (d < 2) mal(e, `fichas encimadas a ${d.toFixed(1)} m: ${fichas[i].num} y ${fichas[j].num}`);
  }

  // --- los trazos ---
  for (const s of (e.strokes || [])) {
    if (suyos.has(s.id)) mal(e, 'id repetido: ' + s.id); suyos.add(s.id);
    if (TRAZOS.indexOf(s.tool) < 0) mal(e, 'trazo que el motor no sabe pintar: ' + s.tool);
    if (!Array.isArray(s.pts) || s.pts.length < 2) mal(e, 'trazo con menos de dos puntos');
    for (const p of (s.pts || [])) {
      if (!(p.x >= 0 && p.x <= LARGO) || !(p.y >= 0 && p.y <= ANCHO))
        mal(e, `trazo fuera del campo: (${p.x}, ${p.y})`);
    }
  }

  // --- que todo quepa en el encuadre con el que se abre ---
  let caja = null;
  if (e.view === 'half') caja = [0, LARGO / 2, 0, ANCHO];
  if (e.view === 'area' && e.pitch === 'f11') caja = [36.5, 68.5, 23, 45];
  if (caja) {
    const todo = e.objects.concat((e.strokes || []).flatMap((s) => s.pts || []));
    for (const p of todo) {
      if (p.x < caja[0] - 0.5 || p.x > caja[1] + 0.5 || p.y < caja[2] - 0.5 || p.y > caja[3] + 0.5)
        mal(e, `algo se queda fuera del encuadre «${e.view}»: (${p.x}, ${p.y})`);
    }
  }
}

const porModalidad = {};
cat.ejercicios.forEach((e) => { porModalidad[e.pitch] = (porModalidad[e.pitch] || 0) + 1; });
console.log(`\n${cat.ejercicios.length} ejercicios · ` +
  Object.entries(porModalidad).map(([k, v]) => `${k}: ${v}`).join(' · '));
console.log(fallos ? `${fallos} PROBLEMAS` : 'Catálogo correcto');
process.exit(fallos ? 1 : 0);
