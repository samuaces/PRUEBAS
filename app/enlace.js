/* ===========================================================================
   Pizarra Táctica · compartir una jugada por enlace
   ---------------------------------------------------------------------------
   La jugada viaja DENTRO del enlace, detrás del #. Así no hace falta cuenta ni
   servidor, el enlace no caduca nunca, no hay nada que moderar ni que limpiar,
   y la jugada no sale de los dos dispositivos: lo que va detrás del # ni
   siquiera se manda al servidor cuando se abre la dirección.

   El problema de meterlo en la dirección es el tamaño, así que se aprieta en
   cuatro pasos, ninguno de los cuales necesita saber qué tipos de pieza
   existen (si mañana añadimos una, esto sigue funcionando):

     1. Las coordenadas se redondean a 10 cm. Sobra de largo para un campo y
        quita los decimales infinitos que deja la aritmética del ratón.
     2. Se tira lo que no dice nada: campos vacíos de la ficha, giros de cero.
     3. Los identificadores se renumeran cortos. NO se pueden quitar: el motor
        empareja las piezas entre fotogramas por su id para interpolar el
        movimiento, y sin ellos la jugada deja de animarse y las fichas
        aparecen y desaparecen.
     4. Del segundo fotograma en adelante solo va lo que ha CAMBIADO respecto
        al anterior. En una jugada de verdad se mueven tres o cuatro piezas por
        fotograma y los conos se quedan donde están, así que esto es lo que más
        ahorra: una animación de 24 fotogramas con su ficha entera cabe en unos
        2.000 caracteres, que entran en cualquier sitio.

   Y encima se comprime con CompressionStream, que lo trae el propio navegador:
   ni una dependencia, como todo lo demás. Si el navegador es viejo y no lo
   tiene, el enlace se hace igual pero sale unas tres veces más largo.
   =========================================================================== */
(function () {
  'use strict';

  var VERSION = 1;          // por si algún día cambia el formato del enlace
  var CLAVE = 'j';          // #j=…
  var COMODO = 2000;        // a partir de aquí algunas aplicaciones lo cortan

  var HAY_ZIP = typeof CompressionStream === 'function' &&
                typeof DecompressionStream === 'function';

  /* ---- de bytes a texto de dirección y al revés ------------------------- */

  function aBase64(bytes) {
    var trozos = [], paso = 0x8000;     // de golpe se desborda la pila
    for (var i = 0; i < bytes.length; i += paso) {
      trozos.push(String.fromCharCode.apply(null, bytes.subarray(i, i + paso)));
    }
    return btoa(trozos.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function deBase64(txt) {
    var s = String(txt).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function comprime(texto) {
    var bytes = new TextEncoder().encode(texto);
    if (!HAY_ZIP) return Promise.resolve({ zip: false, bytes: bytes });
    var cs = new CompressionStream('deflate-raw');
    var w = cs.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(cs.readable).arrayBuffer()
      .then(function (b) { return { zip: true, bytes: new Uint8Array(b) }; })
      .catch(function () { return { zip: false, bytes: bytes }; });
  }

  function descomprime(bytes, zip) {
    if (!zip) return Promise.resolve(new TextDecoder().decode(bytes));
    if (!HAY_ZIP) return Promise.reject(new Error('Este navegador no sabe abrir este enlace'));
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer()
      .then(function (b) { return new TextDecoder().decode(new Uint8Array(b)); });
  }

  /* ---- apretar y desapretar la jugada ----------------------------------- */

  var r1 = function (v) { return Math.round(Number(v) * 10) / 10; };

  // Copia quitando lo que no aporta. Lo que no conocemos se copia tal cual, así
  // que una propiedad nueva del futuro no se pierde por el camino.
  function sinPaja(o) {
    var s = {}, p;
    for (p in o) {
      if (!Object.prototype.hasOwnProperty.call(o, p)) continue;
      if (o[p] === '' || o[p] === null || o[p] === undefined) continue;
      if (p === 'rot' && !o[p]) continue;
      s[p] = o[p];
    }
    return s;
  }

  function aprieta(doc) {
    var mapa = {}, n = 0;
    function corto(id) {
      if (!mapa[id]) mapa[id] = (n++).toString(36);
      return mapa[id];
    }
    function pieza(o) {
      var s = sinPaja(o);
      s.id = corto(o.id); s.x = r1(o.x); s.y = r1(o.y);
      if (o.w != null) s.w = r1(o.w);
      if (o.h != null) s.h = r1(o.h);
      return s;
    }
    function trazo(t) {
      var s = sinPaja(t);
      s.id = corto(t.id);
      s.pts = (t.pts || []).map(function (p) { return { x: r1(p.x), y: r1(p.y) }; });
      return s;
    }

    var ficha = {}, k;
    for (k in (doc.card || {})) if (doc.card[k]) ficha[k] = doc.card[k];

    var fotos = [], antes = null;
    (doc.frames || []).forEach(function (f) {
      var ahora = (f.objects || []).map(pieza);
      var trazos = (f.strokes || []).map(trazo);
      if (!antes) {
        fotos.push({ o: ahora, s: trazos });
      } else {
        // Solo lo que ha cambiado, comparando la pieza entera: así no hace
        // falta saber qué campos tiene cada tipo.
        var previo = {};
        antes.forEach(function (o) { previo[o.id] = JSON.stringify(o); });
        var cambian = ahora.filter(function (o) { return previo[o.id] !== JSON.stringify(o); });
        var vivos = {};
        ahora.forEach(function (o) { vivos[o.id] = 1; });
        var idos = antes.filter(function (o) { return !vivos[o.id]; })
                        .map(function (o) { return o.id; });
        var paso = {};
        if (cambian.length) paso.o = cambian;
        if (idos.length) paso.q = idos;
        if (trazos.length) paso.s = trazos;
        fotos.push(paso);
      }
      antes = ahora;
    });

    return { v: VERSION, p: doc.pitch, w: doc.view, c: ficha, f: fotos };
  }

  function desaprieta(d) {
    if (!d || typeof d !== 'object') return null;
    if (Number(d.v) > VERSION) return null;       // enlace de una versión posterior
    var frames = [], antes = [];
    (d.f || []).forEach(function (paso, i) {
      var lista;
      if (i === 0) {
        lista = (paso.o || []).slice();
      } else {
        // Se parte del fotograma anterior y se le aplica lo que cambió.
        var por = {};
        antes.forEach(function (o) { por[o.id] = o; });
        (paso.q || []).forEach(function (id) { delete por[id]; });
        (paso.o || []).forEach(function (o) { por[o.id] = o; });
        lista = [];
        // Se respeta el orden del fotograma anterior; lo nuevo, al final.
        antes.forEach(function (o) { if (por[o.id]) { lista.push(por[o.id]); delete por[o.id]; } });
        Object.keys(por).forEach(function (id) { lista.push(por[id]); });
      }
      antes = lista;
      frames.push({ objects: lista.map(function (o) { return o; }), strokes: (paso.s || []) });
    });
    return { pitch: d.p, view: d.w, card: d.c || {}, frames: frames };
  }

  /* ---- la puerta de fuera ----------------------------------------------- */

  function empaqueta(doc) {
    var texto = JSON.stringify(aprieta(doc));
    return comprime(texto).then(function (r) {
      return (r.zip ? '' : '0') + aBase64(r.bytes);
    });
  }

  function desempaqueta(txt) {
    if (!txt) return Promise.resolve(null);
    var crudo = String(txt), zip = true;
    if (crudo.charAt(0) === '0') { zip = false; crudo = crudo.slice(1); }
    return Promise.resolve()
      .then(function () { return descomprime(deBase64(crudo), zip); })
      .then(function (t) { return desaprieta(JSON.parse(t)); })
      .catch(function () { return null; });        // enlace roto o a medias
  }

  // La dirección completa, lista para mandar.
  function direccion(doc, base) {
    return empaqueta(doc).then(function (t) {
      var d = base || (location.origin + location.pathname);
      return d + '#' + CLAVE + '=' + t;
    });
  }

  // Lo que venga en la dirección al abrir, si es que viene algo.
  function loQueTraeLaDireccion() {
    var h = location.hash || '';
    var m = new RegExp('[#&]' + CLAVE + '=([^&]+)').exec(h);
    return m ? m[1] : null;
  }

  function limpiaDireccion() {
    var limpio = location.pathname + location.search;
    try { history.replaceState(null, '', limpio); } catch (e) { location.hash = ''; }
  }

  window.PTEnlace = {
    empaqueta: empaqueta,
    desempaqueta: desempaqueta,
    direccion: direccion,
    loQueTraeLaDireccion: loQueTraeLaDireccion,
    limpiaDireccion: limpiaDireccion,
    comodo: COMODO,
    comprime: HAY_ZIP
  };
})();
