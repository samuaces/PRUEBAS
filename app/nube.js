/* ===========================================================================
   Pizarra Táctica · la nube
   ---------------------------------------------------------------------------
   Habla con Supabase a pelo, con fetch. Sin librerías: la aplicación no tiene
   ninguna dependencia y esto no iba a ser la primera.

   Si no hay configuración (app/config.js sin rellenar) todo esto se queda
   dormido y la pizarra funciona igual que siempre, solo con su biblioteca de
   siempre y lo que guardes en el navegador. Nada se rompe por no tener cuenta.

   Se entra con correo y contraseña, al instante. Nada de enlaces por correo:
   el servicio gratuito de Supabase manda dos o tres al día y como puerta de
   entrada dejaba la aplicación inservible en cuanto se agotaban.
   =========================================================================== */
(function () {
  'use strict';

  var cfg  = window.PT_NUBE || {};
  var BASE = String(cfg.url || '').replace(/\/+$/, '');
  var KEY  = String(cfg.key || '');
  var HAY  = !!(BASE && KEY && BASE.indexOf('http') === 0);

  var LS = 'pt-nube';          // sesión guardada
  var ses = null;              // { access_token, refresh_token, caduca }
  var perfilCache = null;      // { id, nombre, club, admin }
  var oyentes = [];

  /* ---- utilidades ------------------------------------------------------ */

  function avisa() { oyentes.forEach(function (f) { try { f(); } catch (e) {} }); }

  function leeSes() {
    try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; }
  }
  function guardaSes(s) {
    ses = s;
    try {
      if (s) localStorage.setItem(LS, JSON.stringify(s));
      else localStorage.removeItem(LS);
    } catch (e) {}
    if (!s) perfilCache = null;
  }

  function cabeceras(conSesion) {
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    h.Authorization = 'Bearer ' + (conSesion && ses ? ses.access_token : KEY);
    return h;
  }

  /* Toda llamada lleva reloj. Sin él, un proyecto dormido o un móvil con dos
     rayas dejan la promesa colgando lo que el navegador quiera —minutos— y la
     biblioteca se queda en «Trayendo…» sin decir nunca nada. Con reloj, a los
     12 segundos se corta y se cuenta lo que pasa. */
  var ESPERA = 12000;
  function traer(url, opts) {
    opts = opts || {};
    if (typeof AbortController !== 'function') return fetch(url, opts);
    var ac = new AbortController();
    var reloj = setTimeout(function () { ac.abort(); }, opts.espera || ESPERA);
    opts.signal = ac.signal;
    return fetch(url, opts).then(
      function (r) { clearTimeout(reloj); return r; },
      function (e) {
        clearTimeout(reloj);
        if (e && e.name === 'AbortError') {
          throw new Error('El servidor tarda demasiado en contestar. Vuelve a intentarlo en un momento.');
        }
        throw e;
      }
    );
  }

  // Un cuerpo que no sea JSON (una página de error de un intermediario, por
  // ejemplo) no debe salir como un error de sintaxis incomprensible.
  function comoJSON(r) {
    return r.text().then(function (t) {
      if (!t) return null;
      try { return JSON.parse(t); }
      catch (e) { throw new Error('El servidor ha contestado algo que no se entiende.'); }
    });
  }

  // Los errores de Supabase vienen en inglés y en JSON. Aquí se traducen a algo
  // que se entienda y que diga qué hacer, no a un tecnicismo en otro idioma.
  var TRADUCE = [
    [/rate limit|too many requests/i,
     'Supabase solo deja mandar unos pocos correos por hora en el plan gratuito, y ya se han gastado. Se repone solo en un rato.'],
    [/redirect|not allowed|invalid.*url/i,
     'El proyecto no reconoce la dirección de esta pizarra, así que no sabe a dónde devolverte.'],
    [/expired|invalid.*token|otp_expired/i,
     'Ese enlace ya se ha usado o ha caducado. Pide otro y ábrelo en este mismo móvil.'],
    [/signups? not allowed|disabled/i,
     'El proyecto no admite cuentas nuevas ahora mismo.'],
    [/user already registered/i, 'Ese correo ya tiene cuenta. Escribe su contraseña para entrar.'],
    [/user not found|no user found/i, 'No hay ninguna cuenta con ese correo.'],
    [/new password should be different|same.*password/i,
     'La contraseña nueva tiene que ser distinta de la que tenías.'],
    [/invalid login credentials/i, 'Ese correo y esa contraseña no coinciden.'],
    [/password.*(6|short|least)/i, 'La contraseña tiene que tener al menos 6 caracteres.'],
    [/failed to fetch|networkerror|load failed/i,
     'No hay manera de llegar al servidor. Puede ser tu conexión.'],
    [/doc_razonable|too large|payload/i,
     'Este ejercicio pesa demasiado para subirlo. Prueba a quitarle fotogramas.'],
    [/violates check constraint|check constraint/i,
     'Algún dato de la ficha no le cuadra al servidor. Revisa la duración y el título.'],
    /* El proyecto de Supabase está montado con un esquema anterior al que
       trae esta versión. Pasa al estrenar la sincronización: la tabla de los
       cofres es nueva. Sin esta traducción salía «relation "public.cofres"
       does not exist», que no le dice nada a nadie y encima parece un fallo
       de la aplicación. */
    [/relation .* does not exist|42P01|Could not find the table/i,
     'El servidor todavía no tiene preparada esta parte. Hay que volver a ejecutar ' +
     'supabase/schema.sql en el proyecto: añade lo que falta sin tocar lo que ya hay.']
  ];
  function enCristiano(m) {
    for (var i = 0; i < TRADUCE.length; i++) if (TRADUCE[i][0].test(m)) return TRADUCE[i][1];
    return m;
  }
  function fallo(r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      var m = d.message || d.error_description || d.error || d.msg || ('Error ' + r.status);
      var e = new Error(enCristiano(String(m))); e.status = r.status; e.crudo = m; throw e;
    });
  }

  /* ---- sesión ---------------------------------------------------------- */

  function guardaTokens(d) {
    if (!d || !d.access_token) return null;
    perfilCache = null;          // por si es otra cuenta
    guardaSes({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      caduca: Date.now() + (Number(d.expires_in || 3600) - 60) * 1000
    });
    return ses;
  }

  function refresca() {
    if (!ses || !ses.refresh_token) return Promise.reject(new Error('Sin sesión'));
    return traer(BASE + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: cabeceras(false),
      body: JSON.stringify({ refresh_token: ses.refresh_token })
    }).then(function (r) {
      if (!r.ok) { guardaSes(null); avisa(); return fallo(r); }
      return comoJSON(r).then(guardaTokens);
    });
  }

  // Toda petición pasa por aquí: si el testigo ha caducado, se renueva y se
  // reintenta una vez. El usuario no se entera de nada.
  function pide(ruta, opts, reintento) {
    opts = opts || {};
    var necesitaSesion = opts.conSesion !== false && !!ses;
    var seguir = (necesitaSesion && ses.caduca && Date.now() > ses.caduca)
      ? refresca().catch(function () { return null; })
      : Promise.resolve();

    return seguir.then(function () {
      var h = cabeceras(necesitaSesion);
      if (opts.headers) Object.keys(opts.headers).forEach(function (k) { h[k] = opts.headers[k]; });
      return traer(BASE + ruta, {
        method: opts.method || 'GET', headers: h,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    }).then(function (r) {
      if (r.status === 401 && ses && !reintento) {
        return refresca().then(function () { return pide(ruta, opts, true); },
                              function () { avisa(); return fallo(r); });
      }
      if (!r.ok) return fallo(r);
      if (r.status === 204) return null;
      return comoJSON(r);
    });
  }

  /* ---- la vuelta del correo, atada a esta aplicación ---------------------

     La sesión vuelve del enlace del correo dentro del ancla de la dirección.
     El peligro es evidente en cuanto se dice en voz alta: si se acepta
     CUALQUIER ancla que traiga un «access_token», cualquiera puede mandarte

         https://klym.xyz/app/#access_token=<el suyo>&type=recovery

     y quedas dentro de SU cuenta sin enterarte —el ancla se borra de la barra
     al instante—. A partir de ahí, lo que compartas se publica a su nombre y
     él lo puede editar o borrar. Y con «type=recovery» la aplicación te lleva
     además a escribir una contraseña nueva… en la cuenta de otro.

     Se arregla atando la ida y la vuelta: antes de mandarte al correo, esta
     aplicación se guarda un valor al azar y lo mete en la dirección de
     regreso. Al volver, si el valor no está o no es el que se guardó, el ancla
     se tira entera. Es de un solo uso y caduca en una hora.

     Va en localStorage y no en sessionStorage a propósito: el enlace del correo
     se abre casi siempre en una pestaña nueva, y sessionStorage no cruza de
     pestaña. Así funciona en el mismo navegador, que es lo que ya pedía el
     mensaje de «ábrelo en este mismo móvil». */

  var LLAVE_VUELTA = 'pt-vuelta';
  var VUELTA_VIVA  = 3600000;          // una hora, como el enlace del correo

  function preparaVuelta() {
    var v;
    try { v = crypto.randomUUID(); }
    catch (e) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); }
    try { localStorage.setItem(LLAVE_VUELTA, JSON.stringify({ v: v, at: Date.now() })); }
    catch (e) {}
    return v;
  }

  function esNuestraVuelta() {
    var pedido = null;
    try { pedido = JSON.parse(localStorage.getItem(LLAVE_VUELTA) || 'null'); } catch (e) {}
    try { localStorage.removeItem(LLAVE_VUELTA); } catch (e) {}   // de un solo uso
    var trae = new URLSearchParams(location.search).get('v');
    if (!pedido || !pedido.v || !trae) return false;
    if (Date.now() - pedido.at > VUELTA_VIVA) return false;
    return pedido.v === trae;
  }

  // Al volver del enlace del correo, la sesión llega en el ancla de la
  // dirección. Se recoge, se guarda y se limpia la barra del navegador.
  function recogeVuelta() {
    var h = location.hash || '';
    if (h.indexOf('access_token=') < 0 && h.indexOf('error=') < 0) return null;
    var p = new URLSearchParams(h.replace(/^#/, ''));
    var nuestra = esNuestraVuelta();
    // La barra se limpia siempre, venga de donde venga: ni el testigo ni un
    // mensaje de error de nadie tienen por qué quedarse a la vista.
    var limpio = location.pathname +
      location.search.replace(/([?&])v=[^&]*(&|$)/, '$1').replace(/[?&]$/, '');
    try { history.replaceState(null, '', limpio); } catch (e) { location.hash = ''; }

    /* Una vuelta que esta aplicación no pidió se tira entera, sin decir nada.
       Ni el testigo —sería entrar en la cuenta de otro— ni el mensaje de error
       —sería dejar que un desconocido escriba en tu pantalla el texto que
       quiera, que es como empiezan las estafas—. */
    if (!nuestra) return null;

    if (p.get('access_token')) {
      guardaTokens({
        access_token: p.get('access_token'),
        refresh_token: p.get('refresh_token'),
        expires_in: p.get('expires_in')
      });
      // Si viene del enlace de «he olvidado la contraseña», la sesión ya está
      // abierta pero hace falta que escriba una nueva: si no, el enlace es la
      // única llave que tiene y caduca.
      return { entrado: true, recuperando: p.get('type') === 'recovery' };
    }
    var cod = p.get('error_code') || '';
    var desc = p.get('error_description') || p.get('error') || '';
    return { error: /expired|invalid/i.test(cod + ' ' + desc)
      ? 'Ese enlace ya se ha usado o ha caducado. Pide otro y ábrelo en este mismo móvil.'
      : (desc || 'No se ha podido entrar') };
  }

  /* ---- perfil ---------------------------------------------------------- */

  function quienSoy() {
    if (!ses) return Promise.resolve(null);
    if (perfilCache) return Promise.resolve(perfilCache);
    return pide('/auth/v1/user').then(function (u) {
      if (!u || !u.id) return null;
      return pide('/rest/v1/entrenadores?select=id,nombre,club,admin,acepto&id=eq.' + u.id)
        .then(function (filas) {
          var p = (filas && filas[0]) ||
                  { id: u.id, nombre: '', club: '', admin: false, acepto: '' };
          p.email = u.email;
          perfilCache = p;
          return p;
        });
    }).catch(function () { return null; });
  }

  /* ---- el cofre: los datos del equipo, cifrados ---------------------------

     Aquí no se cifra ni se descifra nada: eso es de app/cofre.js y de
     app/sincro.js. Esto solo son las tres llamadas al servidor, que es lo que
     sabe hacer este archivo.

     Lo que sube es un bloque que este archivo no entiende, y así tiene que
     seguir siendo: si algún día alguien mete aquí una clave para «facilitar»
     algo, la promesa de que el servidor no puede leer los nombres se acaba. */

  var COFRE = 'select=sal,maestra,bloque,version,actualizado';

  function cofre() {
    if (!ses) return Promise.resolve(null);
    return quienSoy().then(function (p) {
      if (!p) return null;
      return pide('/rest/v1/cofres?' + COFRE + '&id=eq.' + p.id)
        .then(function (filas) { return (filas && filas[0]) || null; });
    });
  }

  function estrenaCofre(campos) {
    return quienSoy().then(function (p) {
      if (!p) throw new Error('Entra con tu correo primero');
      return pide('/rest/v1/cofres?' + COFRE, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: { id: p.id, sal: campos.sal, maestra: campos.maestra,
                bloque: campos.bloque || '' }
      }).then(function (filas) { return (filas && filas[0]) || null; });
    });
  }

  /* Guardar, pero solo si nadie ha escrito desde que nos bajamos esto.

     El «version=eq.» no es una precaución de manual: sin él, el móvil y el
     ordenador se bajan la versión 5, los dos fusionan con lo suyo y los dos
     suben; el segundo pisa al primero y lo que el primero había añadido
     desaparece, con la fusión impecable. Con él, el segundo no escribe nada,
     se entera y vuelve a intentarlo con lo nuevo.

     Devuelve la fila nueva, o null si no ha escrito porque ya no era esa
     versión. Un null aquí NO es un error: es la respuesta correcta. */
  /* «¿Ha cambiado algo?», y nada más.

     Esto existe para poder preguntarlo cada pocos segundos sin traerse el
     cofre entero: una temporada cargada son 150 KB y bajarlos cada diez
     segundos para descubrir que no ha cambiado nada sería gastar la conexión
     de alguien por gusto. Aquí vuelve un número.

     Devuelve null si todavía no hay cofre o si no se puede preguntar; quien
     llama lo trata como «no sé», no como «no ha cambiado». */
  function versionCofre() {
    if (!ses) return Promise.resolve(null);
    return quienSoy().then(function (p) {
      if (!p) return null;
      return pide('/rest/v1/cofres?select=version&id=eq.' + p.id)
        .then(function (filas) {
          var v = filas && filas[0] && filas[0].version;
          return typeof v === 'number' ? v : null;
        });
    });
  }

  function guardaCofre(campos, version) {
    return quienSoy().then(function (p) {
      if (!p) throw new Error('Entra con tu correo primero');
      return pide('/rest/v1/cofres?' + COFRE + '&id=eq.' + p.id +
                  '&version=eq.' + Number(version), {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: campos
      }).then(function (filas) { return (filas && filas[0]) || null; });
    });
  }

  /* ---- ejercicios ------------------------------------------------------ */

  var COLS = 'id,titulo,pitch,vista,momento,categoria,minutos,objetivo,ficha,doc,' +
             'publicado,oculto,aperturas,creado,autor,entrenadores(nombre,club)';

  function condiciones(f) {
    var q = [];
    if (f.pitch)   q.push('pitch=eq.' + encodeURIComponent(f.pitch));
    if (f.momento) q.push('momento=eq.' + encodeURIComponent(f.momento));
    if (f.q)       q.push('busca=ilike.*' + encodeURIComponent(f.q.toLowerCase()) + '*');
    if (f.duracion === 'corta') q.push('minutos=lte.15');
    if (f.duracion === 'media') q.push('minutos=gte.16', 'minutos=lte.25');
    if (f.duracion === 'larga') q.push('minutos=gte.26');
    return q;
  }

  // La biblioteca compartida: lo que ha publicado cualquiera.
  function lista(f, desde, cuantos) {
    f = f || {}; desde = desde || 0; cuantos = cuantos || 60;
    var q = condiciones(f).concat([
      'select=' + COLS, 'publicado=eq.true', 'oculto=eq.false', 'order=creado.desc'
    ]);
    return pide('/rest/v1/ejercicios?' + q.join('&'), {
      conSesion: false,
      headers: { Range: desde + '-' + (desde + cuantos - 1), Prefer: 'count=exact' }
    });
  }

  // Los tuyos, publicados o no.
  function mios() {
    if (!ses) return Promise.resolve([]);
    return quienSoy().then(function (p) {
      if (!p) return [];
      return pide('/rest/v1/ejercicios?select=' + COLS + '&autor=eq.' + p.id + '&order=creado.desc');
    });
  }

  /* ---- acciones -------------------------------------------------------- */

  // Registro y entrada por contraseña. Sin enlaces por correo: el correo del
  // plan gratuito de Supabase deja mandar dos o tres al día y como puerta de
  // entrada era inservible. Aquí se entra al instante o se dice por qué no.
  function entra(email, clave) {
    if (!HAY) return Promise.reject(new Error('La nube no está configurada'));
    return traer(BASE + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: cabeceras(false),
      body: JSON.stringify({ email: String(email || '').trim(), password: String(clave || '') })
    }).then(function (r) {
      if (!r.ok) return fallo(r);
      return comoJSON(r).then(function (d) { guardaTokens(d); avisa(); return true; });
    });
  }

  /* La versión de las condiciones que hay publicadas ahora mismo. Cuando el
     texto de privacidad.html cambie, cambia esta etiqueta con él: lo que queda
     anotado en la cuenta es CUÁL se aceptó, porque «aceptó las condiciones»,
     sin decir cuáles, no es constancia de nada dentro de dos años. */
  var CONDICIONES = '2026-09-b';

  function registra(email, clave, nombre, acepto) {
    if (!HAY) return Promise.reject(new Error('La nube no está configurada'));
    /* El consentimiento va DENTRO del registro, no en una llamada de después:
       si fuera aparte, entre una cosa y la otra cabe una cuenta creada sin
       aceptar nada —se corta la red, se cierra la pestaña— y ese es justo el
       caso que no puede quedar a medias. La hora la pone el servidor. */
    return traer(BASE + '/auth/v1/signup', {
      method: 'POST', headers: cabeceras(false),
      body: JSON.stringify({
        email: String(email || '').trim(), password: String(clave || ''),
        // Solo el sí o el no. Qué versión se acepta lo decide el servidor
        // —«condiciones_vigentes()»—, porque si lo dijera el navegador
        // cualquiera podría anotarse una versión inventada y esquivar para
        // siempre la pregunta.
        data: { nombre: String(nombre || '').trim(),
                acepto: acepto ? 'si' : '' }
      })
    }).then(function (r) {
      if (!r.ok) return fallo(r);
      return comoJSON(r).then(function (d) {
        if (d && d.access_token) { guardaTokens(d); avisa(); return { dentro: true }; }
        // El proyecto exige confirmar el correo: hay que apagarlo en el panel.
        var e = new Error('Tu proyecto de Supabase exige confirmar el correo, y su ' +
                          'servicio de correo apenas manda unos pocos al día. Apaga ' +
                          '«Confirm email» en Authentication → Providers → Email.');
        e.confirmacion = true;
        throw e;
      });
    });
  }

  // Entra si la cuenta existe, y si no, la crea. Para quien la usa es un botón.
  function entraOCrea(email, clave, nombre, acepto) {
    return entra(email, clave).then(function () { return { dentro: true, nueva: false }; },
      function (e) {
        if (!/credential|invalid login|not found/i.test(e.crudo || e.message)) throw e;
        return registra(email, clave, nombre, acepto)
          .then(function () { return { dentro: true, nueva: true }; });
      });
  }

  /* Borrar la cuenta. Lo hace una función del servidor, porque desde aquí no se
     puede tocar la tabla de usuarios —y menos mal—. No lleva parámetros: la
     cuenta que borra la decide el testigo, así que nadie puede borrar la de
     otro ni equivocándose. */
  function borraCuenta() {
    if (!ses) return Promise.reject(new Error('Hay que haber entrado'));
    // El cuerpo va como objeto, no como texto: «pide» ya lo convierte, y
    // mandándole '{}' hecho una cadena llegaría el texto "{}" entrecomillado.
    return pide('/rest/v1/rpc/borra_mi_cuenta', { method: 'POST', body: {} })
      .then(function () {
        // Aquí no se llama a «sale()»: el testigo ya no vale para nada —el
        // usuario que representa no existe— y pedir el cierre de sesión al
        // servidor solo daría un 401 que habría que tragarse. Se borra y ya.
        guardaSes(null);
        avisa();
        return true;
      });
  }

  /* Recuperar la contraseña.
     Quitamos el correo de confirmación porque Supabase gratis manda muy pocos
     al día y eso ahogaba el registro de todo el mundo. Este es otro caso: lo
     pide poca gente y muy de vez en cuando, así que el límite no estorba, y sin
     él quien olvida su contraseña pierde su biblioteca de la nube para siempre.

     El «redirect_to» va en la dirección, NO en el cuerpo: metiéndolo en el
     cuerpo, GoTrue lo ignora sin decir nada y manda al sitio equivocado. Se
     vuelve a la pizarra, no a la portada, porque es donde está la cuenta. */
  function recupera(email) {
    if (!HAY) return Promise.reject(new Error('La nube no está configurada'));
    // El valor de un solo uso viaja en la dirección de regreso: es lo que hace
    // que al volver se sepa que este enlace lo pediste tú desde aquí.
    var vuelve = location.origin + location.pathname + '?v=' +
                 encodeURIComponent(preparaVuelta());
    return traer(BASE + '/auth/v1/recover?redirect_to=' + encodeURIComponent(vuelve), {
      method: 'POST', headers: cabeceras(false),
      body: JSON.stringify({ email: String(email || '').trim() })
    }).then(function (r) {
      if (!r.ok) return fallo(r);
      return true;
    });
  }

  // Cambiar la contraseña: al volver del enlace del correo, y también desde
  // Ajustes con la sesión abierta.
  function cambiaClave(nueva) {
    if (!ses) return Promise.reject(new Error('Entra con tu correo primero'));
    return pide('/auth/v1/user', { method: 'PUT', body: { password: String(nueva || '') } })
      .then(function () { return true; });
  }

  /* Volver a aceptar unas condiciones nuevas. No se manda QUÉ se acepta: la
     versión la pone el servidor, igual que en el registro y por lo mismo. */
  function acepta() {
    if (!ses) return Promise.reject(new Error('Hay que haber entrado'));
    return pide('/rest/v1/rpc/acepto_las_condiciones', { method: 'POST', body: {} })
      .then(function (v) { perfilCache = null; return v; });
  }

  function sale() {
    var fin = ses
      ? pide('/auth/v1/logout', { method: 'POST' }).catch(function () {})
      : Promise.resolve();
    return fin.then(function () { guardaSes(null); avisa(); });
  }

  function perfil(datos) {
    return quienSoy().then(function (p) {
      if (!p) throw new Error('Entra con tu correo primero');
      return pide('/rest/v1/entrenadores?id=eq.' + p.id, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: { nombre: datos.nombre, club: datos.club || '' }
      }).then(function (filas) {
        if (filas && filas[0]) { perfilCache = null; }
        avisa();
        return filas && filas[0];
      });
    });
  }

  // Sube un ejercicio. doc es la pizarra entera; el resto se saca de la ficha
  // para poder filtrar sin descargarlo todo.
  function publica(doc, opciones) {
    opciones = opciones || {};
    return quienSoy().then(function (p) {
      if (!p) throw new Error('Entra con tu correo primero');
      var c = doc.card || {};
      var min = /(\d+)/.exec(c.duracion || '');
      // La base de datos solo admite de 1 a 240 minutos: un «0 min» escrito por
      // despiste hacía fallar la subida entera con un error indescifrable.
      var minutos = min ? Math.max(1, Math.min(240, Number(min[1]))) : null;
      if (min && Number(min[1]) === 0) minutos = null;
      var titulo = String(c.titulo || opciones.titulo || '').trim().slice(0, 120);
      var fila = {
        autor: p.id,
        titulo: titulo || 'Ejercicio sin título',
        pitch: doc.pitch || 'f11',
        vista: doc.view || 'full',
        momento: String(c.momento || '').trim().slice(0, 40),
        categoria: String(c.categoria || '').trim().slice(0, 40),
        minutos: minutos,
        objetivo: String(c.objetivo || '').trim().slice(0, 400),
        ficha: c,
        doc: doc,
        publicado: opciones.publicado !== false
      };
      if (opciones.id) {
        return pide('/rest/v1/ejercicios?id=eq.' + opciones.id, {
          method: 'PATCH', headers: { Prefer: 'return=representation' }, body: fila
        }).then(function (f) { return f && f[0]; });
      }
      return pide('/rest/v1/ejercicios', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: fila
      }).then(function (f) { return f && f[0]; });
    });
  }

  function cambiaPublicado(id, si) {
    return pide('/rest/v1/ejercicios?id=eq.' + id, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: { publicado: !!si }
    }).then(function (f) { return f && f[0]; });
  }

  function borra(id) {
    return pide('/rest/v1/ejercicios?id=eq.' + id, { method: 'DELETE' });
  }

  function reporta(id, motivo) {
    return quienSoy().then(function (p) {
      if (!p) throw new Error('Entra con tu correo primero');
      return pide('/rest/v1/reportes', {
        method: 'POST', body: { ejercicio: id, quien: p.id, motivo: (motivo || '').slice(0, 300) }
      });
    });
  }

  function apertura(id) {
    return pide('/rest/v1/rpc/suma_apertura', {
      method: 'POST', conSesion: !!ses, body: { ej: id }
    }).catch(function () {});
  }

  /* ---- arranque -------------------------------------------------------- */

  var vuelta = null;
  if (HAY) {
    ses = leeSes();
    try { vuelta = recogeVuelta(); } catch (e) { vuelta = null; }
  }

  window.PTNube = {
    hay: function () { return HAY; },
    dentro: function () { return HAY && !!ses; },
    vuelta: function () { var v = vuelta; vuelta = null; return v; },
    quienSoy: quienSoy,
    alCambiar: function (f) { oyentes.push(f); },
    entra: entra, registra: registra, entraOCrea: entraOCrea, sale: sale, perfil: perfil,
    borraCuenta: borraCuenta, condiciones: CONDICIONES,
    recupera: recupera, cambiaClave: cambiaClave,
    lista: lista, mios: mios,
    publica: publica, cambiaPublicado: cambiaPublicado,
    borra: borra, reporta: reporta, apertura: apertura,
    cofre: cofre, versionCofre: versionCofre,
    estrenaCofre: estrenaCofre, guardaCofre: guardaCofre,
    acepta: acepta
  };
})();
