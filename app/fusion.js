/* =============================================================================
   La fusión · juntar lo de un dispositivo con lo de otro

   Esto es lo que hace que una cuenta sea la misma en el móvil y en el
   ordenador. Y el problema de verdad no es mandar los datos: es qué pasa
   cuando los dos lados han cambiado.

   ---------------------------------------------------------------------------
   POR QUÉ NO VALE «GANA EL ÚLTIMO QUE GUARDE»

   Lo fácil sería subir el almacén entero y que el último pisara al otro. El
   martes apuntas tres jugadores en el ordenador; el miércoles, sin haber
   abierto el ordenador, pasas lista en el campo con el móvil. El móvil sube su
   copia —que no tiene los tres jugadores— y se los lleva por delante.

   Nadie ha hecho nada raro y ha desaparecido trabajo. Así que no se fusionan
   almacenes: se fusionan REGISTROS. Cada jugador, cada día, cada partido va
   por su cuenta, con la marca de cuándo se tocó, y gana el más reciente de
   cada uno. El del martes y la del miércoles conviven porque no son lo mismo.

   ---------------------------------------------------------------------------
   LO QUE NO SE PUEDE ARREGLAR, Y CÓMO SE DICE

   Si el MISMO día se edita en los dos sitios sin que se hayan visto —los dos
   sin red, por ejemplo—, hay que elegir, y elegir es perder algo. Aquí gana el
   más reciente y se ANOTA el choque, para que la aplicación pueda decirlo:
   «el jueves cambió en dos sitios y se quedó lo del móvil». Callarse eso es
   peor que perderlo, porque nadie sabe qué mirar.

   ---------------------------------------------------------------------------
   LOS BORRADOS, QUE SON LO QUE SE OLVIDA

   Juntar dos listas resucita lo borrado: borras un jugador en el móvil, el
   ordenador todavía lo tiene, se juntan y vuelve. Por eso borrar deja una
   nota —qué y cuándo— y la nota gana a cualquier copia anterior. Las notas se
   tiran a los seis meses: para entonces ya no queda ningún dispositivo con
   la copia vieja, y si quedara, tendría cosas peores de las que preocuparse.

   ---------------------------------------------------------------------------
   DOS PROPIEDADES QUE HAY QUE CUMPLIR SÍ O SÍ

     Da igual el orden. Fusionar A con B tiene que dar lo mismo que fusionar B
     con A. Si no, dos dispositivos que se sincronizan a la vez se quedan cada
     uno con una cosa distinta y no vuelven a juntarse nunca.

     Fusionar dos veces no cambia nada. Si fusionar lo mismo otra vez moviera
     algo, cada sincronización generaría un cambio, que generaría otra
     sincronización, y eso no para.

   Las dos están comprobadas en tests/fusion.mjs, con datos al azar.

   ---------------------------------------------------------------------------
   EL RELOJ

   «Cuándo se tocó» sale del reloj del dispositivo, que puede ir mal. Un móvil
   con el reloj tres días adelantado gana siempre. No hay forma de arreglarlo
   del todo sin preguntarle la hora al servidor en cada cambio, y no la vale:
   el caso normal es que los dos relojes estén bien. Lo que sí se hace es que
   un empate no se resuelva al azar —se resuelve mirando el contenido, igual en
   los dos lados—, que es lo que garantiza lo de «da igual el orden».

   Un registro SIN marca es «de antes de que esto existiera» y vale cero:
   cualquier cambio de verdad le gana. Eso quita la necesidad de migrar nada.
   ========================================================================== */
(function () {
  'use strict';

  var DIAS_NOTA = 180;                 // lo que se guarda una nota de borrado
  var TOPE_NOTAS = 600;
  var DIA = 86400000;

  /* ---- comparar dos cosas siempre igual --------------------------------

     Para deshacer un empate hay que comparar contenidos, y hay que hacerlo
     igual en los dos dispositivos. JSON.stringify no vale tal cual: respeta
     el orden en que se escribieron las claves, y ese orden puede ser distinto
     en cada lado aunque los datos sean idénticos. Así que se ordenan. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) {
        return JSON.stringify(k) + ':' + canon(v[k]);
      }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  function cuando(r) {
    var t = r && r.tocado;
    return typeof t === 'number' && isFinite(t) && t > 0 ? t : 0;
  }

  /* El contenido SIN la marca de tiempo, que es lo que hay que comparar para
     saber si dos copias dicen lo mismo.

     Esto no es un detalle. Guardar un día sin cambiar nada —abres la sesión,
     la cierras— vuelve a poner la marca. Si la marca contara como contenido,
     esas dos copias parecerían distintas y la aplicación avisaría de un
     choque donde no se ha perdido absolutamente nada. Un aviso que salta sin
     motivo se aprende a ignorar, y entonces no avisa del que importa. */
  function sinMarca(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return canon(r);
    var copia = {};
    Object.keys(r).forEach(function (k) { if (k !== 'tocado') copia[k] = r[k]; });
    return canon(copia);
  }

  /* Cuál de los dos se queda, y si al elegir se ha perdido algo.

     Choque = los dos lados dicen cosas DISTINTAS y los dos se tocaron de
     verdad. Si el perdedor venía sin marca, es de antes de que esto
     existiera y el ganador ya lo sustituyó: avisar de eso sería ruido en
     cada primera fusión. */
  function elige(a, b) {
    if (a === undefined) return { r: b, choque: false };
    if (b === undefined) return { r: a, choque: false };
    var ta = cuando(a), tb = cuando(b);
    var ca = sinMarca(a), cb = sinMarca(b);
    // Lo mismo por los dos lados: se queda la marca más nueva y no hay choque.
    if (ca === cb) return { r: ta >= tb ? a : b, choque: false };
    if (ta !== tb) return { r: ta > tb ? a : b, choque: ta > 0 && tb > 0 };
    // Empate de reloj y contenidos distintos: manda el contenido, para que los
    // dos dispositivos elijan lo mismo. Y eso siempre es un choque.
    return { r: ca < cb ? a : b, choque: true };
  }

  /* ---- juntar dos mapas de registros ------------------------------------ */

  function mezclaMapa(a, b, qué, choques) {
    var out = {}, llaves = {};
    Object.keys(a || {}).forEach(function (k) { llaves[k] = true; });
    Object.keys(b || {}).forEach(function (k) { llaves[k] = true; });
    Object.keys(llaves).sort().forEach(function (k) {
      var r = elige(a ? a[k] : undefined, b ? b[k] : undefined);
      out[k] = r.r;
      if (r.choque) choques.push({ qué: qué, clave: k });
    });
    return out;
  }

  function porId(lista) {
    var m = {};
    (Array.isArray(lista) ? lista : []).forEach(function (x) {
      if (x && typeof x === 'object' && x.id) m[x.id] = x;
    });
    return m;
  }
  function aLista(mapa) {
    return Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
  }

  /* ---- las notas de los borrados ---------------------------------------- */

  /* Las notas son { 'sesion:2026-09-14': cuándo }. Se juntan quedándose con
     la más reciente de cada una: si un lado borró y el otro volvió a borrar,
     la fecha buena es la última. */
  function mezclaNotas(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        var t = Number(m[k]) || 0;
        if (t > (out[k] || 0)) out[k] = t;
      });
    });
    return out;
  }

  function podaNotas(notas, ahora) {
    var t = ahora == null ? Date.now() : ahora;
    var vivas = {};
    Object.keys(notas).forEach(function (k) {
      if (t - notas[k] < DIAS_NOTA * DIA) vivas[k] = notas[k];
    });
    /* Y si aun así son demasiadas, se van las más viejas. Un tope que no
       existe es un almacén que un día no admite nada más. */
    var ks = Object.keys(vivas);
    if (ks.length > TOPE_NOTAS) {
      ks.sort(function (x, y) { return vivas[y] - vivas[x]; })
        .slice(TOPE_NOTAS).forEach(function (k) { delete vivas[k]; });
    }
    return vivas;
  }

  /* Quitar lo borrado. Un registro sobrevive a su nota si se volvió a tocar
     DESPUÉS de borrarlo: eso es «lo borré y luego lo volví a crear», y lo que
     vale es lo último que hizo la persona. */
  function aplicaNotas(mapa, notas, prefijo) {
    var out = {};
    Object.keys(mapa).forEach(function (k) {
      var nota = notas[prefijo + k];
      if (nota && cuando(mapa[k]) <= nota) return;
      out[k] = mapa[k];
    });
    return out;
  }

  /* ---- la plantilla, que tiene una capa más ------------------------------

     { actual, actualTocado, temporadas: { '2026/27': [jugador…] } }

     La temporada en curso es un dato suelto, no un registro, así que lleva su
     propia marca. En empate gana la más adelantada: las temporadas solo van
     hacia delante, y así los dos lados eligen lo mismo. */
  function mezclaPlantilla(a, b, notas, choques) {
    a = a || {}; b = b || {};
    var ta = Number(a.actualTocado) || 0, tb = Number(b.actualTocado) || 0;
    var actual;
    if (a.actual && !b.actual) actual = a.actual;
    else if (b.actual && !a.actual) actual = b.actual;
    else if (ta !== tb) actual = ta > tb ? a.actual : b.actual;
    else actual = (a.actual || '') > (b.actual || '') ? a.actual : b.actual;

    var temps = {};
    Object.keys(a.temporadas || {}).forEach(function (t) { temps[t] = true; });
    Object.keys(b.temporadas || {}).forEach(function (t) { temps[t] = true; });

    var out = { actual: actual || '', actualTocado: Math.max(ta, tb), temporadas: {} };
    Object.keys(temps).sort().forEach(function (t) {
      var m = mezclaMapa(porId((a.temporadas || {})[t]), porId((b.temporadas || {})[t]),
                         'jugador', choques);
      out.temporadas[t] = aLista(aplicaNotas(m, notas, 'jugador:' + t + ':'));
    });
    return out;
  }

  /* ---- la fusión entera --------------------------------------------------

     Entran dos almacenes con la misma forma y sale uno. No toca nada de
     fuera: ni almacén local, ni red, ni pantalla. Por eso se puede probar
     entero sin navegador, y por eso las pruebas pueden lanzarle mil casos al
     azar buscando que se descoloque. */
  function fusiona(local, remoto, ahora) {
    local = local || {}; remoto = remoto || {};
    var choques = [];
    var notas = podaNotas(mezclaNotas(local.borrados, remoto.borrados), ahora);

    var asistencia = aplicaNotas(
      mezclaMapa(local.asistencia, remoto.asistencia, 'asistencia', choques),
      notas, 'asistencia:');
    var sesiones = aplicaNotas(
      mezclaMapa(local.sesiones, remoto.sesiones, 'sesion', choques),
      notas, 'sesion:');
    var partidos = aplicaNotas(
      mezclaMapa(porId(local.partidos), porId(remoto.partidos), 'partido', choques),
      notas, 'partido:');

    return {
      datos: {
        squad: mezclaPlantilla(local.squad, remoto.squad, notas, choques),
        asistencia: asistencia,
        sesiones: sesiones,
        partidos: aLista(partidos),
        borrados: notas
      },
      /* Ordenados para que dos dispositivos que fusionen lo mismo cuenten lo
         mismo, y sin repetidos. */
      choques: choques.sort(function (x, y) {
        return (x.qué + x.clave).localeCompare(y.qué + y.clave);
      })
    };
  }

  /* Si la fusión no ha cambiado nada de lo que había aquí, no hay por qué
     escribir ni volver a subir. Sin esto, cada sincronización dispararía la
     siguiente. */
  function igual(a, b) { return canon(a) === canon(b); }

  var casa = typeof window !== 'undefined' ? window : globalThis;
  casa.PTFusion = {
    fusiona: fusiona,
    igual: igual,
    canon: canon,
    DIAS_NOTA: DIAS_NOTA,
    TOPE_NOTAS: TOPE_NOTAS
  };
})();
