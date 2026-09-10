/* ===========================================================================
   Pizarra Táctica · la nube
   ---------------------------------------------------------------------------
   Habla con Supabase a pelo, con fetch. Sin librerías: la aplicación no tiene
   ninguna dependencia y esto no iba a ser la primera.

   Si no hay configuración (app/config.js sin rellenar) todo esto se queda
   dormido y la pizarra funciona igual que siempre, solo con su biblioteca de
   siempre y lo que guardes en el navegador. Nada se rompe por no tener cuenta.

   Se entra por correo, sin contraseña: Supabase manda un enlace, al volver
   trae la sesión en la dirección y aquí se recoge y se guarda.
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

  // Los errores de Supabase vienen en JSON; se traducen a algo legible.
  function fallo(r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      var m = d.message || d.error_description || d.error || d.msg || ('Error ' + r.status);
      var e = new Error(m); e.status = r.status; throw e;
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
    return fetch(BASE + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: cabeceras(false),
      body: JSON.stringify({ refresh_token: ses.refresh_token })
    }).then(function (r) {
      if (!r.ok) { guardaSes(null); avisa(); return fallo(r); }
      return r.json().then(guardaTokens);
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
      return fetch(BASE + ruta, {
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
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
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
      return { entrado: true };
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

  // La dirección de vuelta va en la QUERY, no en el cuerpo. Metida en el
  // cuerpo (que es como se le pasa a la librería de Supabase, no a su API)
  // el servidor la ignora sin decir nada y manda el enlace a la dirección
  // por defecto del proyecto, que casi nunca es la de la aplicación.
  function entra(email, volverA) {
    if (!HAY) return Promise.reject(new Error('La nube no está configurada'));
    var vuelta = volverA || location.href.split('#')[0];
    return fetch(BASE + '/auth/v1/otp?redirect_to=' + encodeURIComponent(vuelta), {
      method: 'POST', headers: cabeceras(false),
      body: JSON.stringify({
        email: String(email || '').trim(),
        create_user: true,
        gotrue_meta_security: {}
      })
    }).then(function (r) { return r.ok ? true : fallo(r); });
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
      var fila = {
        autor: p.id,
        titulo: (c.titulo || opciones.titulo || 'Ejercicio sin título').slice(0, 120),
        pitch: doc.pitch || 'f11',
        vista: doc.view || 'full',
        momento: (c.momento || '').slice(0, 40),
        categoria: (c.categoria || '').slice(0, 40),
        minutos: min ? Math.min(240, Number(min[1])) : null,
        objetivo: (c.objetivo || '').slice(0, 400),
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
    entra: entra, sale: sale, perfil: perfil,
    lista: lista, mios: mios,
    publica: publica, cambiaPublicado: cambiaPublicado,
    borra: borra, reporta: reporta, apertura: apertura
  };
})();
