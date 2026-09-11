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
     'Algún dato de la ficha no le cuadra al servidor. Revisa la duración y el título.']
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

  // Al volver del enlace del correo, la sesión llega en el ancla de la
  // dirección. Se recoge, se guarda y se limpia la barra del navegador.
  function recogeVuelta() {
    var h = location.hash || '';
    if (h.indexOf('access_token=') < 0 && h.indexOf('error=') < 0) return null;
    var p = new URLSearchParams(h.replace(/^#/, ''));
    var limpio = location.pathname + location.search;
    try { history.replaceState(null, '', limpio); } catch (e) { location.hash = ''; }
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
      return pide('/rest/v1/entrenadores?select=id,nombre,club,admin&id=eq.' + u.id)
        .then(function (filas) {
          var p = (filas && filas[0]) || { id: u.id, nombre: '', club: '', admin: false };
          p.email = u.email;
          perfilCache = p;
          return p;
        });
    }).catch(function () { return null; });
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

  function registra(email, clave, nombre) {
    if (!HAY) return Promise.reject(new Error('La nube no está configurada'));
    return traer(BASE + '/auth/v1/signup', {
      method: 'POST', headers: cabeceras(false),
      body: JSON.stringify({
        email: String(email || '').trim(), password: String(clave || ''),
        data: { nombre: String(nombre || '').trim() }
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
  function entraOCrea(email, clave, nombre) {
    return entra(email, clave).then(function () { return { dentro: true, nueva: false }; },
      function (e) {
        if (!/credential|invalid login|not found/i.test(e.crudo || e.message)) throw e;
        return registra(email, clave, nombre).then(function () { return { dentro: true, nueva: true }; });
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
    var vuelve = location.origin + location.pathname;
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
    recupera: recupera, cambiaClave: cambiaClave,
    lista: lista, mios: mios,
    publica: publica, cambiaPublicado: cambiaPublicado,
    borra: borra, reporta: reporta, apertura: apertura
  };
})();
