/* =============================================================================
   Mi equipo · asistencia · estadísticas

   Tres cosas que van juntas:

     La PLANTILLA se escribe una vez por temporada. Dorsal, nombre y posición.
     La ASISTENCIA se marca una vez al día, al llegar al campo.
     Cada EJERCICIO que se guarda ese día se queda con quién estaba.

   Así los nombres se escriben una sola vez en la vida y después solo se marcan
   casillas. De ahí salen las dos preguntas que un entrenador se hace de verdad:
   quién le está faltando, y en qué se le van los minutos a cada uno.

   ---------------------------------------------------------------------------
   PRIVACIDAD · esto es lo importante de este archivo

   Son datos de menores: nombres y apellidos de críos. No salen del dispositivo.

   Este módulo no habla con la red. No importa nada de nube.js ni de enlace.js,
   y nadie le pide sus datos para subirlos. Lo que se sube a la biblioteca común
   es el DOCUMENTO de la pizarra (doc), y los jugadores no viven ahí: viven en
   'pt-squad', en 'pt-asistencia' y en la rama «meta» de cada pizarra guardada,
   que es hermana de «doc» y no viaja con él.

   Las fichas dibujadas en el campo siguen siendo anónimas: un dorsal y ya.
   Nadie escribe el nombre de un chaval encima del césped.

   Hay pruebas que fallan si esto se rompe (tests/equipo.test.html).
   ========================================================================== */
(function () {
  'use strict';

  var LLAVE_PLANTILLA  = 'pt-squad';
  var LLAVE_ASISTENCIA = 'pt-asistencia';
  var TOPE_JUGADORES   = 40;
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
    return {
      id: /^[a-z0-9]{4,16}$/.test(String(j.id || '')) ? j.id : nuevoId(),
      dorsal: dorsal, nombre: nombre, posicion: pos
    };
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
        }).slice(0, TOPE_JUGADORES);
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

  function jugadores(temp) {
    var p = plantillaEntera();
    return ordena(p.temporadas[temp || p.actual] || []);
  }

  function guardaPlantilla(temp, lista) {
    var p = plantillaEntera();
    var vistos = {};
    p.temporadas[temp] = lista.map(saneaJugador).filter(function (j) {
      if (!j || vistos[j.id]) return false;
      vistos[j.id] = true;
      return true;
    }).slice(0, TOPE_JUGADORES);
    return escribe(LLAVE_PLANTILLA, p);
  }

  function añade(temp, datos) {
    var lista = jugadores(temp);
    if (lista.length >= TOPE_JUGADORES) return { ok: false, porque: 'tope' };
    var j = saneaJugador({ dorsal: datos.dorsal, nombre: datos.nombre, posicion: datos.posicion });
    if (!j) return { ok: false, porque: 'sin-nombre' };
    // Dos jugadores con el mismo dorsal se confunden en la pizarra y en las
    // cuentas. Se avisa, pero decide el entrenador: en pretemporada pasa.
    var choca = j.dorsal && lista.some(function (o) { return o.dorsal === j.dorsal; });
    lista.push(j);
    if (!guardaPlantilla(temp, lista)) return { ok: false, porque: 'no-cabe' };
    return { ok: true, jugador: j, dorsalRepetido: !!choca };
  }

  function quita(temp, id) {
    var lista = jugadores(temp).filter(function (j) { return j.id !== id; });
    return guardaPlantilla(temp, lista);
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

  // El historial no crece para siempre: más de un año atrás no le sirve a nadie.
  function podaAsistencia(a) {
    var fs = Object.keys(a).sort();
    while (fs.length > TOPE_DIAS) delete a[fs.shift()];
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

     Todo sale de 'pt-boards', en local. Ni una llamada a la red.

     Cada pizarra guardada es:
       { at: 1757…, doc: {…}, meta: { season, participants: [{id,nombre,dorsal}] } }

     «meta» es lo que añade esta función al guardar. Las pizarras guardadas
     antes de que existiera esto no lo tienen, y no pasa nada: cuentan para los
     minutos por momento del juego y no cuentan para nadie en concreto. */

  function pizarrasGuardadas() {
    var todo = lee('pt-boards', {});
    var out = [];
    Object.keys(todo).forEach(function (nombre) {
      var e = todo[nombre];
      if (!e || typeof e !== 'object' || !e.doc) return;
      var card = e.doc.card || {};
      var meta = (e.meta && typeof e.meta === 'object') ? e.meta : {};
      out.push({
        nombre: nombre,
        at: typeof e.at === 'number' ? e.at : 0,
        fecha: hoyISO(new Date(typeof e.at === 'number' ? e.at : 0)),
        momento: String(card.momento || '').trim(),
        minutos: minutosDe(card.duracion),
        temporada: temporadaValida(meta.season) ? meta.season : null,
        participantes: Array.isArray(meta.participants) ? meta.participants : []
      });
    });
    return out;
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
    var todas = pizarrasGuardadas();
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

      e.participantes.forEach(function (p) {
        if (!p || !p.id) return;
        if (!porJugador[p.id]) {
          porJugador[p.id] = { id: p.id, nombre: p.nombre || '', dorsal: p.dorsal || '',
                               minutos: 0, ejercicios: 0, momentos: {} };
        }
        var j = porJugador[p.id];
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

    // La lista final es la plantilla de la temporada, más cualquiera que
    // aparezca en los datos y ya no esté en ella (uno que se fue en enero
    // sigue habiendo entrenado en septiembre y tiene que salir).
    var lista = [], puesto = {};
    jugadores().forEach(function (j) {
      var d = porJugador[j.id] || { minutos: 0, ejercicios: 0, momentos: {} };
      puesto[j.id] = true;
      lista.push({ id: j.id, nombre: j.nombre, dorsal: j.dorsal,
                   minutos: d.minutos, ejercicios: d.ejercicios, momentos: d.momentos,
                   sesiones: vino[j.id] || 0, deSesiones: cuantasSesiones });
    });
    Object.keys(porJugador).forEach(function (id) {
      if (puesto[id]) return;
      var d = porJugador[id];
      lista.push({ id: id, nombre: d.nombre, dorsal: d.dorsal, minutos: d.minutos,
                   ejercicios: d.ejercicios, momentos: d.momentos,
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
    var todas = pizarrasGuardadas();
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

  /* ---- lo que se engancha a cada pizarra al guardarla -------------------- */

  function metaDeHoy(ids) {
    var dentro = ids || presentesHoy();
    var porId = {};
    jugadores().forEach(function (j) { porId[j.id] = j; });
    return {
      season: temporadaActual(),
      participants: dentro.map(function (id) {
        var j = porId[id];
        return j ? { id: j.id, nombre: j.nombre, dorsal: j.dorsal } : null;
      }).filter(Boolean)
    };
  }

  window.PTEquipo = {
    POSICIONES: POSICIONES,
    TOPE_JUGADORES: TOPE_JUGADORES,
    DIAS_AVISO: DIAS_AVISO,

    temporadaDe: temporadaDe,
    temporadaSiguiente: temporadaSiguiente,
    temporadaValida: temporadaValida,
    temporadaActual: temporadaActual,
    temporadas: temporadas,
    cambiaTemporada: cambiaTemporada,

    jugadores: jugadores,
    añade: añade,
    quita: quita,

    hoyISO: hoyISO,
    presentesHoy: presentesHoy,
    marcaAsistencia: marcaAsistencia,
    ponAsistencia: ponAsistencia,
    asistenciaEntera: asistenciaEntera,
    sesionesDelPeriodo: sesionesDelPeriodo,

    minutosDe: minutosDe,
    estadisticas: estadisticas,
    FASES: FASES,
    equilibrio: equilibrio,
    metaDeHoy: metaDeHoy
  };
})();
