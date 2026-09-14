/* =============================================================================
   Mi equipo · asistencia · estadísticas

   Tres cosas que van juntas:

     La PLANTILLA se escribe una vez por temporada. Dorsal, nombre y posición.
     La SESIÓN es un día de entrenamiento: quién vino y qué se hizo, en orden.
     De ahí salen las cuentas.

   Así los nombres se escriben una sola vez en la vida y después solo se marcan
   casillas. De ahí salen las dos preguntas que un entrenador se hace de verdad:
   quién le está faltando, y en qué se le van los minutos a cada uno.

   ---------------------------------------------------------------------------
   POR QUÉ LA SESIÓN ES EL DÍA

   Antes esto se contaba por partida doble: 'pt-asistencia' guardaba quién vino
   el martes, y cada pizarra que se guardaba ese martes llevaba enganchada su
   propia copia de esa misma lista. Dos sitios para un solo hecho, y los minutos
   se contaban por el día en que alguien DIBUJÓ un ejercicio, no por el día en
   que su equipo lo HIZO.

   Ahora hay un solo objeto: la sesión, que es una fecha. Lleva quién vino y qué
   se hizo. Las pizarras guardadas vuelven a ser lo que son, una biblioteca de
   ejercicios, y no un diario. Lo que había apuntado a la vieja manera se pasa
   solo (migraDeLasPizarras) y no se pierde nada.

   ---------------------------------------------------------------------------
   PRIVACIDAD · esto es lo importante de este archivo

   Son datos de menores: nombres y apellidos de críos. No salen del dispositivo.

   Este módulo no habla con la red. No importa nada de nube.js ni de enlace.js,
   y nadie le pide sus datos para subirlos. Lo que se sube a la biblioteca común
   es el DOCUMENTO de la pizarra (doc), y los jugadores no viven ahí.

   Y a partir de ahora los nombres viven en UN SOLO SITIO, 'pt-squad'. Las
   sesiones guardan identificadores, no nombres; el nombre se busca al pintar.
   Por eso quitar a un jugador que ya tiene historial no lo borra, lo da de baja:
   si se borrara, su historial se quedaría con unas siglas sin dueño.

   Las fichas dibujadas en el campo siguen siendo anónimas: un dorsal y ya.
   Nadie escribe el nombre de un chaval encima del césped.

   Hay pruebas que fallan si esto se rompe (tests/equipo.test.html).
   ========================================================================== */
(function () {
  'use strict';

  var LLAVE_PLANTILLA  = 'pt-squad';
  var LLAVE_ASISTENCIA = 'pt-asistencia';
  var LLAVE_SESIONES   = 'pt-sesiones';
  var TOPE_JUGADORES   = 40;          // en activo, que es lo que se convoca
  var TOPE_GUARDADOS   = 90;          // con las bajas, que se conservan por su historial
  var TOPE_EJERCICIOS  = 30;          // en una sesión; más que eso no es un entrenamiento
  var DIAS_AVISO       = 21;          // sin trabajar un momento del juego
  var TOPE_DIAS        = 400;         // historial de asistencia que se conserva

  var POSICIONES = ['Portero', 'Lateral derecho', 'Central', 'Lateral izquierdo',
                    'Pivote', 'Interior', 'Mediapunta', 'Extremo derecho',
                    'Extremo izquierdo', 'Delantero'];

  /* ---- el almacén, que puede fallar y no por eso se cae la aplicación ---- */

  function lee(llave, porDefecto) {
    try {
      var t = localStorage.getItem(llave);
      if (!t) return porDefecto;
      var v = JSON.parse(t);
      return (v && typeof v === 'object') ? v : porDefecto;
    } catch (e) { return porDefecto; }
  }
  function escribe(llave, valor) {
    try { localStorage.setItem(llave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  }

  /* ---- temporadas -------------------------------------------------------

     La temporada va de julio a junio: en septiembre de 2026 estamos en la
     2026/27, y en marzo de 2027 seguimos en la misma. */

  function temporadaDe(fecha) {
    var d = fecha || new Date();
    var a = d.getFullYear(), m = d.getMonth();       // 0 = enero, 6 = julio
    var inicio = m >= 6 ? a : a - 1;
    return inicio + '/' + String((inicio + 1) % 100).padStart(2, '0');
  }
  function temporadaSiguiente(t) {
    var a = parseInt(String(t).slice(0, 4), 10);
    if (!isFinite(a)) return temporadaDe();
    return (a + 1) + '/' + String((a + 2) % 100).padStart(2, '0');
  }
  // 2026/27 → válida. Se comprueba porque el usuario puede escribirla.
  function temporadaValida(t) { return /^\d{4}\/\d{2}$/.test(String(t || '')); }

  function hoyISO(fecha) {
    var d = fecha || new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }
  function diasEntre(isoA, isoB) {
    var a = new Date(isoA + 'T00:00:00'), b = new Date(isoB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  /* ---- la plantilla ------------------------------------------------------

     { actual: '2026/27', temporadas: { '2026/27': [jugador, …] } }

     Cada jugador que entra pasa por aquí, venga de donde venga: un
     localStorage manipulado a mano no puede dejar la pantalla en blanco. */

  function saneaJugador(j) {
    if (!j || typeof j !== 'object') return null;
    var nombre = String(j.nombre == null ? '' : j.nombre).trim().slice(0, 40);
    if (!nombre) return null;                        // sin nombre no es nadie
    var dorsal = String(j.dorsal == null ? '' : j.dorsal).replace(/\D/g, '').slice(0, 2);
    var pos = POSICIONES.indexOf(String(j.posicion || '')) >= 0 ? j.posicion : '';
    var s = {
      id: /^[a-z0-9]{4,16}$/.test(String(j.id || '')) ? j.id : nuevoId(),
      dorsal: dorsal, nombre: nombre, posicion: pos
    };
    if (j.baja) s.baja = true;
    return s;
  }
  function nuevoId() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(-10);
  }

  function plantillaEntera() {
    var p = lee(LLAVE_PLANTILLA, null);
    var out = { actual: temporadaDe(), temporadas: {} };
    if (!p) return out;
    if (temporadaValida(p.actual)) out.actual = p.actual;
    var t = p.temporadas;
    if (t && typeof t === 'object') {
      Object.keys(t).forEach(function (k) {
        if (!temporadaValida(k) || !Array.isArray(t[k])) return;
        var vistos = {};
        out.temporadas[k] = t[k].map(saneaJugador).filter(function (j) {
          if (!j || vistos[j.id]) return false;      // ids repetidos, fuera
          vistos[j.id] = true;
          return true;
        }).slice(0, TOPE_GUARDADOS);
      });
    }
    if (!out.temporadas[out.actual]) out.temporadas[out.actual] = [];
    return out;
  }

  /* El orden es siempre el mismo, y esto importa más de lo que parece: una
     lista que baila entre aperturas se lee fatal. Por dorsal de menor a mayor;
     los que no tienen dorsal, al final y por nombre. */
  function ordena(lista) {
    return lista.slice().sort(function (a, b) {
      var da = a.dorsal === '' ? null : Number(a.dorsal);
      var db = b.dorsal === '' ? null : Number(b.dorsal);
      if (da === null && db === null) return a.nombre.localeCompare(b.nombre, 'es');
      if (da === null) return 1;
      if (db === null) return -1;
      if (da !== db) return da - db;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }

  function temporadas() {
    var p = plantillaEntera();
    var ks = Object.keys(p.temporadas);
    if (ks.indexOf(p.actual) < 0) ks.push(p.actual);
    return ks.sort().reverse();                      // la más reciente arriba
  }
  function temporadaActual() { return plantillaEntera().actual; }

  /* Los de baja no se convocan ni salen en la lista del día, pero siguen
     guardados: su nombre es lo único que da sentido a su historial. */
  function jugadores(temp, conBajas) {
    var p = plantillaEntera();
    var l = p.temporadas[temp || p.actual] || [];
    if (!conBajas) l = l.filter(function (j) { return !j.baja; });
    return ordena(l);
  }

  function guardaPlantilla(temp, lista) {
    var p = plantillaEntera();
    var vistos = {};
    p.temporadas[temp] = lista.map(saneaJugador).filter(function (j) {
      if (!j || vistos[j.id]) return false;
      vistos[j.id] = true;
      return true;
    }).slice(0, TOPE_GUARDADOS);
    return escribe(LLAVE_PLANTILLA, p);
  }

  function añade(temp, datos) {
    var lista = jugadores(temp, true);
    var enActivo = lista.filter(function (j) { return !j.baja; }).length;
    if (enActivo >= TOPE_JUGADORES) return { ok: false, porque: 'tope' };
    var j = saneaJugador({ dorsal: datos.dorsal, nombre: datos.nombre, posicion: datos.posicion });
    if (!j) return { ok: false, porque: 'sin-nombre' };
    // Dos jugadores con el mismo dorsal se confunden en la pizarra y en las
    // cuentas. Se avisa, pero decide el entrenador: en pretemporada pasa.
    var choca = j.dorsal && lista.some(function (o) { return !o.baja && o.dorsal === j.dorsal; });
    lista.push(j);
    if (!guardaPlantilla(temp, lista)) return { ok: false, porque: 'no-cabe' };
    return { ok: true, jugador: j, dorsalRepetido: !!choca };
  }

  /* Quitar a uno que ya ha entrenado no lo borra: lo da de baja. Si se borrara,
     los entrenamientos a los que vino se quedarían con un identificador sin
     dueño y sus minutos saldrían a nombre de nadie. Al que se apuntó por error y
     no ha pisado el campo sí se le borra: un error tipográfico no tiene por qué
     quedarse en la plantilla para siempre. */
  function quita(temp, id) {
    var lista = jugadores(temp, true);
    var conHistorial = tieneHistorial(id);
    var out = [];
    lista.forEach(function (j) {
      if (j.id !== id) { out.push(j); return; }
      if (conHistorial) { j.baja = true; out.push(j); }
    });
    return guardaPlantilla(temp, out) && (conHistorial ? 'baja' : 'borrado');
  }

  function tieneHistorial(id) {
    var a = asistenciaEntera();
    var hay = Object.keys(a).some(function (f) { return a[f].presentes.indexOf(id) >= 0; });
    if (hay) return true;
    var s = sesionesEnteras();
    return Object.keys(s).some(function (f) {
      return s[f].ejercicios.some(function (e) {
        return e.quienes && e.quienes.indexOf(id) >= 0;
      });
    });
  }

  // Para pintar historial: incluye a los de baja, que también entrenaron.
  function jugadorPorId(id, temp) {
    var l = jugadores(temp, true);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  function cambiaTemporada(temp) {
    if (!temporadaValida(temp)) return false;
    var p = plantillaEntera();
    p.actual = temp;
    if (!p.temporadas[temp]) p.temporadas[temp] = [];
    return escribe(LLAVE_PLANTILLA, p);
  }

  /* ---- la asistencia -----------------------------------------------------

     Una ficha por día:
       { '2026-09-14': { temporada: '2026/27', presentes: ['j1','j2'] } }

     Se guarda quién ESTÁ, no quién falta, porque el historial tiene que poder
     leerse dentro de seis meses aunque la plantilla haya cambiado: si guardara
     ausencias, un jugador dado de baja en enero apareceria como presente en
     todos los entrenamientos de septiembre.

     Pero el día en curso empieza con todos dentro, que es lo normal: se marca
     al que falta, no al que viene. */

  function asistenciaEntera() {
    var a = lee(LLAVE_ASISTENCIA, {});
    var out = {};
    Object.keys(a).forEach(function (f) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
      var d = a[f];
      if (!d || !Array.isArray(d.presentes)) return;
      out[f] = {
        temporada: temporadaValida(d.temporada) ? d.temporada : temporadaDe(new Date(f + 'T12:00:00')),
        presentes: d.presentes.filter(function (x) { return typeof x === 'string'; })
      };
    });
    return out;
  }

  // Quién está hoy. Si el día todavía no tiene ficha, están todos.
  function presentesHoy(fecha) {
    var f = hoyISO(fecha), a = asistenciaEntera();
    if (a[f]) return a[f].presentes.slice();
    return jugadores().map(function (j) { return j.id; });
  }

  function marcaAsistencia(id, viene, fecha) {
    var f = hoyISO(fecha);
    var a = asistenciaEntera();
    var dentro = a[f] ? a[f].presentes.slice() : jugadores().map(function (j) { return j.id; });
    var i = dentro.indexOf(id);
    if (viene && i < 0) dentro.push(id);
    if (!viene && i >= 0) dentro.splice(i, 1);
    a[f] = { temporada: temporadaActual(), presentes: dentro };
    podaAsistencia(a);
    return escribe(LLAVE_ASISTENCIA, a);
  }

  function ponAsistencia(ids, fecha) {
    var a = asistenciaEntera();
    a[hoyISO(fecha)] = { temporada: temporadaActual(), presentes: ids.slice() };
    podaAsistencia(a);
    return escribe(LLAVE_ASISTENCIA, a);
  }

  /* Pasar lista de un día CUALQUIERA, no solo de hoy: el martes por la noche se
     cae en la cuenta de que faltaba uno el jueves pasado. La temporada es la de
     ese día, no la de ahora, que si no un día de junio se guardaría dentro de la
     temporada siguiente al empezar julio. */
  function ponAsistenciaEn(fechaISO, ids) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO))) return false;
    var a = asistenciaEntera();
    var s = sesionesEnteras()[fechaISO];
    a[fechaISO] = {
      temporada: (s && s.temporada) || (a[fechaISO] && a[fechaISO].temporada) ||
                 temporadaDe(new Date(fechaISO + 'T12:00:00')),
      presentes: ids.slice()
    };
    podaAsistencia(a);
    return escribe(LLAVE_ASISTENCIA, a);
  }

  /* Quiénes vinieron ese día. Si todavía no se ha pasado lista, están TODOS:
     se marca al que falta, no al que viene, que es lo normal en un campo. */
  function presentesDe(fechaISO) {
    var a = asistenciaEntera()[fechaISO];
    if (a) return a.presentes.slice();
    return jugadores().map(function (j) { return j.id; });
  }

  // El historial no crece para siempre: más de un año atrás no le sirve a nadie.
  function podaAsistencia(a) {
    var fs = Object.keys(a).sort();
    while (fs.length > TOPE_DIAS) delete a[fs.shift()];
  }

  /* ---- las sesiones ------------------------------------------------------

     Una sesión es un día de entrenamiento, y por eso la llave es la fecha: el
     mismo día que ya usa la asistencia. No hay identificadores inventados ni
     hay manera de que una sesión y su lista de presentes se descoloquen.

       { '2026-09-14': {
           temporada: '2026/27',
           nombre: 'Salida de balón',          // opcional
           ejercicios: [ {                     // en el orden en que se hicieron
             id, titulo, momento, duracion,
             ref: {de:'guardado', nombre} | {de:'catalogo', id} | null,
             quienes: ['j1','j2'] | null       // null = todos los que vinieron
           } ] } }

     Tres cosas que NO se guardan aquí a propósito:

       Los nombres. Se guardan identificadores y el nombre se busca en la
       plantilla al pintar. Un nombre repetido en cien sitios es un nombre que
       algún día se escapa por alguno de ellos.

       Los minutos. Se guarda el texto de la duración tal y como se escribió, y
       se interpreta al leer. Así, arreglar el lector de duraciones arregla
       también el historial, en vez de dejarlo congelado con la cuenta mala.

       El dibujo. Se guarda una referencia a la pizarra o al ejercicio del
       catálogo, más una copia del título, el momento y la duración. La copia es
       lo que hace que la sesión siga contando lo que se hizo aunque después
       borres el ejercicio o lo cambies: un diario no se reescribe solo. */

  function saneaRef(r) {
    if (!r || typeof r !== 'object') return null;
    if (r.de === 'guardado' && r.nombre) return { de: 'guardado', nombre: String(r.nombre).slice(0, 120) };
    if (r.de === 'catalogo' && r.id) return { de: 'catalogo', id: String(r.id).slice(0, 60) };
    return null;
  }

  function saneaEjercicio(e) {
    if (!e || typeof e !== 'object') return null;
    var titulo = String(e.titulo == null ? '' : e.titulo).trim().slice(0, 80);
    if (!titulo) return null;                       // sin título no es nada
    return {
      id: /^[a-z0-9]{4,16}$/.test(String(e.id || '')) ? e.id : nuevoId(),
      titulo: titulo,
      momento: String(e.momento == null ? '' : e.momento).trim().slice(0, 40),
      duracion: String(e.duracion == null ? '' : e.duracion).trim().slice(0, 40),
      ref: saneaRef(e.ref),
      quienes: Array.isArray(e.quienes)
        ? e.quienes.filter(function (x) { return typeof x === 'string'; })
        : null
    };
  }

  function sesionesEnteras() {
    migraDeLasPizarras();
    var s = lee(LLAVE_SESIONES, {});
    var out = {};
    Object.keys(s).forEach(function (f) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
      var d = s[f];
      if (!d || typeof d !== 'object') return;
      out[f] = {
        temporada: temporadaValida(d.temporada) ? d.temporada
                 : temporadaDe(new Date(f + 'T12:00:00')),
        nombre: String(d.nombre == null ? '' : d.nombre).trim().slice(0, 80),
        ejercicios: (Array.isArray(d.ejercicios) ? d.ejercicios : [])
          .map(saneaEjercicio).filter(Boolean).slice(0, TOPE_EJERCICIOS)
      };
    });
    return out;
  }

  function escribeSesiones(s) {
    var fs = Object.keys(s).sort();
    while (fs.length > TOPE_DIAS) delete s[fs.shift()];
    return escribe(LLAVE_SESIONES, s);
  }

  /* La sesión de un día, ya montada: lo que se hizo y quién vino, con los
     minutos echados. Un día sin nada devuelve una sesión vacía, no null: quien
     la pinta no tiene que andar comprobando. */
  function sesionDe(fecha) {
    var f = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? fecha : hoyISO();
    var s = sesionesEnteras()[f];
    var a = asistenciaEntera()[f];
    var presentes = a ? a.presentes.slice() : [];
    var ejercicios = (s ? s.ejercicios : []).map(function (e) {
      return {
        id: e.id, titulo: e.titulo, momento: e.momento, duracion: e.duracion,
        ref: e.ref, quienes: e.quienes,
        minutos: minutosDe(e.duracion),
        // Quién lo hizo: los suyos si los tiene, y si no, los que vinieron.
        hechoPor: e.quienes ? e.quienes.slice() : presentes.slice()
      };
    });
    var min = 0, sinDuracion = 0;
    ejercicios.forEach(function (e) {
      if (e.minutos == null) sinDuracion++; else min += e.minutos;
    });
    return {
      fecha: f,
      temporada: (s && s.temporada) || (a && a.temporada) ||
                 temporadaDe(new Date(f + 'T12:00:00')),
      nombre: s ? s.nombre : '',
      ejercicios: ejercicios,
      presentes: presentes,
      // Un día con asistencia apuntada ya es una sesión, aunque no lleve
      // ejercicios: vinieron, entrenaron, y eso cuenta para la asistencia.
      hayAsistencia: !!a,
      vacia: !s || !s.ejercicios.length,
      minutos: min,
      sinDuracion: sinDuracion
    };
  }

  function guardaSesion(fecha, cambios) {
    var f = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? fecha : hoyISO();
    var s = sesionesEnteras();
    var d = s[f] || { temporada: temporadaDe(new Date(f + 'T12:00:00')),
                      nombre: '', ejercicios: [] };
    if (cambios.nombre !== undefined) d.nombre = String(cambios.nombre).trim().slice(0, 80);
    if (cambios.ejercicios !== undefined) {
      d.ejercicios = cambios.ejercicios.map(saneaEjercicio).filter(Boolean).slice(0, TOPE_EJERCICIOS);
    }
    // Una sesión sin nombre y sin ejercicios no es nada: se borra en vez de
    // dejar una ficha vacía ocupando sitio en el diario.
    if (!d.nombre && !d.ejercicios.length) delete s[f]; else s[f] = d;
    return escribeSesiones(s);
  }

  function añadeEjercicio(fecha, datos) {
    var ses = sesionDe(fecha);
    if (ses.ejercicios.length >= TOPE_EJERCICIOS) return { ok: false, porque: 'tope' };
    var e = saneaEjercicio(datos);
    if (!e) return { ok: false, porque: 'sin-titulo' };
    var lista = ses.ejercicios.concat([e]);
    if (!guardaSesion(fecha, { ejercicios: lista })) return { ok: false, porque: 'no-cabe' };
    return { ok: true, ejercicio: e };
  }

  /* Apuntar un ejercicio como HECHO, que es distinto de añadirlo a una sesión
     que estás preparando: si ese día todavía no tenía lista de asistencia, se
     da por hecho que vinieron los que lo hicieron. Sin esto, esos minutos
     existirían y el día no, y ese entrenamiento no entraría en el «vino a 8 de
     9» de nadie. */
  function apuntaHecho(fecha, datos) {
    var f = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? fecha : hoyISO();
    var r = añadeEjercicio(f, datos);
    if (!r.ok) return r;
    var a = asistenciaEntera();
    if (!a[f] && datos.quienes && datos.quienes.length) {
      a[f] = { temporada: temporadaActual(), presentes: datos.quienes.slice() };
      podaAsistencia(a);
      escribe(LLAVE_ASISTENCIA, a);
    }
    return r;
  }

  function quitaEjercicio(fecha, id) {
    var lista = sesionDe(fecha).ejercicios.filter(function (e) { return e.id !== id; });
    return guardaSesion(fecha, { ejercicios: lista });
  }

  /* Mover uno de sitio. El orden de una sesión no es decorativo: un rondo de
     calentamiento al final no es el mismo entrenamiento. */
  function mueveEjercicio(fecha, id, aDonde) {
    var lista = sesionDe(fecha).ejercicios;
    var i = -1;
    lista.forEach(function (e, n) { if (e.id === id) i = n; });
    if (i < 0) return false;
    var j = i + (aDonde === 'arriba' ? -1 : 1);
    if (j < 0 || j >= lista.length) return false;
    var copia = lista.slice();
    copia[i] = lista[j]; copia[j] = lista[i];
    return guardaSesion(fecha, { ejercicios: copia });
  }

  /* El diario: los días que tienen algo, del más reciente al más antiguo y
     agrupados por mes, que es como se busca «lo del mes pasado». */
  function diario(temp) {
    var t = temp || temporadaActual();
    var dias = {};
    var s = sesionesEnteras(), a = asistenciaEntera();
    Object.keys(s).forEach(function (f) { if (s[f].temporada === t) dias[f] = true; });
    Object.keys(a).forEach(function (f) { if (a[f].temporada === t) dias[f] = true; });
    return Object.keys(dias).sort().reverse().map(function (f) { return sesionDe(f); });
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function porMeses(lista) {
    var out = [], ultimo = null;
    lista.forEach(function (ses) {
      var p = ses.fecha.split('-');
      var clave = p[0] + '-' + p[1];
      if (!ultimo || ultimo.clave !== clave) {
        ultimo = { clave: clave, nombre: MESES[Number(p[1]) - 1] + ' de ' + p[0], sesiones: [] };
        out.push(ultimo);
      }
      ultimo.sesiones.push(ses);
    });
    return out;
  }

  /* ---- de la manera vieja a la nueva, una sola vez -----------------------

     Lo que había apuntado antes de que existieran las sesiones: una pizarra
     guardada con «meta.participants» era, sin decirlo, «este ejercicio lo
     hicimos el día que lo guardé, con esta gente». Eso es una sesión, así que
     se pasa a su sitio con esa misma lectura, y se deja la marca puesta para no
     volver a hacerlo. Nada se borra de 'pt-boards': la biblioteca se queda como
     está, solo deja de ser también el diario.

     La marca de «ya está hecho» es que la llave exista, aunque sea vacía; no una
     bandera en memoria. Así vale igual entre pestañas, entre visitas y en las
     pruebas, y si escribir falla se vuelve a intentar, que es lo que se quiere. */
  function migraDeLasPizarras() {
    try { if (localStorage.getItem(LLAVE_SESIONES) !== null) return false; }
    catch (e) { return false; }

    var todo = lee('pt-boards', {});
    var porDia = {};
    Object.keys(todo).forEach(function (nombre) {
      var b = todo[nombre];
      if (!b || typeof b !== 'object' || !b.doc || typeof b.at !== 'number') return;
      var meta = (b.meta && typeof b.meta === 'object') ? b.meta : {};
      var quienes = Array.isArray(meta.participants) ? meta.participants : [];
      if (!quienes.length) return;              // sin gente no era una sesión
      var card = b.doc.card || {};
      var f = hoyISO(new Date(b.at));
      if (!porDia[f]) porDia[f] = { temporada: temporadaValida(meta.season) ? meta.season
                                              : temporadaDe(new Date(b.at)),
                                    nombre: '', ejercicios: [] };
      porDia[f].ejercicios.push({
        at: b.at,                               // solo para ordenar; no se guarda
        titulo: String(card.titulo || nombre),
        momento: String(card.momento || ''),
        duracion: String(card.duracion || ''),
        ref: { de: 'guardado', nombre: nombre },
        quienes: quienes.map(function (p) { return p && p.id; })
                        .filter(function (x) { return typeof x === 'string'; })
      });
    });

    var s = {};
    Object.keys(porDia).forEach(function (f) {
      var d = porDia[f];
      d.ejercicios.sort(function (x, y) { return x.at - y.at; });
      s[f] = { temporada: d.temporada, nombre: '',
               ejercicios: d.ejercicios.map(saneaEjercicio).filter(Boolean)
                                       .slice(0, TOPE_EJERCICIOS) };
    });
    escribeSesiones(s);

    /* Y si de aquellos días no quedó apuntada la asistencia —se podía guardar
       un ejercicio sin haber pasado lista—, se deja puesta la de quienes
       aparecen en él: es lo único que se sabe de ese día, y sin ella esos
       minutos no serían de nadie. */
    var a = asistenciaEntera(), tocado = false;
    Object.keys(s).forEach(function (f) {
      if (a[f]) return;
      var ids = {};
      s[f].ejercicios.forEach(function (e) {
        (e.quienes || []).forEach(function (id) { ids[id] = true; });
      });
      if (!Object.keys(ids).length) return;
      a[f] = { temporada: s[f].temporada, presentes: Object.keys(ids) };
      tocado = true;
    });
    if (tocado) { podaAsistencia(a); escribe(LLAVE_ASISTENCIA, a); }
    return true;
  }

  /* ---- duración de un ejercicio -----------------------------------------

     El campo es texto libre y la gente escribe de todo. Se mira por orden, de
     lo más seguro a lo más dudoso:

       «4 × 3 min»            cuatro series de tres  →  12
       «3 series de 5 min»    lo mismo dicho con letras  →  15
       «20 min de 3 toques»   el número pegado a «min»  →  20
       «12»                   el primero que haya  →  12

     El tercer paso es el que evita el error tonto: quedarse con el primer
     número daría 3 en «20 min de 3 toques», y el que va pegado a «min» es
     siempre el bueno. Y las palabras del segundo paso son una lista cerrada a
     propósito: en cuanto se abre a cualquier texto entre dos números, empieza a
     multiplicar cosas que no son series. */

  var CUENTAN = 'series|bloques|rondas|repeticiones|reps|veces|estaciones';

  function minutosDe(texto) {
    var t = String(texto == null ? '' : texto).replace(',', '.');

    var porSigno = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i.exec(t);
    if (porSigno) return positivo(Number(porSigno[1]) * Number(porSigno[2]));

    var conLetras = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:' + CUENTAN +
                               ')\\s+de\\s+(\\d+(?:\\.\\d+)?)', 'i').exec(t);
    if (conLetras) return positivo(Number(conLetras[1]) * Number(conLetras[2]));

    var pegado = /(\d+(?:\.\d+)?)\s*(?:min|minutos|m\b|')/i.exec(t);
    if (pegado) return positivo(Number(pegado[1]));

    var uno = /(\d+(?:\.\d+)?)/.exec(t);
    return uno ? positivo(Number(uno[1])) : null;
  }
  // «0 min» no es una duración de cero: es que no se apuntó.
  function positivo(n) { var v = Math.round(n); return v > 0 ? v : null; }

  /* ---- estadísticas ------------------------------------------------------

     Todo sale de las sesiones, en local. Ni una llamada a la red.

     Se cuenta lo que se HIZO, no lo que se dibujó. Antes se contaba por la
     fecha en que una pizarra se guardaba, que es una cosa distinta: un domingo
     por la noche preparando el martes salía como si el equipo hubiera entrenado
     el domingo. Ahora cada ejercicio cuenta el día de su sesión.

     Un ejercicio va a nombre de los suyos si los lleva —el trabajo específico
     de portero es de los porteros— y si no, de todos los que vinieron ese día. */

  function loHecho() {
    var s = sesionesEnteras(), a = asistenciaEntera(), out = [];
    Object.keys(s).forEach(function (f) {
      var presentes = a[f] ? a[f].presentes : [];
      s[f].ejercicios.forEach(function (e) {
        out.push({
          fecha: f,
          // Mediodía: la hora no se guarda y así ningún huso la corre de día.
          at: new Date(f + 'T12:00:00').getTime(),
          temporada: s[f].temporada,
          momento: String(e.momento || '').trim(),
          minutos: minutosDe(e.duracion),
          quienes: e.quienes ? e.quienes.slice() : presentes.slice()
        });
      });
    });
    return out;
  }

  // Busca por todas las temporadas y también entre las bajas: el que entrenó en
  // septiembre tiene nombre en las cuentas aunque se fuera en enero.
  function buscaJugador(id) {
    var p = plantillaEntera(), ks = Object.keys(p.temporadas);
    for (var i = 0; i < ks.length; i++) {
      var l = p.temporadas[ks[i]];
      for (var n = 0; n < l.length; n++) {
        var j = saneaJugador(l[n]);
        if (j && j.id === id) return j;
      }
    }
    return null;
  }

  /* El periodo: 'micro' son 7 días, 'mes' 30, y 'temporada' es la temporada
     actual entera. Los dos primeros mandan por fecha; el tercero, por la
     temporada con la que se guardó. */
  function delPeriodo(lista, periodo, ahora) {
    var t = ahora == null ? Date.now() : ahora;
    if (periodo === 'temporada') {
      var actual = temporadaActual();
      return lista.filter(function (e) { return e.temporada === actual; });
    }
    var dias = periodo === 'mes' ? 30 : 7;
    var desde = t - dias * 86400000;
    return lista.filter(function (e) { return e.at >= desde; });
  }

  // Con los mismos minutos, por orden alfabético: así la lista no baila.
  function porMinutos(a, b) {
    if (b.minutos !== a.minutos) return b.minutos - a.minutos;
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  }

  function estadisticas(periodo, ahora) {
    var todas = loHecho();
    var dentro = delPeriodo(todas, periodo, ahora);

    var total = 0, sinDuracion = 0;
    var porMomento = {}, porJugador = {};

    dentro.forEach(function (e) {
      var min = e.minutos;
      if (min == null) sinDuracion++; else total += min;

      // Un ejercicio sin momento del juego no cuenta para el reparto: meterlo
      // en un cajón «(sin clasificar)» ensucia las barras y no dice nada.
      if (e.momento) {
        if (!porMomento[e.momento]) porMomento[e.momento] = 0;
        porMomento[e.momento] += min || 0;
      }

      e.quienes.forEach(function (id) {
        if (!id) return;
        if (!porJugador[id]) {
          porJugador[id] = { id: id, minutos: 0, ejercicios: 0, momentos: {} };
        }
        var j = porJugador[id];
        j.minutos += min || 0;
        j.ejercicios++;
        if (e.momento) {
          if (!j.momentos[e.momento]) j.momentos[e.momento] = 0;
          j.momentos[e.momento] += min || 0;
        }
      });
    });

    // Sesiones: días con asistencia dentro del periodo.
    var sesiones = sesionesDelPeriodo(periodo, ahora);
    var cuantasSesiones = sesiones.length;
    var vino = {};
    sesiones.forEach(function (s) {
      s.presentes.forEach(function (id) { vino[id] = (vino[id] || 0) + 1; });
    });

    // La lista final es la plantilla en activo, más cualquiera que aparezca en
    // los datos y ya no esté en ella: uno que se fue en enero sigue habiendo
    // entrenado en septiembre y tiene que salir, con su nombre.
    var lista = [], puesto = {};
    jugadores().forEach(function (j) {
      var d = porJugador[j.id] || { minutos: 0, ejercicios: 0, momentos: {} };
      puesto[j.id] = true;
      lista.push({ id: j.id, nombre: j.nombre, dorsal: j.dorsal,
                   minutos: d.minutos, ejercicios: d.ejercicios, momentos: d.momentos,
                   sesiones: vino[j.id] || 0, deSesiones: cuantasSesiones });
    });
    // También los que solo salen en la asistencia: vino y no se apuntó nada de
    // lo que se hizo, pero vino, y eso es la mitad de esta pantalla.
    Object.keys(vino).forEach(function (id) {
      if (!porJugador[id]) porJugador[id] = { id: id, minutos: 0, ejercicios: 0, momentos: {} };
    });
    Object.keys(porJugador).forEach(function (id) {
      if (puesto[id]) return;
      var d = porJugador[id];
      var j = buscaJugador(id);
      lista.push({ id: id, nombre: j ? j.nombre : 'Sin nombre', dorsal: j ? j.dorsal : '',
                   minutos: d.minutos, ejercicios: d.ejercicios, momentos: d.momentos,
                   sesiones: vino[id] || 0, deSesiones: cuantasSesiones, fuera: true });
    });
    lista.sort(porMinutos);

    var momentos = Object.keys(porMomento).map(function (m) {
      return { nombre: m, minutos: porMomento[m] };
    }).sort(porMinutos);

    return {
      periodo: periodo,
      ejercicios: dentro.length,
      minutos: total,
      sinDuracion: sinDuracion,
      sesiones: cuantasSesiones,
      momentos: momentos,
      jugadores: lista,
      olvidados: olvidados(todas, ahora)
    };
  }

  function sesionesDelPeriodo(periodo, ahora) {
    var a = asistenciaEntera(), out = [];
    var t = ahora == null ? Date.now() : ahora;
    var hoy = hoyISO(new Date(t));
    var actual = temporadaActual();
    Object.keys(a).forEach(function (f) {
      var d = a[f];
      if (periodo === 'temporada') {
        if (d.temporada !== actual) return;
      } else {
        var dias = periodo === 'mes' ? 30 : 7;
        var pasados = diasEntre(f, hoy);
        if (pasados < 0 || pasados >= dias) return;
      }
      out.push({ fecha: f, temporada: d.temporada, presentes: d.presentes });
    });
    return out.sort(function (x, y) { return x.fecha < y.fecha ? 1 : -1; });
  }

  /* Los momentos del juego que llevan mucho sin tocarse.

     Se calcula sobre TODO el historial, no sobre el periodo que se esté
     mirando: la pregunta es «¿cuánto hace que no trabajo el balón parado?», y
     esa respuesta no cambia porque estés mirando la semana o el mes.

     Y solo para lo que se ha trabajado alguna vez. Avisar de que llevas 21 días
     sin entrenar algo que no has entrenado nunca no es un aviso, es ruido.

     Un ejercicio sin duración también cuenta como trabajado: lo hiciste, aunque
     no apuntaras cuánto duró. */
  function olvidados(todas, ahora) {
    var ultima = {};
    todas.forEach(function (e) {
      if (!e.momento || !e.at) return;
      if (!ultima[e.momento] || e.at > ultima[e.momento]) ultima[e.momento] = e.at;
    });
    var hoy = hoyISO(new Date(ahora == null ? Date.now() : ahora));
    return Object.keys(ultima).map(function (m) {
      return { nombre: m, dias: diasEntre(hoyISO(new Date(ultima[m])), hoy) };
    }).filter(function (x) {
      return x.dias >= DIAS_AVISO;
    }).sort(function (a, b) {
      if (b.dias !== a.dias) return b.dias - a.dias;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }

  /* ---- el equilibrio por fase de juego ----------------------------------

     Las barras de arriba ya dicen cuántos minutos lleva cada cosa. Lo que no
     dicen es la FORMA del reparto: si el equipo entrena las seis fases del
     juego de manera parecida o si va cojo de una.

     Por eso el radar coge solo las seis fases —lo que pasa dentro de un
     partido— y deja fuera el calentamiento, el físico, la técnica individual,
     los porteros y el partido condicionado, que son contenido de sesión y no
     fases del juego. Mezclarlos daría una figura que no responde a ninguna
     pregunta: ni «cómo reparto mis minutos» (para eso están las barras) ni
     «entreno equilibrado» (para eso está esto).

     Los ejes van en el orden en que ocurren las cosas en un partido: el ataque
     arriba, la defensa abajo, y las transiciones a los lados.

     La escala es en TANTO POR CIENTO de los minutos de fase, no en minutos.
     Así una semana corta y una temporada entera se pueden superponer: lo que
     se compara es la forma, no el tamaño. El hexágono perfecto —todo al
     16,7 %— es el reparto exactamente igualado. */

  var FASES = [
    { nombre: 'Ataque organizado',    corto: 'Ataque' },
    { nombre: 'Finalización',         corto: 'Finalización' },
    { nombre: 'Transición defensiva', corto: 'Trans. def.' },
    { nombre: 'Defensa organizada',   corto: 'Defensa' },
    { nombre: 'Transición ofensiva',  corto: 'Trans. of.' },
    { nombre: 'Balón parado',         corto: 'Balón parado' }
  ];

  function repartoDeFases(lista) {
    var min = {}, total = 0;
    FASES.forEach(function (f) { min[f.nombre] = 0; });
    lista.forEach(function (e) {
      if (min[e.momento] === undefined) return;     // no es una fase de juego
      var m = e.minutos || 0;
      min[e.momento] += m;
      total += m;
    });
    return { min: min, total: total };
  }

  function equilibrio(periodo, ahora) {
    var todas = loHecho();
    var ahoraR = repartoDeFases(delPeriodo(todas, periodo, ahora));
    var refR   = repartoDeFases(delPeriodo(todas, 'temporada', ahora));

    var ejes = FASES.map(function (f) {
      return {
        nombre: f.nombre,
        corto: f.corto,
        minutos: ahoraR.min[f.nombre],
        pct: ahoraR.total ? ahoraR.min[f.nombre] / ahoraR.total * 100 : 0,
        refPct: refR.total ? refR.min[f.nombre] / refR.total * 100 : 0,
        refMin: refR.min[f.nombre]
      };
    });

    return {
      ejes: ejes,
      total: ahoraR.total,
      totalRef: refR.total,
      // El reparto perfectamente igualado, para dibujar la referencia.
      igualado: 100 / FASES.length,
      // Cuántas fases no se han tocado en el periodo. Es el dato que de verdad
      // se lee en la figura: un pico solo significa algo si hay huecos.
      sinTocar: ejes.filter(function (e) { return e.minutos === 0; }).length
    };
  }

  /* =========================================================================
     EL GENERADOR DE SESIONES

     Le dices con cuántos estás, en cuánto campo y cuánto rato, y te propone una
     sesión. No inventa ejercicios: elige entre los que ya hay —los del catálogo
     y los tuyos— y los ordena.

     Dos maneras de decidir QUÉ trabajar:

       Por tus datos. Lo que menos has tocado esta temporada manda, y lo que
       lleva más de tres semanas sin salir manda todavía más. Sale del mismo
       radar que ya ves en Datos, así que la propuesta y el gráfico dicen lo
       mismo: no hay dos opiniones dentro de la aplicación.

       Por contexto. Un martes de carga y una víspera de partido no se parecen
       en nada, y eso no lo dice ninguna estadística: lo dice el calendario. Los
       contextos son plantillas de microciclo, con el orden que tiene una sesión
       de verdad —calentar, la parte principal, y acabar compitiendo—.

     Y cada ejercicio elegido dice POR QUÉ está ahí. Una propuesta que no se
     explica no se puede discutir, y entonces o te la crees entera o la tiras
     entera; ninguna de las dos cosas es lo que hace un entrenador.
     ====================================================================== */

  /* Cuánta gente de campo pide un ejercicio, leyendo lo que hay escrito.
     Igual que con las duraciones: de lo más seguro a lo más dudoso, y lo que no
     se entiende se dice que no se entiende en vez de inventarlo.

       «4 vs 2»                    6
       «6 vs 6 + 3 comodines»      15
       «6 atacantes y 5 defensores» 11
       «5 + portero»               5     (el portero va aparte)
       «Grupo entero»              null  (los que haya) */
  function jugadoresDe(texto) {
    var t = String(texto == null ? '' : texto).toLowerCase();
    if (!t.trim()) return null;
    if (/grupo entero|los que haya|toda la plantilla|todo el grupo/.test(t)) return null;

    var suma = null;
    var vs = /(\d+)\s*(?:vs|v\.?s\.?|contra|x)\s*(\d+)/.exec(t);
    if (vs) suma = Number(vs[1]) + Number(vs[2]);

    if (suma === null) {
      var bandos = /(\d+)\s*atacantes?\s*(?:y|contra|vs)\s*(\d+)\s*defensores?/.exec(t);
      if (bandos) suma = Number(bandos[1]) + Number(bandos[2]);
    }
    if (suma === null) {
      // «5 + portero», «1 portero + 1 lanzador»: el primer número que NO sea
      // el de los porteros.
      var solo = /(\d+)\s*(?:\+|jugadores?|de campo)/.exec(t.replace(/\d+\s*porteros?/g, ''));
      if (solo) suma = Number(solo[1]);
    }
    if (suma === null) return null;

    var comodines = /\+\s*(\d+)\s*comod/.exec(t);
    if (comodines) suma += Number(comodines[1]);
    return suma > 0 && suma <= 60 ? suma : null;
  }

  // Cuántos porteros pide. «Sin portero» es cero, y cero no es «da igual».
  function porterosDe(texto) {
    var t = String(texto == null ? '' : texto).toLowerCase().trim();
    if (!t) return null;
    if (/sin porter/.test(t)) return 0;
    var n = /(\d+)/.exec(t);
    return n ? Number(n[1]) : null;
  }

  /* El espacio, por tamaños que se contienen: lo que cabe en un área cabe en
     medio campo, y lo que cabe en medio campo cabe en el campo entero. Al revés
     no. «blank» es la pizarra sin campo: vale en cualquier sitio. */
  var ESPACIOS = [
    { id: 'area', nombre: 'Un área o un cuadrado', nivel: 1 },
    { id: 'half', nombre: 'Medio campo',           nivel: 2 },
    { id: 'full', nombre: 'El campo entero',       nivel: 3 }
  ];
  function nivelEspacio(id) {
    if (id === 'blank') return 0;
    for (var i = 0; i < ESPACIOS.length; i++) if (ESPACIOS[i].id === id) return ESPACIOS[i].nivel;
    return 3;
  }

  /* Los contextos. Son plantillas de microciclo: el orden de los momentos que
     tiene una sesión de ese día. No llevan minutos porque los minutos los pone
     el que entrena, que sabe de cuánto rato dispone. */
  /* «relleno» es de lo que se puede tirar si sobra tiempo, y NO es lo mismo que
     el plan. La víspera de un partido, si falta un cuarto de hora, se mete otro
     rondo o más remate: lo que no se hace jamás es meter un circuito físico. La
     primera versión de esto no lo distinguía y proponía justo eso. */
  var TODO_JUEGO = ['Ataque organizado', 'Defensa organizada', 'Transición ofensiva',
                    'Transición defensiva', 'Finalización', 'Balón parado',
                    'Partido condicionado'];

  var CONTEXTOS = [
    { id: 'datos', nombre: 'Lo que te hace falta',
      pie: 'Lo decide lo que llevas trabajado esta temporada',
      plan: null, relleno: TODO_JUEGO },
    { id: 'post', nombre: 'El día después del partido',
      pie: 'Poca carga: volver a tocar balón y corregir lo del domingo',
      plan: ['Calentamiento', 'Técnica individual', 'Ataque organizado', 'Partido condicionado'],
      relleno: ['Técnica individual', 'Ataque organizado', 'Partido condicionado'] },
    { id: 'carga', nombre: 'Mitad de semana, con carga',
      pie: 'El día largo de la semana: mucho juego y mucha intensidad',
      plan: ['Calentamiento', 'Físico-técnico', 'Ataque organizado', 'Defensa organizada',
             'Transición ofensiva', 'Partido condicionado'],
      relleno: TODO_JUEGO.concat(['Físico-técnico']) },
    { id: 'vispera', nombre: 'La víspera del partido',
      pie: 'Corto y vivo: activar, rematar y repasar el balón parado',
      plan: ['Calentamiento', 'Finalización', 'Balón parado'],
      // Nada de carga física el día antes de jugar.
      relleno: ['Finalización', 'Balón parado', 'Técnica individual'] },
    { id: 'pretemporada', nombre: 'Pretemporada',
      pie: 'Base física y técnica, con el balón siempre dentro',
      plan: ['Calentamiento', 'Físico-técnico', 'Técnica individual', 'Ataque organizado',
             'Partido condicionado'],
      relleno: ['Físico-técnico', 'Técnica individual', 'Ataque organizado',
                'Defensa organizada', 'Partido condicionado'] }
  ];
  function contextoPorId(id) {
    for (var i = 0; i < CONTEXTOS.length; i++) if (CONTEXTOS[i].id === id) return CONTEXTOS[i];
    return CONTEXTOS[0];
  }

  /* El plan cuando manda lo que dicen los datos.

     Primero lo olvidado —más de tres semanas sin tocarse— y después las fases
     con menos minutos en la temporada. Siempre se calienta al principio y, si
     da tiempo, se acaba compitiendo: eso no lo decide ninguna estadística, lo
     decide que una sesión es una sesión. */
  function planDeLosDatos(ahora) {
    var eq = equilibrio('temporada', ahora);
    var olvido = {};
    olvidados(loHecho(), ahora).forEach(function (o) { olvido[o.nombre] = o.dias; });

    var fases = eq.ejes.slice().sort(function (a, b) {
      var oa = olvido[a.nombre] || 0, ob = olvido[b.nombre] || 0;
      if (oa !== ob) return ob - oa;                 // lo más olvidado, primero
      if (a.minutos !== b.minutos) return a.minutos - b.minutos;   // lo menos trabajado
      return a.nombre.localeCompare(b.nombre, 'es');
    });

    var plan = ['Calentamiento'];
    var porques = {};
    fases.slice(0, 3).forEach(function (f) {
      plan.push(f.nombre);
      porques[f.nombre] = olvido[f.nombre]
        ? 'llevas ' + olvido[f.nombre] + ' días sin trabajarlo'
        : f.minutos === 0 ? 'no lo has trabajado esta temporada'
        : 'es de lo que menos llevas: ' + f.minutos + ' min en la temporada';
    });
    plan.push('Partido condicionado');
    return { plan: plan, porques: porques };
  }

  /* ¿Le vale este ejercicio a quien tengo delante? */
  function encaja(it, op) {
    var vista = it.view || 'full';
    /* La modalidad solo manda cuando el ejercicio usa el campo de verdad. Un
       rondo en un cuadrado de 19 × 18 no sabe de cuántos juegas, y dejar fuera
       todos los calentamientos de un equipo de fútbol 7 porque están dibujados
       sobre un campo de once es perder la mitad del catálogo por una etiqueta.
       Una salida en 1-3-2, en cambio, sí es de fútbol 7 y de nada más. */
    var deCualquiera = (vista === 'area' || vista === 'blank');
    if (op.pitch && it.pitch !== op.pitch && !deCualquiera) return null;
    if (nivelEspacio(vista) > nivelEspacio(op.espacio)) return null;
    var card = it.card || {};
    var pide = jugadoresDe(card.jugadores);
    if (pide !== null && op.jugadores && pide > op.jugadores) return null;
    var pidePorteros = porterosDe(card.porteros);
    if (pidePorteros && op.porteros !== null && pidePorteros > op.porteros) return null;
    return {
      id: it.id, nombre: it.nombre, ref: it.ref || null,
      titulo: String(card.titulo || it.nombre || 'Sin título'),
      momento: String(card.momento || '').trim(),
      duracion: String(card.duracion || ''),
      minutos: minutosDe(card.duracion),
      pide: pide, pidePorteros: pidePorteros
    };
  }

  /* Cuántos días hace que no se hace este ejercicio. Entre dos que valen igual
     gana el que lleva más tiempo sin salir: repetir el mismo rondo catorce
     martes seguidos es la manera más rápida de que dejen de mirarlo. */
  function ultimaVez(ahora) {
    var s = sesionesEnteras(), visto = {};
    var hoy = hoyISO(new Date(ahora == null ? Date.now() : ahora));
    Object.keys(s).forEach(function (f) {
      var dias = diasEntre(f, hoy);
      s[f].ejercicios.forEach(function (e) {
        var clave = (e.titulo || '').toLowerCase();
        if (visto[clave] === undefined || dias < visto[clave]) visto[clave] = dias;
      });
    });
    return visto;
  }

  /* op: { pitch, jugadores, porteros, espacio, minutos, contexto, ahora } */
  function generaSesion(candidatos, op) {
    op = op || {};
    var objetivo = op.minutos > 0 ? op.minutos : 75;
    var ctx = contextoPorId(op.contexto);
    var datos = ctx.plan ? null : planDeLosDatos(op.ahora);
    var plan = ctx.plan || datos.plan;
    var porques = datos ? datos.porques : {};
    var hace = ultimaVez(op.ahora);
    // Los títulos que ya se propusieron y el entrenador no quiso.
    var evita = {};
    (op.evita || []).forEach(function (t) { evita[String(t).toLowerCase()] = true; });

    var utiles = (candidatos || []).map(function (it) { return encaja(it, op); })
                                   .filter(Boolean);
    if (!utiles.length) {
      return { ejercicios: [], minutos: 0, contexto: ctx, avisos: [
        'Ninguno de los ejercicios que tienes encaja con eso. Prueba con más ' +
        'espacio, con más jugadores o con otra modalidad.'] };
    }

    /* Entre los de un mismo momento: primero el que lleva más sin hacerse, y
       después el que aprovecha a más gente de la que hay.
       «tope» es lo que queda de tiempo: rellenando un hueco no vale meter algo
       que se pase, que es lo que hacía antes —quitaba un ejercicio de 24 min por
       pasarse y metía otro de 20 que también se pasaba—. */
    function mejor(momento, usados, tope) {
      var toca = utiles.filter(function (c) {
        if (c.momento !== momento || usados[c.titulo.toLowerCase()]) return false;
        if (tope != null && (c.minutos || 0) > tope) return false;
        return true;
      });
      if (!toca.length) return null;
      toca.sort(function (a, b) {
        /* Lo que ya se propuso y no gustó, al final. No fuera: si es lo único
           que hay, se vuelve a ofrecer, que es más honrado que no proponer
           nada. Sin esto, «otra propuesta» devolvía la misma lista, porque el
           resto del criterio no tiene ningún azar. */
        var ea = evita[a.titulo.toLowerCase()] ? 1 : 0;
        var eb = evita[b.titulo.toLowerCase()] ? 1 : 0;
        if (ea !== eb) return ea - eb;
        var da = hace[a.titulo.toLowerCase()], db = hace[b.titulo.toLowerCase()];
        da = da === undefined ? 9999 : da;
        db = db === undefined ? 9999 : db;
        if (da !== db) return db - da;
        var pa = a.pide === null ? 0 : a.pide, pb = b.pide === null ? 0 : b.pide;
        if (pa !== pb) return pb - pa;
        return a.titulo.localeCompare(b.titulo, 'es');
      });
      return toca[0];
    }

    var fuera = [], dentro = [], usados = {}, total = 0;
    plan.forEach(function (momento) {
      var c = mejor(momento, usados);
      if (!c) { fuera.push(momento); return; }
      usados[c.titulo.toLowerCase()] = true;
      c.porque = porques[momento] ||
        (hace[c.titulo.toLowerCase()] === undefined ? 'no lo has hecho nunca'
         : 'la última vez fue hace ' + hace[c.titulo.toLowerCase()] + ' días');
      dentro.push(c);
      total += c.minutos || 0;
    });

    /* Ajuste al tiempo. Se quita por el final, que es lo prescindible, y nunca
       el calentamiento: entrar en frío no se negocia. Y se rellena con más de
       lo que el plan pedía antes que con cualquier cosa. */
    while (total > objetivo + 5 && dentro.length > 1) {
      var quita = dentro.pop();
      total -= quita.minutos || 0;
    }
    /* El relleno sale de lo que ESTE contexto admite, no de cualquier cosa que
       quepa. Sin esta lista, una víspera de partido a la que le faltaban quince
       minutos se los llenaba con un circuito físico. */
    var relleno = ctx.relleno || plan;
    var vueltas = 0;
    while (total < objetivo - 10 && vueltas++ < 8) {
      var hueco = null, queda = objetivo + 5 - total;
      for (var i = 0; i < relleno.length && !hueco; i++) hueco = mejor(relleno[i], usados, queda);
      if (!hueco || !hueco.minutos) break;
      usados[hueco.titulo.toLowerCase()] = true;
      hueco.porque = 'para llegar al tiempo que tienes';
      // Entra antes del último, que es con lo que se cierra la sesión.
      dentro.splice(Math.max(1, dentro.length - 1), 0, hueco);
      total += hueco.minutos;
    }

    var avisos = [];
    if (fuera.length) {
      avisos.push('No tienes ningún ejercicio de ' + fuera.join(', ').toLowerCase() +
                  ' que encaje, así que la sesión va sin eso.');
    }
    if (total < objetivo - 10) {
      avisos.push('Se queda en ' + total + ' de los ' + objetivo +
                  ' min que pediste: no hay más ejercicios que encajen.');
    }
    return { ejercicios: dentro, minutos: total, contexto: ctx, avisos: avisos };
  }

  /* ---- lo que se engancha a cada pizarra al guardarla --------------------

     Solo la temporada. Los nombres ya no se copian aquí: la pizarra guardada es
     un ejercicio de la biblioteca, y quién lo hizo es cosa de la sesión. Un
     nombre menos repetido es un nombre menos que se puede escapar el día que
     alguien exporte su biblioteca o la suba. */

  function metaDeHoy() {
    return { season: temporadaActual() };
  }

  window.PTEquipo = {
    POSICIONES: POSICIONES,
    TOPE_JUGADORES: TOPE_JUGADORES,
    TOPE_EJERCICIOS: TOPE_EJERCICIOS,
    DIAS_AVISO: DIAS_AVISO,

    temporadaDe: temporadaDe,
    temporadaSiguiente: temporadaSiguiente,
    temporadaValida: temporadaValida,
    temporadaActual: temporadaActual,
    temporadas: temporadas,
    cambiaTemporada: cambiaTemporada,

    jugadores: jugadores,
    jugadorPorId: jugadorPorId,
    buscaJugador: buscaJugador,
    añade: añade,
    quita: quita,

    hoyISO: hoyISO,
    presentesHoy: presentesHoy,
    marcaAsistencia: marcaAsistencia,
    ponAsistencia: ponAsistencia,
    ponAsistenciaEn: ponAsistenciaEn,
    presentesDe: presentesDe,
    asistenciaEntera: asistenciaEntera,
    sesionesDelPeriodo: sesionesDelPeriodo,

    sesionDe: sesionDe,
    guardaSesion: guardaSesion,
    añadeEjercicio: añadeEjercicio,
    apuntaHecho: apuntaHecho,
    quitaEjercicio: quitaEjercicio,
    mueveEjercicio: mueveEjercicio,
    diario: diario,
    porMeses: porMeses,

    minutosDe: minutosDe,
    jugadoresDe: jugadoresDe,
    porterosDe: porterosDe,
    ESPACIOS: ESPACIOS,
    CONTEXTOS: CONTEXTOS,
    generaSesion: generaSesion,

    estadisticas: estadisticas,
    FASES: FASES,
    equilibrio: equilibrio,
    metaDeHoy: metaDeHoy
  };
})();
