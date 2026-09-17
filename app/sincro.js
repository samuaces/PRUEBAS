/* =============================================================================
   La sincronización · que tu cuenta sea la misma en todas partes

   Junta las tres piezas que ya existen y no hace nada por su cuenta:

     app/cofre.js   cifra y descifra, y no sabe qué hay dentro
     app/fusion.js  junta dos copias, y no sabe de dónde vienen
     app/nube.js    habla con el servidor, y no entiende lo que sube

   Aquí está el orden en que se llaman, que es lo único que faltaba.

   ---------------------------------------------------------------------------
   EL CICLO, ENTERO

     1. Bajar la fila del cofre.
     2. Descifrarla con la clave de esta cuenta. Sale lo que hay en el
        servidor, o un vacío si es la primera vez.
     3. Fusionarlo con lo de este dispositivo, registro a registro.
     4. Si el resultado no es lo que había aquí, se guarda y se repinta.
     5. Si el resultado no es lo que había allí, se cifra y se sube… pero solo
        si nadie ha escrito mientras tanto. Si alguien lo hizo, se vuelve al
        paso 1 con lo nuevo.

   El paso 5 es el que parece de más y no lo es. Sin él: el móvil y el
   ordenador se bajan la misma versión, los dos fusionan bien, los dos suben, y
   el segundo borra lo que había traído el primero. La fusión no puede
   arreglarlo porque ya no queda con qué fusionar.

   ---------------------------------------------------------------------------
   CUÁNDO SE LANZA

   Al entrar, al volver a la aplicación después de dejarla, al recuperar la
   conexión, y a los pocos segundos de cualquier cambio. Lo del cambio va con
   retraso a propósito: escribir el nombre de una sesión son veinte cambios, y
   no son veinte subidas.

   Si se cierra la pestaña dentro de esos segundos, el cambio se queda aquí
   hasta la próxima vez que se abra la aplicación, que sincroniza. No se pierde
   nada; puede tardar.

   ---------------------------------------------------------------------------
   LA LLAVE SE QUEDA EN ESTE DISPOSITIVO, Y HAY QUE DECIRLO

   Al entrar se guarda aquí la clave que abre el cofre. Eso tiene un precio y
   una razón.

   El precio: quien tenga este dispositivo desbloqueado y abra el navegador
   puede leer la clave. No es peor que la sesión, que ya está ahí al lado y
   abre la cuenta entera, pero es verdad y no se esconde.

   La razón: sin esto, olvidar la contraseña sería perder la temporada. Con
   cifrado de extremo a extremo no hay otra: el servidor no puede devolver
   unos datos que no puede leer. Guardándola, quien olvida la contraseña la
   cambia por correo, abre la aplicación en un dispositivo donde ya había
   entrado, y esta vuelve a envolver la clave con la nueva. Solo se pierde
   quien olvida la contraseña Y no tiene ningún dispositivo abierto.

   Eso hay que decirlo en pantalla con estas palabras, no en la letra pequeña.
   ========================================================================== */
(function () {
  'use strict';

  var LLAVE  = 'pt-llave';      // la clave de este dispositivo
  var ESTADO = 'pt-sincro';     // qué se sabe de la última vez
  var QUIERE = 'pt-sincro-si';  // si esta persona lo ha encendido

  var ESPERA_CAMBIO = 2500;     // lo que se deja pasar tras un cambio
  var REINTENTOS    = [30000, 120000, 600000];
  var VUELTAS_CHOQUE = 3;       // veces que se reintenta si alguien se adelantó

  var C = null, F = null, N = null, E = null;   // las piezas, al arrancar
  var clave = null;             // la clave maestra, en memoria
  var cuenta = null;            // de quién es
  var enMarcha = false, pendiente = false, fallos = 0;
  var reloj = null, relojReintento = null;
  var oyentes = [];
  var ultimo = { estado: 'apagado', cuando: 0, choques: [] };

  /* Las piezas se enganchan aquí y no en «arranca», porque el interruptor de
     Tu cuenta puede encender esto sin que se haya arrancado nunca —alguien que
     dijo que no la primera vez y cambia de idea— y entonces «alEntrar» se
     encontraba sin nube a la que llamar. */
  function hay() {
    if (!(window.PTCofre && window.PTCofre.hay() && window.PTFusion &&
          window.PTEquipo && window.PTNube && window.PTNube.hay())) return false;
    C = window.PTCofre; F = window.PTFusion; N = window.PTNube; E = window.PTEquipo;
    return true;
  }

  function avisa(estado, extra) {
    ultimo = {
      estado: estado,
      cuando: extra && extra.cuando !== undefined ? extra.cuando : ultimo.cuando,
      choques: extra && extra.choques ? extra.choques : ultimo.choques,
      datosNuevos: !!(extra && extra.datosNuevos)
    };
    oyentes.forEach(function (f) { try { f(ultimo); } catch (e) {} });
  }

  /* ---- encendido o apagado, y lo decide la persona -----------------------

     Esto viene apagado. Hasta ahora la aplicación decía, por escrito, que los
     nombres de la plantilla no salían del dispositivo; encenderlo en una
     actualización y sin preguntar cambiaría eso a espaldas de quien lo leyó.
     Van cifrados, sí, pero lo que cambia es dónde están.

     Así que se pregunta una vez, con las palabras claras, y quien dice que no
     sigue exactamente como estaba. */

  function quiere() {
    try {
      var v = localStorage.getItem(QUIERE);
      return v === 'si' || v === 'no' ? v : null;   // null = todavía no se ha preguntado
    } catch (e) { return null; }
  }

  /* Encender es distinto de entrar con esto ya encendido, y por eso se marca.

     Si falla al ENTRAR, la persona no estaba pidiendo nada: la sincronización
     reintenta sola y avisar de cada bache sería ruido. Si falla al ENCENDER,
     acaba de pedirlo expresamente y se ha quedado sin hacer: hay que decirle
     por qué. La marca es lo que deja distinguir los dos casos en un sitio. */
  function enciende(contraseña) {
    try { localStorage.setItem(QUIERE, 'si'); } catch (e) {}
    return alEntrar(contraseña).then(function (r) {
      r.encendiendo = true;
      return r;
    });
  }

  /* Apagarlo borra la fila del servidor. Quien apaga esto está diciendo «quita
     mis datos de ahí», no «deja de mirarlos»: dejar el bloque guardado por si
     vuelve sería no haberle hecho caso. Lo de este dispositivo no se toca. */
  function apaga() {
    try { localStorage.setItem(QUIERE, 'no'); } catch (e) {}
    var fin = (hay() && N.dentro()) ? N.borraCofre().catch(function () { return false; })
                                    : Promise.resolve(false);
    return fin.then(function (r) {
      olvidaLlave();
      avisa('apagado');
      return r;
    });
  }

  /* ---- la llave de este dispositivo ------------------------------------- */

  function leeGuardada() {
    try { return JSON.parse(localStorage.getItem(LLAVE) || 'null'); }
    catch (e) { return null; }
  }
  function guardaLlave(k, quien) {
    clave = k; cuenta = quien;
    return C.maestraATexto(k).then(function (txt) {
      try { localStorage.setItem(LLAVE, JSON.stringify({ cuenta: quien, mk: txt })); }
      catch (e) {}
      return k;
    });
  }
  function olvidaLlave() {
    clave = null; cuenta = null;
    try { localStorage.removeItem(LLAVE); localStorage.removeItem(ESTADO); } catch (e) {}
  }

  /* La clave guardada aquí, solo si es de esta cuenta. Lo de la cuenta importa:
     si alguien entra con otro correo en el mismo navegador, la clave que hay
     guardada no es la suya, y usarla envolvería el cofre de uno con la llave
     del otro. */
  function recupera(quien) {
    var g = leeGuardada();
    if (!g || !g.mk || g.cuenta !== quien) return Promise.resolve(null);
    return C.maestraDeTexto(g.mk).then(function (k) { return k; },
                                       function () { return null; });
  }

  /* ---- entrar ------------------------------------------------------------

     Se llama justo después de entrar o de registrarse, que es el único
     momento en el que la contraseña está a mano. De la contraseña sale la
     clave, y de ahí en adelante ya no hace falta. */
  function alEntrar(contraseña) {
    if (!hay()) return Promise.resolve({ ok: false, porque: 'apagado' });
    return N.quienSoy().then(function (p) {
      if (!p) return { ok: false, porque: 'sin-cuenta' };
      return N.cofre().then(function (fila) {
        if (!fila) return estrena(contraseña, p.id);
        return C.abreConContraseña(contraseña, fila.sal, fila.maestra)
          .then(function (k) {
            if (k) return guardaLlave(k, p.id).then(function () { return { ok: true }; });
            return reenvuelveConLaNueva(contraseña, fila, p.id);
          });
      });
    }).then(function (r) {
      if (r.ok) { avisa('listo'); sincroniza(); }
      else avisa(r.porque === 'cerrado' ? 'cerrado' : 'apagado');
      return r;
    }, function (e) {
      /* El motivo se devuelve, no se traga. Antes salía un «sin-red» pelado y
         quien encendía el interruptor veía que no pasaba nada y se quedaba sin
         saber por qué: la causa más probable —que el servidor todavía no tenga
         la tabla— no se parece en nada a estar sin cobertura. */
      avisa('sin-red');
      return { ok: false, porque: 'sin-red', error: (e && e.message) || '' };
    });
  }

  function estrena(contraseña, quien) {
    return C.estrena(contraseña).then(function (nuevo) {
      return N.estrenaCofre({ sal: nuevo.sal, maestra: nuevo.maestra, bloque: '' })
        .then(function () { return guardaLlave(nuevo.clave, quien); })
        .then(function () { return { ok: true, nuevo: true }; });
    });
  }

  /* La contraseña no abre el cofre. Eso pasa cuando se ha cambiado en otro
     sitio —o se ha recuperado por correo—, y es justo el caso que esto viene a
     salvar: si este dispositivo tiene la clave, se vuelve a envolver con la
     contraseña nueva y no se pierde nada. */
  function reenvuelveConLaNueva(contraseña, fila, quien) {
    return recupera(quien).then(function (k) {
      if (!k) return { ok: false, porque: 'cerrado' };
      /* Antes de tocar nada, comprobar que esta clave abre de verdad ESTE
         cofre. Un cofre recién estrenado no tiene bloque que abrir, y
         entonces vale con que la clave guardada sea de esta cuenta. */
      var comprueba = fila.bloque
        ? C.abre(k, fila.bloque).then(function (v) { return v !== null; })
        : Promise.resolve(true);
      return comprueba.then(function (vale) {
        if (!vale) return { ok: false, porque: 'cerrado' };
        return C.reenvuelve(k, contraseña).then(function (n) {
          return N.guardaCofre({ sal: n.sal, maestra: n.maestra }, fila.version)
            .then(function (guardada) {
              if (!guardada) return { ok: false, porque: 'a-la-vez' };
              return guardaLlave(k, quien).then(function () {
                return { ok: true, reenvuelto: true };
              });
            });
        });
      });
    });
  }

  /* Cambiar la contraseña desde dentro de la aplicación, con la sesión
     abierta. Hay que volver a envolver la clave o el cofre se queda cerrado
     con la contraseña vieja y el próximo dispositivo que entre no lo abre. */
  function alCambiarContraseña(nueva) {
    if (!clave) return Promise.resolve({ ok: false, porque: 'cerrado' });
    return N.cofre().then(function (fila) {
      if (!fila) return { ok: false, porque: 'sin-cofre' };
      return C.reenvuelve(clave, nueva).then(function (n) {
        return N.guardaCofre({ sal: n.sal, maestra: n.maestra }, fila.version)
          .then(function (g) { return g ? { ok: true } : { ok: false, porque: 'a-la-vez' }; });
      });
    });
  }

  /* ---- el ciclo ---------------------------------------------------------- */

  function sincroniza(vuelta) {
    if (!hay() || !clave || !N.dentro()) return Promise.resolve({ ok: false, porque: 'apagado' });
    if (enMarcha) { pendiente = true; return Promise.resolve({ ok: false, porque: 'ocupado' }); }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      avisa('sin-red');
      return Promise.resolve({ ok: false, porque: 'sin-red' });
    }
    enMarcha = true;
    avisa('sincronizando');

    return N.cofre().then(function (fila) {
      if (!fila) return { ok: false, porque: 'sin-cofre' };
      var abrir = fila.bloque ? C.abre(clave, fila.bloque) : Promise.resolve({});
      return abrir.then(function (remoto) {
        // null es «esta clave no abre esto». No es un error de red ni de
        // programa: es otra contraseña, y hay que decirlo, no reintentar.
        if (remoto === null) { cerrado(); return { ok: false, porque: 'cerrado' }; }

        var local = E.todo();
        var r = F.fusiona(local, remoto);
        var traido = !F.igual(r.datos, local);
        if (traido) E.traga(r.datos);

        if (F.igual(r.datos, remoto)) {
          return fin(r.choques, traido);
        }
        return C.cierra(clave, r.datos).then(function (bloque) {
          return N.guardaCofre({ bloque: bloque }, fila.version).then(function (g) {
            /* No ha escrito: alguien subió entre nuestra bajada y nuestra
               subida. Se vuelve a empezar con lo suyo ya dentro. No es un
               fallo y no se le cuenta a nadie. */
            if (!g) {
              if ((vuelta || 0) >= VUELTAS_CHOQUE) return { ok: false, porque: 'ocupado' };
              enMarcha = false;
              return sincroniza((vuelta || 0) + 1);
            }
            return fin(r.choques, traido);
          });
        });
      });
    }).then(function (r) {
      enMarcha = false;
      if (pendiente) { pendiente = false; setTimeout(sincroniza, 0); }
      return r;
    }, function (e) {
      enMarcha = false;
      /* Cualquier tropiezo de red se queda en «pendiente» y se reintenta solo,
         cada vez más tarde. Lo que no se hace es avisar a nadie: el aviso de
         «no he podido» en cada bache es ruido, y el trabajo no se ha perdido,
         está aquí. */
      fallos++;
      avisa('pendiente');
      programaReintento();
      return { ok: false, porque: 'sin-red', error: e && e.message };
    });
  }

  function fin(choques, traido) {
    fallos = 0;
    var t = Date.now();
    try { localStorage.setItem(ESTADO, JSON.stringify({ cuando: t })); } catch (e) {}
    avisa('listo', { cuando: t, choques: choques || [], datosNuevos: !!traido });
    return { ok: true, choques: choques || [], datosNuevos: !!traido };
  }

  function cerrado() {
    /* La clave de este dispositivo no abre el cofre del servidor. Pasa cuando
       alguien cambió la contraseña en otro sitio. NO se borra nada de aquí:
       lo de este dispositivo sigue entero y se seguirá guardando en local.
       Lo único que se pierde es el viaje, hasta que la persona vuelva a
       entrar con la contraseña buena. */
    clave = null;
    avisa('cerrado');
  }

  function programaReintento() {
    clearTimeout(relojReintento);
    var espera = REINTENTOS[Math.min(fallos - 1, REINTENTOS.length - 1)] || REINTENTOS[0];
    relojReintento = setTimeout(function () { sincroniza(); }, espera);
  }

  /* ---- los disparos ------------------------------------------------------ */

  function pronto() {
    clearTimeout(reloj);
    reloj = setTimeout(function () { sincroniza(); }, ESPERA_CAMBIO);
  }

  var arrancado = false;
  function arranca() {
    if (arrancado || !hay() || quiere() !== 'si') return false;
    arrancado = true;

    // Cualquier cambio del equipo, con unos segundos de respiro.
    E.alCambiar(function () { if (clave) pronto(); });

    // Salir de la cuenta se lleva la llave: en un ordenador compartido, lo
    // contrario sería dejarla puesta.
    N.alCambiar(function () { if (!N.dentro()) { olvidaLlave(); avisa('apagado'); } });

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('online', function () { fallos = 0; sincroniza(); });
      // Volver a la aplicación después de dejarla: es cuando más probable es
      // que el otro dispositivo haya cambiado algo.
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && clave) sincroniza();
      });
    }

    /* Y al abrir, si ya se había entrado antes: la sesión sigue guardada y la
       clave también, así que no hace falta la contraseña. */
    if (N.dentro()) {
      N.quienSoy().then(function (p) {
        if (!p) return;
        return recupera(p.id).then(function (k) {
          if (!k) { avisa('cerrado'); return; }
          clave = k; cuenta = p.id;
          sincroniza();
        });
      }).catch(function () {});
    }
    return true;
  }

  window.PTSincro = {
    hay: hay,
    quiere: quiere,
    enciende: enciende,
    apaga: apaga,
    arranca: arranca,
    alEntrar: alEntrar,
    alCambiarContraseña: alCambiarContraseña,
    sincroniza: function () { return sincroniza(); },
    ahora: function () { clearTimeout(reloj); return sincroniza(); },
    olvidaLlave: olvidaLlave,
    abierto: function () { return !!clave; },
    estado: function () { return ultimo; },
    alCambiar: function (f) { if (typeof f === 'function') oyentes.push(f); }
  };
})();
