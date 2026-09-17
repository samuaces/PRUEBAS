/* ============================================================================
   Pizarra Táctica — motor de la pizarra
   Todo se dibuja sobre un único <canvas> con un bucle de render, para que
   arrastrar y animar vaya fluido en cualquier dispositivo.

   Índice
   1. Constantes y utilidades      6. Trazos
   2. Documento e historial        7. Render
   3. Vista y transformación       8. Interacción con el puntero
   4. Campo                        9. Interfaz
   5. Objetos y materiales        10. Fotogramas y animación
   ========================================================================= */
(function () {
  'use strict';

  /* =========================================================================
     1. Constantes y utilidades
     ====================================================================== */

  // Modalidades, con las medidas de su reglamento. Todo lo demás se deriva de aquí.
  var PITCHES = {
    f11:    { L: 105, W: 68, label: 'Fútbol 11', goal: 7.32, goalD: 2.0,
              circle: 9.15, spot: 11, box: [16.5, 40.32], small: [5.5, 18.32], corner: 1 },
    f7:     { L: 65,  W: 45, label: 'Fútbol 7',  goal: 6,    goalD: 1.8,
              circle: 6,    spot: 9,  box: [12, 24],      small: [6, 12],      corner: 0.75 },
    futsal: { L: 40,  W: 20, label: 'Fútbol sala', goal: 3,  goalD: 1.2,
              circle: 3,    spot: 6,  arc: 6, second: 10, corner: 0.25 }
  };

  function PITCH() { return PITCHES[doc.pitch] || PITCHES.f11; }

  // El recuadro visible se calcula a partir de la modalidad y de la vista elegida.
  // Zona de trabajo: el recuadro donde de verdad se monta un ejercicio, en el
  // centro del campo. Sin esto, un rondo de 14 metros se ve como una mota en
  // mitad de un campo de 105.
  var ZONA = { L: 32, W: 22 };

  function viewRect() {
    /* El margen de fuera de banda: sitio para dejar un cono, un maniquí o una
       ficha fuera del campo. Era el 5 % del largo por cada lado, o sea que el
       campo solo ocupaba el 91 % de lo dibujado a lo ancho y el 87 % a lo alto.
       En un escritorio no se nota; en un teléfono instalado como aplicación,
       con las franjas del sistema comiéndose 93 px, sí. Al 3,5 % sigue
       cabiendo lo de fuera y el campo se ve un 4 % más grande. */
    var P = PITCH(), m = Math.max(2.2, P.L * 0.035);
    if (doc.view === 'area') {
      var zl = Math.min(ZONA.L, P.L), zw = Math.min(ZONA.W, P.W), z = 2;
      return {
        x0: (P.L - zl) / 2 - z, y0: (P.W - zw) / 2 - z,
        x1: (P.L + zl) / 2 + z, y1: (P.W + zw) / 2 + z,
        lines: false
      };
    }
    return {
      x0: -m, y0: -m,
      x1: (doc.view === 'half' ? P.L / 2 : P.L) + m,
      y1: P.W + m,
      lines: doc.view !== 'blank'
    };
  }

  var TEAM = { home: '#E03B2F', away: '#2E86DE', neutral: '#F1C40F' };

  // Geometría de cada tipo de objeto, en metros.
  // Como en cualquier pizarra táctica, las piezas se dibujan algo más grandes que
  // en la realidad: si no, un cono junto a una ficha de jugador sería invisible.
  /* Los tamaños van en metros de campo, pero no son medidas literales: un
     jugador de radio 1,45 m mediría casi tres metros de ancho. Son fichas, y
     su tamaño está elegido para que se vean y se puedan coger.

     Se subieron un escalón —entre un 15 % y un 25 %, más en lo pequeño de pie:
     picas, conos y banderines— porque en un móvil, con el campo entero en
     pantalla, las piezas chicas quedaban en cuatro píxeles y arrastrarlas era
     un ejercicio de puntería. Las porterías y la escalera NO se tocan: esas sí
     son medidas de verdad (7,32 m es una portería reglamentaria) y agrandarlas
     sería mentir sobre el espacio que ocupan en el campo. */
  var KIND = {
    player:   { r: 1.70,               rot: false, label: 'Jugador' },
    ball:     { r: 0.98,               rot: false, label: 'Balón' },
    cone:     { r: 1.18,               rot: true,  label: 'Cono' },
    disc:     { r: 1.20,               rot: true,  label: 'Chino' },
    goal:     { w: 7.32, h: 2.0,       rot: true,  label: 'Portería' },
    minigoal: { w: 4.5,  h: 1.8,       rot: true,  label: 'Portería pequeña' },
    hurdle:   { w: 2.6,  h: 1.3,       rot: true,  label: 'Valla' },
    ladder:   { w: 7.0,  h: 1.6,       rot: true,  label: 'Escalera' },
    pole:     { r: 0.94,               rot: true,  label: 'Pica' },
    dummy:    { w: 1.7,  h: 2.5,       rot: true,  label: 'Maniquí' },
    ring:     { r: 1.42,               rot: true,  label: 'Aro' },
    flag:     { r: 1.22,               rot: true,  label: 'Banderín' },
    text:     { r: 1.2,                rot: true,  label: 'Texto' }
  };

  // Colores corporativos que se pintan en el lienzo. El rojo destaca sobre el
  // césped mucho más que el verde de antes, que se confundía con el campo.
  var SEL = '#FF2E55';

  var COLORS = ['#FFFFFF', '#F1C40F', '#E03B2F', '#00E27E', '#4CC2FF', '#E67E22', '#B36BE0', '#1ABC9C'];

  var FORMATIONS = {
    '4-4-2':   [[5,34],[18,10],[16,26],[16,42],[18,58],[34,9],[31,26],[31,42],[34,59],[46,26],[46,42]],
    '4-3-3':   [[5,34],[18,10],[16,26],[16,42],[18,58],[31,20],[28,34],[31,48],[46,11],[48,34],[46,57]],
    '4-2-3-1': [[5,34],[18,10],[16,26],[16,42],[18,58],[28,26],[28,42],[40,12],[40,34],[40,56],[50,34]],
    '3-5-2':   [[5,34],[17,20],[15,34],[17,48],[31,6],[31,22],[28,34],[31,46],[31,62],[46,26],[46,42]],
    '5-3-2':   [[5,34],[16,7],[18,21],[16,34],[18,47],[16,61],[31,22],[31,34],[31,46],[45,26],[45,42]],
    '4-1-4-1': [[5,34],[18,10],[16,26],[16,42],[18,58],[27,34],[39,10],[37,26],[37,42],[39,58],[49,34]]
  };
  var NUMBERS = {
    '4-4-2':   [1,2,4,5,3,7,6,8,11,9,10],
    '4-3-3':   [1,2,4,5,3,8,6,10,7,9,11],
    '4-2-3-1': [1,2,4,5,3,6,8,7,10,11,9],
    '3-5-2':   [1,4,5,3,2,8,6,10,7,9,11],
    '5-3-2':   [1,2,4,5,3,6,8,6,10,9,11],
    '4-1-4-1': [1,2,4,5,3,6,7,8,10,11,9]
  };

  // Fútbol 7 (65 x 45) y fútbol sala (40 x 20) tienen sus propios sistemas.
  var FORMATIONS_F7 = {
    '1-3-2-1': [[4,22.5],[13,8],[11,22.5],[13,37],[22,13],[22,32],[30,22.5]],
    '1-2-3-1': [[4,22.5],[12,15],[12,30],[22,7],[21,22.5],[22,38],[30,22.5]],
    '1-3-1-2': [[4,22.5],[13,8],[11,22.5],[13,37],[21,22.5],[29,15],[29,30]],
    '1-1-3-2': [[4,22.5],[11,22.5],[20,7],[19,22.5],[20,38],[29,15],[29,30]]
  };
  var NUMBERS_F7 = {
    '1-3-2-1': [1,2,4,3,8,6,9], '1-2-3-1': [1,2,3,7,8,11,9],
    '1-3-1-2': [1,2,4,3,8,9,11], '1-1-3-2': [1,4,7,8,11,9,10]
  };
  var FORMATIONS_FS = {
    '1-2-1 (rombo)': [[2.5,10],[8,5],[8,15],[13,10],[17,10]],
    '2-2 (cuadrado)': [[2.5,10],[8,5.5],[8,14.5],[16,5.5],[16,14.5]],
    '1-3-0':          [[2.5,10],[9,10],[16,4],[16,10],[16,16]],
    '3-1':            [[2.5,10],[8,4],[8,10],[8,16],[16,10]]
  };
  var NUMBERS_FS = {
    '1-2-1 (rombo)': [1,4,3,5,9], '2-2 (cuadrado)': [1,4,3,7,9],
    '1-3-0': [1,5,7,9,11], '3-1': [1,2,4,3,9]
  };

  function formationSet() {
    if (doc.pitch === 'f7') return { pos: FORMATIONS_F7, num: NUMBERS_F7 };
    if (doc.pitch === 'futsal') return { pos: FORMATIONS_FS, num: NUMBERS_FS };
    return { pos: FORMATIONS, num: NUMBERS };
  }

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var uid = function () { return Math.random().toString(36).slice(2, 9); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* =========================================================================
     2. Documento e historial
     ====================================================================== */

  function emptyFrame() { return { objects: [], strokes: [] }; }

  // Ficha del ejercicio. Vive en el documento, así que se guarda, se exporta,
  // se importa y entra en el historial igual que los fotogramas.
  var CARD_FIELDS = ['titulo', 'categoria', 'momento', 'fecha', 'sesion',
    'duracion', 'series', 'descanso', 'jugadores', 'porteros', 'espacio', 'material',
    'objetivo', 'descripcion', 'consignas', 'normas', 'variantes'];

  function emptyCard() {
    var c = {};
    CARD_FIELDS.forEach(function (k) { c[k] = ''; });
    return c;
  }

  var doc = { pitch: 'f11', view: 'full', card: emptyCard(), frames: [emptyFrame()] };

  /* -------------------------------------------------------------------------
     La aduana de los documentos.

     Una pizarra puede llegar de sitios en los que no mandamos: lo guardado en
     este navegador (que puede haber quedado a medias), un archivo JSON que
     alguien ha editado a mano, un ejercicio que ha subido otro entrenador, o
     una versión de la aplicación distinta de esta. Si entra con una forma que
     el motor no espera, la pizarra revienta al dibujar; y si lo que reventaba
     era lo guardado, reventaba otra vez en cada recarga, con lo cual la
     aplicación se quedaba en blanco para siempre y no había manera de salir.

     Por eso TODO documento que entra pasa por aquí y sale con la forma buena:
     modalidad y vista conocidas, ficha de texto, al menos un fotograma, y
     dentro solo piezas y trazos que se puedan dibujar. Lo que no encaja se
     descarta en silencio: más vale abrir el ejercicio sin una pieza rara que
     no abrirlo.
     ---------------------------------------------------------------------- */
  var VIEWS = ['full', 'half', 'area', 'blank'];
  var TOOLS_TRAZO = ['pass', 'run', 'dribble', 'free', 'zone', 'measure'];

  function num(v, porDefecto) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : porDefecto;
  }

  function saneaObjeto(o) {
    if (!o || typeof o !== 'object' || !KIND[o.kind]) return null;
    var s = clone(o);
    s.id = typeof o.id === 'string' && o.id ? o.id : uid();
    s.x = num(o.x, 0); s.y = num(o.y, 0);
    s.rot = num(o.rot, 0);
    if (o.w != null) s.w = num(o.w, KIND[o.kind].w);
    if (o.h != null) s.h = num(o.h, KIND[o.kind].h);
    if (s.kind === 'player') s.team = (s.team === 'away' || s.team === 'neutral') ? s.team : 'home';
    if (s.name != null) s.name = String(s.name).slice(0, 14);
    if (s.text != null) s.text = String(s.text).slice(0, 28);
    if (s.num != null) s.num = String(s.num).replace(/\D/g, '').slice(0, 2);
    return s;
  }

  function saneaTrazo(t) {
    if (!t || typeof t !== 'object' || TOOLS_TRAZO.indexOf(t.tool) < 0) return null;
    if (!Array.isArray(t.pts) || t.pts.length < 2) return null;
    var s = clone(t);
    s.pts = t.pts.filter(function (p) { return p && typeof p === 'object'; })
      .map(function (p) { return { x: num(p.x, 0), y: num(p.y, 0) }; });
    if (s.pts.length < 2) return null;
    s.width = Math.min(3, Math.max(0.05, num(t.width, 0.32)));
    s.color = typeof t.color === 'string' ? t.color : '#FFFFFF';
    return s;
  }

  /* La aduana por la que pasa TODO documento que no ha dibujado uno mismo: un
     enlace que te mandan, un archivo que importas, un ejercicio de la
     biblioteca común. Comprueba la forma —modalidad y vista de una lista
     cerrada, los campos de la ficha a texto, lo que no sea un array fuera— y
     además el TAMAÑO.

     El tamaño importa tanto como la forma. El servidor no deja subir una
     pizarra de más de medio mega, pero un enlace y un archivo no pasan por el
     servidor, y medio mega de JSON son veinte mil fichas: el navegador de quien
     lo abra se queda clavado intentando dibujarlas. Los topes de aquí abajo
     están muy por encima de cualquier ejercicio real —el más cargado del
     catálogo no llega a cuarenta piezas— y muy por debajo de lo que cuelga un
     teléfono. */
  var TOPE_FOTOGRAMAS = 60;
  var TOPE_PIEZAS     = 300;    // por fotograma
  var TOPE_TRAZOS     = 600;    // por fotograma
  var TOPE_TEXTO      = 4000;   // por campo de la ficha

  function saneaDoc(d) {
    if (!d || typeof d !== 'object') d = {};
    var out = {
      pitch: PITCHES[d.pitch] ? d.pitch : 'f11',
      view: VIEWS.indexOf(d.view) >= 0 ? d.view : 'full',
      card: emptyCard(),
      frames: []
    };
    if (d.card && typeof d.card === 'object' && !Array.isArray(d.card)) {
      CARD_FIELDS.forEach(function (k) {
        if (d.card[k] != null && typeof d.card[k] !== 'object') {
          out.card[k] = String(d.card[k]).slice(0, TOPE_TEXTO);
        }
      });
    }
    (Array.isArray(d.frames) ? d.frames : []).slice(0, TOPE_FOTOGRAMAS).forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      out.frames.push({
        objects: (Array.isArray(f.objects) ? f.objects : [])
          .slice(0, TOPE_PIEZAS).map(saneaObjeto).filter(Boolean),
        strokes: (Array.isArray(f.strokes) ? f.strokes : [])
          .slice(0, TOPE_TRAZOS).map(saneaTrazo).filter(Boolean)
      });
    });
    if (!out.frames.length) out.frames = [emptyFrame()];
    return out;
  }

  var ui = {
    frame: 0,
    tool: 'select',          // select | pass | run | dribble | free | zone | eraser | place
    place: null,             // { kind, team }
    color: '#FFFFFF',
    width: 0.32,             // grosor del trazo en metros
    snap: false,
    sel: null,               // id del objeto seleccionado
    multi: [],               // ids seleccionados en grupo
    playing: false,
    speed: 1,
    loop: false,
    zoom: 1,           // acercamiento del usuario
    panX: 0, panY: 0   // desplazamiento, en píxeles de pantalla
  };

  var hist = [], hi = -1;

  /* Ajustes del usuario. Viven aparte del documento: no son de una pizarra
     concreta, son de quien la usa. */
  var PREFS_POR_DEFECTO = { pitch: 'f11', categoria: '' };

  function prefs() {
    var p;
    try { p = JSON.parse(localStorage.getItem('pt-prefs') || '{}'); } catch (e) { p = {}; }
    if (!PITCHES[p.pitch]) p.pitch = PREFS_POR_DEFECTO.pitch;
    if (typeof p.categoria !== 'string') p.categoria = '';
    return p;
  }
  function guardaPrefs(p) {
    try { localStorage.setItem('pt-prefs', JSON.stringify(p)); } catch (e) {}
  }

  function frame() { return doc.frames[ui.frame]; }

  function commit() {
    hist = hist.slice(0, hi + 1);
    hist.push(JSON.stringify(doc));
    if (hist.length > 80) hist.shift();
    hi = hist.length - 1;
    refreshHistoryButtons();
    autosave();
  }
  function restore(json) {
    doc = JSON.parse(json);
    ui.frame = clamp(ui.frame, 0, doc.frames.length - 1);
    ui.sel = null; ui.multi = [];
    syncViewButtons();
    buildFrames();
    hideInspector();
    resize();   // la vista puede haber cambiado: hay que recalcular la escala
  }
  function undo() { if (hi > 0) { hi--; restore(hist[hi]); refreshHistoryButtons(); autosave(); } }
  function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); refreshHistoryButtons(); autosave(); } }
  function refreshHistoryButtons() {
    $('#undo').disabled = hi <= 0;
    $('#redo').disabled = hi >= hist.length - 1;
  }

  var autosaveTimer, autosaveAvisado = false;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      try {
        localStorage.setItem('pt-autosave', JSON.stringify(doc));
        autosaveAvisado = false;
      } catch (e) {
        /* El almacenamiento del navegador está lleno. Callarse aquí es lo peor
           que se puede hacer: el entrenador sigue trabajando creyendo que su
           pizarra se guarda sola y, al recargar, se encuentra con la de antes.
           Se avisa una vez y se dice qué hacer. */
        if (!autosaveAvisado) {
          autosaveAvisado = true;
          toast('El navegador está lleno y no puedo guardar sola la pizarra. Borra alguna guardada o expórtala.');
        }
      }
    }, 400);
  }

  /* =========================================================================
     3. Vista y transformación
     ====================================================================== */

  var canvas = $('#board'), ctx = canvas.getContext('2d');
  var T = { s: 1, ox: 0, oy: 0 };   // metros -> píxeles CSS (ya con zoom aplicado)
  var BASE = { s: 1, ox: 0, oy: 0 };// el campo entero encajado en la pantalla
  var CW = 0, CH = 0;
  var ZOOM_MIN = 1, ZOOM_MAX = 5;

  function transformFor(w, h, view) {
    var vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    var s = Math.min(w / vw, h / vh);
    return { s: s, ox: (w - vw * s) / 2 - view.x0 * s, oy: (h - vh * s) / 2 - view.y0 * s };
  }
  // Ancho y alto del lienzo en coordenadas locales (con el campo girado se intercambian).
  function localW() { return BASE.rot ? CH : CW; }
  function localH() { return BASE.rot ? CW : CH; }

  // Aplica el zoom y el desplazamiento del usuario sobre el encaje base.
  function applyView() {
    var z = ui.zoom, cx = localW() / 2, cy = localH() / 2;
    T = {
      s: BASE.s * z,
      ox: (BASE.ox - cx) * z + cx + ui.panX,
      oy: (BASE.oy - cy) * z + cy + ui.panY,
      rot: BASE.rot
    };
    clampPan();
    $('#zoom').hidden = ui.zoom <= 1.001;
    draw();
  }

  // El campo no puede salirse del todo de la pantalla.
  function clampPan() {
    var view = viewRect();
    var w = (view.x1 - view.x0) * T.s, h = (view.y1 - view.y0) * T.s;
    var lw = localW(), lh = localH();
    var maxX = Math.max(0, (w - lw) / 2), maxY = Math.max(0, (h - lh) / 2);
    ui.panX = clamp(ui.panX, -maxX, maxX);
    ui.panY = clamp(ui.panY, -maxY, maxY);
    var cx = lw / 2, cy = lh / 2, z = ui.zoom;
    T.ox = (BASE.ox - cx) * z + cx + ui.panX;
    T.oy = (BASE.oy - cy) * z + cy + ui.panY;
  }

  function setZoom(z, fx, fy) {
    var old = ui.zoom;
    z = clamp(z, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(z - old) < 1e-4) return;
    // mantiene bajo los dedos el punto (fx, fy), en coordenadas locales
    if (fx != null) {
      var cx = localW() / 2, cy = localH() / 2;
      ui.panX = fx - (fx - ui.panX - cx) * (z / old) - cx;
      ui.panY = fy - (fy - ui.panY - cy) * (z / old) - cy;
    }
    ui.zoom = z;
    if (z <= 1.001) { ui.zoom = 1; ui.panX = 0; ui.panY = 0; }
    applyView();
  }

  function resetView() { ui.zoom = 1; ui.panX = 0; ui.panY = 0; applyView(); toast('Vista completa'); }

  // Coordenadas locales (las que usa todo el dibujo) -> píxeles de pantalla.
  function toScreen(x, y) {
    var a = x * T.s + T.ox, b = y * T.s + T.oy;
    return T.rot ? { x: CW - b, y: a } : { x: a, y: b };
  }
  // Píxeles de pantalla -> metros del campo.
  function toMeters(sx, sy) {
    var a = T.rot ? sy : sx, b = T.rot ? CW - sx : sy;
    return { x: (a - T.ox) / T.s, y: (b - T.oy) / T.s };
  }

  function resize() {
    var stage = canvas.parentNode;
    // clientWidth/Height del contenedor: no lo influye el propio canvas, que va absoluto.
    var pad = 4;                 // el mismo que el relleno de .stage en el móvil
    CW = Math.max(240, stage.clientWidth - pad * 2);
    CH = Math.max(200, stage.clientHeight - pad * 2);
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';
    canvas.width = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // En pantallas verticales giramos el campo 90°: aprovecha mucho mejor el móvil.
    var view = viewRect();
    var rot = CW < CH && (view.x1 - view.x0) > (view.y1 - view.y0);
    BASE = rot ? transformFor(CH, CW, view) : transformFor(CW, CH, view);
    BASE.rot = rot;
    applyView();
  }

  /* =========================================================================
     4. Campo
     ====================================================================== */

  function drawPitch(c, t, view) {
    var P = PITCH(), u = t.s;

    // fondo exterior
    c.fillStyle = doc.pitch === 'futsal' ? '#111C26' : '#0A3D24';
    c.fillRect(t.ox + view.x0 * u, t.oy + view.y0 * u, (view.x1 - view.x0) * u, (view.y1 - view.y0) * u);

    // césped con franjas de siega
    var bands = doc.pitch === 'futsal' ? 8 : 12, bw = P.L / bands;
    for (var i = 0; i < bands; i++) {
      c.fillStyle = i % 2 ? '#127A46' : '#0F6E3F';
      c.fillRect(t.ox + i * bw * u, t.oy, bw * u + 1, P.W * u);
    }
    // el fútbol sala se juega sobre pista, no sobre hierba
    if (doc.pitch === 'futsal') {
      c.fillStyle = '#1D5B7E';
      c.fillRect(t.ox, t.oy, P.L * u, P.W * u);
      c.fillStyle = 'rgba(255,255,255,.045)';
      for (var j = 0; j < bands; j++) if (j % 2) c.fillRect(t.ox + j * bw * u, t.oy, bw * u + 1, P.W * u);
    }

    // viñeta suave
    var g = c.createRadialGradient(
      t.ox + P.L / 2 * u, t.oy + P.W / 2 * u, P.W * 0.25 * u,
      t.ox + P.L / 2 * u, t.oy + P.W / 2 * u, P.L * 0.72 * u);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.26)');
    c.fillStyle = g;
    c.fillRect(t.ox + view.x0 * u, t.oy + view.y0 * u, (view.x1 - view.x0) * u, (view.y1 - view.y0) * u);

    if (!view.lines) return;

    c.save();
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = Math.max(1.2, Math.min(0.14, P.L / 750) * u);
    c.lineJoin = 'round';

    function rect(x, y, w, h) { c.strokeRect(t.ox + x * u, t.oy + y * u, w * u, h * u); }
    function line(x1, y1, x2, y2) {
      c.beginPath(); c.moveTo(t.ox + x1 * u, t.oy + y1 * u); c.lineTo(t.ox + x2 * u, t.oy + y2 * u); c.stroke();
    }
    function arc(cx, cy, r, a1, a2) {
      c.beginPath(); c.arc(t.ox + cx * u, t.oy + cy * u, r * u, a1, a2); c.stroke();
    }
    function dot(cx, cy, r) {
      c.beginPath(); c.arc(t.ox + cx * u, t.oy + cy * u, r * u, 0, 7);
      c.fillStyle = 'rgba(255,255,255,.9)'; c.fill();
    }

    rect(0, 0, P.L, P.W);
    line(P.L / 2, 0, P.L / 2, P.W);
    arc(P.L / 2, P.W / 2, P.circle, 0, Math.PI * 2);
    dot(P.L / 2, P.W / 2, P.L / 650);

    var gy0 = (P.W - P.goal) / 2;

    [0, 1].forEach(function (side) {
      var sx = side ? P.L : 0, dir = side ? -1 : 1;

      if (doc.pitch === 'futsal') {
        // El área es un doble cuarto de círculo trazado desde cada poste.
        var r = P.arc;
        c.beginPath();
        if (!side) {
          c.arc(t.ox, t.oy + gy0 * u, r * u, -Math.PI / 2, 0);
          c.lineTo(t.ox + r * u, t.oy + (gy0 + P.goal) * u);
          c.arc(t.ox, t.oy + (gy0 + P.goal) * u, r * u, 0, Math.PI / 2);
        } else {
          c.arc(t.ox + P.L * u, t.oy + gy0 * u, r * u, Math.PI * 1.5, Math.PI, true);
          c.lineTo(t.ox + (P.L - r) * u, t.oy + (gy0 + P.goal) * u);
          c.arc(t.ox + P.L * u, t.oy + (gy0 + P.goal) * u, r * u, Math.PI, Math.PI / 2, true);
        }
        c.stroke();
        dot(sx + dir * P.spot, P.W / 2, P.L / 650);
        dot(sx + dir * P.second, P.W / 2, P.L / 650);
      } else {
        rect(side ? P.L - P.box[0] : 0, (P.W - P.box[1]) / 2, P.box[0], P.box[1]);
        rect(side ? P.L - P.small[0] : 0, (P.W - P.small[1]) / 2, P.small[0], P.small[1]);
        dot(sx + dir * P.spot, P.W / 2, P.L / 650);
        // arco de penalti: sólo el tramo que queda fuera del área
        if (P.circle > P.box[0] - P.spot) {
          var a = Math.acos((P.box[0] - P.spot) / P.circle);
          arc(sx + dir * P.spot, P.W / 2, P.circle,
              side ? Math.PI - a : -a,
              side ? Math.PI + a : a);
        }
      }

      // portería
      c.save();
      c.lineWidth = Math.max(1.6, Math.min(0.2, P.L / 520) * u);
      c.strokeStyle = 'rgba(255,255,255,.95)';
      c.strokeRect(t.ox + (side ? P.L : -P.goalD) * u, t.oy + gy0 * u, P.goalD * u, P.goal * u);
      c.restore();
    });

    // córners
    var cr = P.corner;
    arc(0, 0, cr, 0, Math.PI / 2);
    arc(P.L, 0, cr, Math.PI / 2, Math.PI);
    arc(P.L, P.W, cr, Math.PI, Math.PI * 1.5);
    arc(0, P.W, cr, Math.PI * 1.5, Math.PI * 2);

    c.restore();
  }

  /* =========================================================================
     5. Objetos y materiales
     ====================================================================== */

  // Medidas reales del objeto: puede llevarlas propias (una portería de fútbol 7
  // no mide lo mismo que una de fútbol 11).
  var SYMBOLS = { player: 1, ball: 1, text: 1 };

  function symbolScale() {
    return clamp(Math.sqrt(PITCH().L / 105), 0.5, 1);
  }

  function dims(o) {
    var k = KIND[o.kind], f = SYMBOLS[o.kind] ? symbolScale() : 1;
    return {
      r: k.r != null ? k.r * f : null,
      w: (o.w || k.w) * (o.w ? 1 : f),
      h: (o.h || k.h) * (o.h ? 1 : f),
      rot: k.rot, label: k.label
    };
  }

  function objColor(o) {
    if (o.kind === 'player') return TEAM[o.team] || TEAM.home;
    return o.color || '#F1C40F';
  }

  // Dibuja un objeto. `alpha` permite las entradas/salidas de la animación.
  function drawObject(c, t, o, alpha) {
    var u = t.s;
    var X = o.x * u + t.ox, Y = o.y * u + t.oy;
    var rot = (o.rot || 0) * Math.PI / 180;

    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.translate(X, Y);
    if (rot) c.rotate(rot);
    if (o.kind !== 'player' && o.kind !== 'text') {
      c.shadowColor = 'rgba(0,0,0,.5)';
      c.shadowBlur = Math.max(2, u * 0.3);
      c.shadowOffsetY = Math.max(1, u * 0.1);
    }

    switch (o.kind) {
      case 'player':   drawPlayer(c, t, o); break;
      case 'ball':     drawBall(c, u, dims(o).r); break;
      case 'cone':     drawCone(c, u, o); break;
      case 'disc':     drawDisc(c, u, o); break;
      case 'goal':
      case 'minigoal': var dg = dims(o); drawGoal(c, u, dg.w, dg.h); break;
      case 'hurdle':   drawHurdle(c, u, o); break;
      case 'ladder':   drawLadder(c, u, o); break;
      case 'pole':     drawPole(c, u, o); break;
      case 'dummy':    drawDummy(c, u, o); break;
      case 'ring':     drawRing(c, u, o); break;
      case 'flag':     drawFlag(c, u, o); break;
      case 'text':     drawText(c, t, o); break;
    }
    c.restore();
  }

  function shadow(c, u, rx, ry, a) {
    c.save();
    c.fillStyle = 'rgba(0,0,0,' + (a || 0.3) + ')';
    c.beginPath(); c.ellipse(0, ry * u * 0.45, rx * u, ry * u * 0.5, 0, 0, 7); c.fill();
    c.restore();
  }

  function drawPlayer(c, t, o) {
    var u = t.s, r = dims(o).r * u, col = objColor(o);
    shadow(c, u, r / u * 0.95, 0.75, 0.35);
    var g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, col);
    g.addColorStop(1, shade(col, -0.28));
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.lineWidth = Math.max(1.4, 0.16 * u);
    c.strokeStyle = 'rgba(255,255,255,.92)';
    c.stroke();

    c.save();
    if (t.rot) c.rotate(-Math.PI / 2);   // dorsales siempre legibles
    if (o.num != null && o.num !== '') {
      c.fillStyle = '#fff';
      c.font = '700 ' + (r * 1.05) + 'px Outfit, system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(o.num), 0, r * 0.06);
    }
    if (o.name) {
      var fs = Math.max(9, r * 0.62);
      c.font = '600 ' + fs + 'px InterVar, system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'top';
      var w = c.measureText(o.name).width + fs * 0.7;
      c.fillStyle = 'rgba(7,10,15,.72)';
      roundRect(c, -w / 2, r + fs * 0.35, w, fs * 1.45, fs * 0.4); c.fill();
      c.fillStyle = '#EAF1F8';
      c.fillText(o.name, 0, r + fs * 0.62);
    }
    c.restore();
  }

  function drawBall(c, u, rm) {
    var r = (rm || KIND.ball.r) * u;
    shadow(c, u, rm || KIND.ball.r, 0.4, 0.4);
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.lineWidth = Math.max(1, r * 0.16); c.strokeStyle = '#20303F'; c.stroke();
    c.fillStyle = '#20303F';
    c.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
    }
    c.closePath(); c.fill();
  }

  function drawCone(c, u, o) {
    var col = o.color || '#F4820B', s = KIND.cone.r * u;
    shadow(c, u, 0.5, 0.42, 0.38);
    c.fillStyle = shade(col, -0.35);
    c.beginPath(); c.ellipse(0, s * 0.1, s * 0.78, s * 0.3, 0, 0, 7); c.fill();
    var g = c.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
    g.addColorStop(0, shade(col, 0.16)); g.addColorStop(1, shade(col, -0.22));
    c.fillStyle = g;
    // un cono se dibuja de pie; el giro sólo desplaza la punta, como al inclinarlo
    c.beginPath();
    c.moveTo(-s * 0.55, s * 0.12); c.quadraticCurveTo(-s * 0.2, -s * 1.35, 0, -s * 1.5);
    c.quadraticCurveTo(s * 0.2, -s * 1.35, s * 0.55, s * 0.12);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.fillRect(-s * 0.36, -s * 0.72, s * 0.72, s * 0.2);
  }

  // Un chino: cono ancho y bajo, con el agujero de arriba donde se clava la
  // pica. Ni un plato liso ni un cono de tráfico en miniatura.
  function drawDisc(c, u, o) {
    var r = KIND.disc.r * u, col = o.color || '#F1C40F';
    var h = r * 0.6, ra = r * 0.19;                     // alto y radio del agujero
    shadow(c, u, KIND.disc.r * 0.9, 0.26, 0.32);

    c.fillStyle = shade(col, -0.34);                    // el canto de la falda
    c.beginPath(); c.ellipse(0, r * 0.05, r, r * 0.32, 0, 0, 7); c.fill();

    var g = c.createLinearGradient(-r, 0, r, 0);        // la falda
    g.addColorStop(0, shade(col, 0.2));
    g.addColorStop(0.5, col);
    g.addColorStop(1, shade(col, -0.24));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-r, 0);
    c.quadraticCurveTo(-r * 0.66, -h * 0.92, -ra, -h);
    c.lineTo(ra, -h);
    c.quadraticCurveTo(r * 0.66, -h * 0.92, r, 0);
    c.ellipse(0, 0, r, r * 0.32, 0, 0, Math.PI);        // el borde de delante
    c.closePath(); c.fill();

    c.fillStyle = shade(col, 0.26);                     // la corona de arriba
    c.beginPath(); c.ellipse(0, -h, ra * 1.5, ra * 0.62, 0, 0, 7); c.fill();
    c.fillStyle = shade(col, -0.55);                    // el agujero
    c.beginPath(); c.ellipse(0, -h, ra * 0.78, ra * 0.32, 0, 0, 7); c.fill();
  }

  function drawGoal(c, u, w, d) {
    var W = w * u, D = d * u;
    c.save();
    c.translate(0, 0);
    // red
    c.fillStyle = 'rgba(255,255,255,.13)';
    c.fillRect(-W / 2, -D / 2, W, D);
    c.strokeStyle = 'rgba(255,255,255,.34)';
    c.lineWidth = Math.max(0.6, u * 0.035);
    c.beginPath();
    for (var x = -W / 2; x <= W / 2 + 0.1; x += Math.max(4, u * 0.42)) { c.moveTo(x, -D / 2); c.lineTo(x, D / 2); }
    for (var y = -D / 2; y <= D / 2 + 0.1; y += Math.max(4, u * 0.42)) { c.moveTo(-W / 2, y); c.lineTo(W / 2, y); }
    c.stroke();
    // marco
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = Math.max(2, u * 0.16);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-W / 2, D / 2); c.lineTo(-W / 2, -D / 2); c.lineTo(W / 2, -D / 2); c.lineTo(W / 2, D / 2);
    c.stroke();
    c.restore();
  }

  // Una valla de agilidad es una U invertida apoyada en dos pies.
  function drawHurdle(c, u, o) {
    var w = KIND.hurdle.w * u, h = KIND.hurdle.h * u, col = o.color || '#F1C40F';
    shadow(c, u, KIND.hurdle.w * 0.48, 0.32, 0.3);
    var gr = Math.max(1.8, h * 0.17);
    c.fillStyle = '#243244';                            // los pies
    roundRect(c, -w / 2, h * 0.16, w * 0.24, gr, gr * 0.5); c.fill();
    roundRect(c, w / 2 - w * 0.24, h * 0.16, w * 0.24, gr, gr * 0.5); c.fill();
    c.strokeStyle = col;                                // montantes y travesaño
    c.lineWidth = gr;
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-w / 2 + gr, h * 0.2);
    c.lineTo(-w / 2 + gr, -h * 0.4);
    c.lineTo(w / 2 - gr, -h * 0.4);
    c.lineTo(w / 2 - gr, h * 0.2);
    c.stroke();
  }

  function drawLadder(c, u, o) {
    var w = KIND.ladder.w * u, h = KIND.ladder.h * u, col = o.color || '#F1C40F';
    c.fillStyle = 'rgba(0,0,0,.18)';
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.2); c.fill();
    c.strokeStyle = col;
    c.lineWidth = Math.max(1.4, u * 0.07);
    c.strokeRect(-w / 2, -h / 2, w, h);
    c.beginPath();
    var rungs = 9;
    for (var i = 1; i < rungs; i++) {
      var x = -w / 2 + w * i / rungs;
      c.moveTo(x, -h / 2); c.lineTo(x, h / 2);
    }
    c.stroke();
  }

  // Una pica es un palo de metro y medio clavado en su peana. Vista desde
  // arriba era un punto rojo indistinguible de cualquier otra cosa.
  function drawPole(c, u, o) {
    var s = KIND.pole.r * u, col = o.color || '#E03B2F', alto = s * 2.2;
    shadow(c, u, KIND.pole.r * 0.75, 0.24, 0.34);
    c.fillStyle = '#26364A';                            // peana
    c.beginPath(); c.ellipse(0, 0, s * 0.92, s * 0.34, 0, 0, 7); c.fill();
    var an = Math.max(1.6, s * 0.32);
    var g = c.createLinearGradient(-an / 2, 0, an / 2, 0);
    g.addColorStop(0, shade(col, 0.2)); g.addColorStop(1, shade(col, -0.28));
    c.fillStyle = g;
    c.fillRect(-an / 2, -alto, an, alto);
    c.fillStyle = 'rgba(255,255,255,.85)';              // las franjas
    c.fillRect(-an / 2, -alto * 0.74, an, alto * 0.15);
    c.fillRect(-an / 2, -alto * 0.38, an, alto * 0.15);
    c.fillStyle = shade(col, 0.2);                      // punta
    c.beginPath(); c.arc(0, -alto, an / 2, 0, 7); c.fill();
  }

  // Un maniquí de barrera: la silueta amarilla de siempre, con los brazos
  // cruzados sobre el pecho y su peana negra.
  function drawDummy(c, u, o) {
    var w = KIND.dummy.w * u, h = KIND.dummy.h * u, col = (o && o.color) || '#F5C518';
    shadow(c, u, KIND.dummy.w * 0.66, 0.32, 0.34);
    c.fillStyle = '#161C24';                               // peana
    c.beginPath(); c.ellipse(0, h * 0.47, w * 0.58, w * 0.2, 0, 0, 7); c.fill();
    var g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, shade(col, 0.14));
    g.addColorStop(0.55, col);
    g.addColorStop(1, shade(col, -0.3));
    c.fillStyle = g;
    c.beginPath();                                         // tronco con hombros
    c.moveTo(-w * 0.34, h * 0.46);
    c.lineTo(-w * 0.44, -h * 0.06);
    c.quadraticCurveTo(-w * 0.46, -h * 0.22, -w * 0.2, -h * 0.26);
    c.lineTo(w * 0.2, -h * 0.26);
    c.quadraticCurveTo(w * 0.46, -h * 0.22, w * 0.44, -h * 0.06);
    c.lineTo(w * 0.34, h * 0.46);
    c.closePath(); c.fill();
    c.beginPath();                                         // cabeza
    c.arc(0, -h * 0.37, w * 0.23, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.42)';                     // los brazos cruzados
    c.lineWidth = Math.max(1.2, h * 0.045);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-w * 0.34, -h * 0.1); c.lineTo(w * 0.3, h * 0.02);
    c.moveTo(w * 0.34, -h * 0.1); c.lineTo(-w * 0.3, h * 0.02);
    c.stroke();
  }

  function drawRing(c, u, o) {
    var r = KIND.ring.r * u, col = o.color || '#4CC2FF';
    c.strokeStyle = col;
    c.lineWidth = Math.max(2, u * 0.13);
    c.beginPath(); c.ellipse(0, 0, r, r * 0.72, 0, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.28)';
    c.lineWidth = Math.max(1, u * 0.05);
    c.beginPath(); c.ellipse(0, r * 0.12, r, r * 0.72, 0, 0, 7); c.stroke();
  }

  function drawFlag(c, u, o) {
    var s = KIND.flag.r * u, col = o.color || '#E03B2F';
    shadow(c, u, 0.3, 0.28, 0.3);
    c.strokeStyle = '#DCE6F0';
    c.lineWidth = Math.max(1.4, u * 0.07);
    c.beginPath(); c.moveTo(0, s * 0.5); c.lineTo(0, -s * 2.2); c.stroke();
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, -s * 2.2); c.lineTo(s * 1.7, -s * 1.65); c.lineTo(0, -s * 1.05);
    c.closePath(); c.fill();
  }

  function drawText(c, t, o) {
    var u = t.s, fs = Math.max(11, 1.5 * u * symbolScale());
    c.save();
    if (t.rot) c.rotate(-Math.PI / 2);
    c.font = '700 ' + fs + 'px Outfit, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var txt = o.text || 'Texto';
    var w = c.measureText(txt).width + fs * 0.9;
    c.fillStyle = 'rgba(7,10,15,.78)';
    roundRect(c, -w / 2, -fs * 0.85, w, fs * 1.7, fs * 0.45); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = o.color || '#FFFFFF';
    c.fillText(txt, 0, fs * 0.05);
    c.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var f = function (v) { return clamp(Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt)), 0, 255); };
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  /* =========================================================================
     6. Trazos
     ====================================================================== */

  function strokePath(c, t, pts) {
    c.beginPath();
    c.moveTo(pts[0].x * t.s + t.ox, pts[0].y * t.s + t.oy);
    if (pts.length === 2) {
      c.lineTo(pts[1].x * t.s + t.ox, pts[1].y * t.s + t.oy);
      return;
    }
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      c.quadraticCurveTo(a.x * t.s + t.ox, a.y * t.s + t.oy,
                         (a.x + b.x) / 2 * t.s + t.ox, (a.y + b.y) / 2 * t.s + t.oy);
    }
    var last = pts[pts.length - 1];
    c.lineTo(last.x * t.s + t.ox, last.y * t.s + t.oy);
  }

  function arrowHead(c, t, pts, w) {
    var n = pts.length, b = pts[n - 1], a = pts[Math.max(0, n - 4)];
    var ang = Math.atan2(b.y - a.y, b.x - a.x);
    var L = Math.max(8, w * t.s * 3.1);
    var X = b.x * t.s + t.ox, Y = b.y * t.s + t.oy;
    c.beginPath();
    c.moveTo(X, Y);
    c.lineTo(X - L * Math.cos(ang - 0.42), Y - L * Math.sin(ang - 0.42));
    c.lineTo(X - L * Math.cos(ang + 0.42), Y - L * Math.sin(ang + 0.42));
    c.closePath();
    c.fill();
  }

  // Convierte la polilínea en una onda, para la conducción de balón.
  function wavy(pts, amp, len) {
    var out = [], acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      var nx = -dy / d, ny = dx / d, steps = Math.max(1, Math.round(d / 0.16));
      for (var s = 0; s < steps; s++) {
        var f = s / steps, o = Math.sin((acc + d * f) / len * Math.PI * 2) * amp;
        out.push({ x: a.x + dx * f + nx * o, y: a.y + dy * f + ny * o });
      }
      acc += d;
    }
    out.push(pts[pts.length - 1]);
    return out.length > 1 ? out : pts;
  }

  function drawStroke(c, t, st, alpha) {
    if (!st.pts || st.pts.length < 2) return;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    var w = Math.max(1.5, st.width * t.s);

    if (st.tool === 'measure') { drawMeasure(c, t, st); c.restore(); return; }

    if (st.tool === 'zone') {
      var a = st.pts[0], b = st.pts[1];
      var X = Math.min(a.x, b.x) * t.s + t.ox, Y = Math.min(a.y, b.y) * t.s + t.oy;
      var W = Math.abs(b.x - a.x) * t.s, H = Math.abs(b.y - a.y) * t.s;
      c.fillStyle = st.color; c.globalAlpha = (alpha == null ? 1 : alpha) * 0.2;
      roundRect(c, X, Y, W, H, Math.min(14, Math.min(W, H) * 0.16)); c.fill();
      c.globalAlpha = alpha == null ? 1 : alpha;
      c.strokeStyle = st.color; c.lineWidth = Math.max(1.5, w * 0.7);
      c.setLineDash([w * 2.4, w * 1.8]);
      c.stroke();
      c.restore();
      return;
    }

    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = w;
    c.strokeStyle = st.color;
    c.fillStyle = st.color;
    // halo oscuro para que el trazo se lea sobre el césped
    c.save();
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = w + Math.max(2, w * 0.55);
    strokePath(c, t, st.tool === 'dribble' ? wavy(st.pts, 0.42, 1.6) : st.pts);
    c.stroke();
    c.restore();

    if (st.tool === 'run') c.setLineDash([w * 2.2, w * 1.7]);
    strokePath(c, t, st.tool === 'dribble' ? wavy(st.pts, 0.42, 1.6) : st.pts);
    c.stroke();
    c.setLineDash([]);
    if (st.tool !== 'free') arrowHead(c, t, st.pts, st.width);
    c.restore();
  }

  // Regla: distancia real entre dos puntos del campo.
  function drawMeasure(c, t, st) {
    var a = st.pts[0], b = st.pts[st.pts.length - 1];
    var ax = a.x * t.s + t.ox, ay = a.y * t.s + t.oy;
    var bx = b.x * t.s + t.ox, by = b.y * t.s + t.oy;
    var metres = Math.hypot(b.x - a.x, b.y - a.y);
    var ang = Math.atan2(by - ay, bx - ax);
    var tick = Math.max(6, t.s * 0.6);

    c.lineCap = 'butt';
    c.lineWidth = Math.max(2.6, t.s * 0.14);
    c.strokeStyle = 'rgba(0,0,0,.45)';
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    c.lineWidth = Math.max(1.4, t.s * 0.08);
    c.strokeStyle = st.color;
    c.setLineDash([Math.max(5, t.s * 0.5), Math.max(4, t.s * 0.34)]);
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    c.setLineDash([]);

    // topes perpendiculares en los extremos
    var nx = -Math.sin(ang) * tick, ny = Math.cos(ang) * tick;
    c.beginPath();
    c.moveTo(ax - nx, ay - ny); c.lineTo(ax + nx, ay + ny);
    c.moveTo(bx - nx, by - ny); c.lineTo(bx + nx, by + ny);
    c.stroke();

    // etiqueta con la distancia, siempre derecha
    var mx2 = (ax + bx) / 2, my2 = (ay + by) / 2;
    var fs = Math.max(11, t.s * 0.95);
    var txt = (metres < 10 ? metres.toFixed(1) : Math.round(metres)) .toString().replace('.', ',') + ' m';
    c.save();
    c.translate(mx2, my2);
    if (t.rot) c.rotate(-Math.PI / 2);
    c.font = '700 ' + fs + 'px Outfit, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var wlab = c.measureText(txt).width + fs * 0.9;
    c.fillStyle = 'rgba(7,10,15,.85)';
    roundRect(c, -wlab / 2, -fs * 0.8, wlab, fs * 1.6, fs * 0.45); c.fill();
    c.strokeStyle = st.color; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = st.color;
    c.fillText(txt, 0, fs * 0.04);
    c.restore();
  }

  /* =========================================================================
     7. Render
     ====================================================================== */

  var anim = null;       // estado de reproducción
  var recording = false; // grabando vídeo o GIF

  // Arrastrar dispara muchos más eventos que cuadros pinta la pantalla: se agrupan
  // en uno solo por cuadro y así el dedo no va por delante del dibujo.
  var drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  // El campo (césped, franjas, viñeta y todas las líneas) es lo más caro de pintar
  // y no cambia mientras arrastras una ficha: se guarda en un lienzo aparte y se
  // vuelve a calcular sólo si cambia la vista, el zoom o el tamaño de la ventana.
  var pitchLayer = { key: '', cv: null };

  function pitchCanvas() {
    var view = viewRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var key = [doc.pitch, doc.view, CW, CH, T.s, T.ox, T.oy, T.rot, dpr].join('|');
    if (pitchLayer.key === key && pitchLayer.cv) return pitchLayer.cv;

    var cv = pitchLayer.cv || document.createElement('canvas');
    cv.width = Math.max(1, Math.round(CW * dpr));
    cv.height = Math.max(1, Math.round(CH * dpr));
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, CW, CH);
    c.save();
    if (T.rot) { c.translate(CW, 0); c.rotate(Math.PI / 2); }
    drawPitch(c, T, view);
    c.restore();

    pitchLayer.key = key;
    pitchLayer.cv = cv;
    return cv;
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(pitchCanvas(), 0, 0, CW, CH);
    ctx.save();
    if (T.rot) { ctx.translate(CW, 0); ctx.rotate(Math.PI / 2); }

    if (anim) { drawAnimated(); ctx.restore(); return; }

    var f = frame();
    f.strokes.forEach(function (s) { if (s.tool === 'zone') drawStroke(ctx, T, s); });
    f.objects.forEach(function (o) { if (o.kind !== 'player' && o.kind !== 'ball' && o.kind !== 'text') drawObject(ctx, T, o); });
    f.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStroke(ctx, T, s); });
    f.objects.forEach(function (o) { if (o.kind === 'player' || o.kind === 'ball' || o.kind === 'text') drawObject(ctx, T, o); });

    if (drawing) drawStroke(ctx, T, drawing);
    if (ui.multi.length) drawGroup(ctx, T);
    if (ui.sel) drawSelection(ctx, T, byId(ui.sel));
    if (drag && drag.mode === 'marquee') drawMarquee(ctx, T, drag);
    ctx.restore();
  }

  var HANDLE_GAP = 34;   // píxeles entre la pieza y el tirador de giro
  var HANDLE_R = 11;     // radio dibujado; el área sensible es mayor

  // Semi-altura de la pieza, en metros: de ahí cuelga el tirador.
  function objExtent(o) {
    var d = dims(o);
    return d.r != null ? d.r : d.h / 2;
  }

  function drawSelection(c, t, o) {
    if (!o) return;
    var k = dims(o), u = t.s;
    c.save();
    c.translate(o.x * u + t.ox, o.y * u + t.oy);
    c.rotate((o.rot || 0) * Math.PI / 180);
    c.strokeStyle = SEL;
    c.lineWidth = 2;
    c.setLineDash([5, 4]);
    if (k.r != null) {
      c.beginPath(); c.arc(0, 0, k.r * u + 7, 0, 7); c.stroke();
    } else {
      c.strokeRect(-k.w * u / 2 - 6, -k.h * u / 2 - 6, k.w * u + 12, k.h * u + 12);
    }
    c.setLineDash([]);

    if (k.rot) {
      var d = objExtent(o) * u + HANDLE_GAP;
      c.beginPath(); c.moveTo(0, -(objExtent(o) * u + 7)); c.lineTo(0, -d + HANDLE_R); c.stroke();
      c.fillStyle = SEL;
      c.beginPath(); c.arc(0, -d, HANDLE_R, 0, 7); c.fill();
      // icono de giro dentro del tirador
      c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.8; c.lineCap = 'round';
      c.beginPath(); c.arc(0, -d, HANDLE_R * 0.46, 0.5, 5.2); c.stroke();
      c.beginPath();
      c.moveTo(HANDLE_R * 0.16, -d - HANDLE_R * 0.56);
      c.lineTo(HANDLE_R * 0.46, -d - HANDLE_R * 0.34);
      c.lineTo(HANDLE_R * 0.12, -d - HANDLE_R * 0.12);
      c.stroke();
    }
    c.restore();
  }

  // Recuadro que se arrastra sobre el campo para seleccionar varias piezas.
  function drawMarquee(c, t, d) {
    var x = Math.min(d.x0, d.x1) * t.s + t.ox, y = Math.min(d.y0, d.y1) * t.s + t.oy;
    var w = Math.abs(d.x1 - d.x0) * t.s, h = Math.abs(d.y1 - d.y0) * t.s;
    c.save();
    c.fillStyle = 'rgba(255,46,85,.14)';
    c.strokeStyle = SEL;
    c.lineWidth = 1.6;
    c.setLineDash([6, 4]);
    c.fillRect(x, y, w, h);
    c.strokeRect(x, y, w, h);
    c.restore();
  }

  function drawGroup(c, t) {
    c.save();
    c.strokeStyle = SEL;
    c.lineWidth = 2;
    c.setLineDash([4, 4]);
    ui.multi.forEach(function (id) {
      var o = byId(id);
      if (!o) return;
      var k = dims(o), u = t.s;
      c.save();
      c.translate(o.x * u + t.ox, o.y * u + t.oy);
      c.rotate((o.rot || 0) * Math.PI / 180);
      if (k.r != null) { c.beginPath(); c.arc(0, 0, k.r * u + 6, 0, 7); c.stroke(); }
      else c.strokeRect(-k.w * u / 2 - 5, -k.h * u / 2 - 5, k.w * u + 10, k.h * u + 10);
      c.restore();
    });
    c.restore();
  }

  function rotateHandlePos(o) {
    var k = dims(o);
    if (!k || !k.rot) return null;
    var a = (o.rot || 0) * Math.PI / 180;
    var d = (objExtent(o) * T.s + HANDLE_GAP) / T.s;   // en metros, para reutilizar toScreen
    return toScreen(o.x + Math.sin(a) * d, o.y - Math.cos(a) * d);
  }

  /* =========================================================================
     8. Interacción con el puntero
     ====================================================================== */

  var drawing = null, drag = null;
  var pointers = {}, gesture = null;

  // Punto en coordenadas locales (sin deshacer el zoom): sirve para el pellizco.
  function localPoint(e) {
    var r = canvas.getBoundingClientRect();
    var sx = e.clientX - r.left, sy = e.clientY - r.top;
    return T.rot ? { x: sy, y: CW - sx } : { x: sx, y: sy };
  }
  function gestureState() {
    var ids = Object.keys(pointers);
    if (ids.length < 2) return null;
    var a = pointers[ids[0]], b = pointers[ids[1]];
    return {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2
    };
  }

  function byId(id) {
    var a = frame().objects;
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  // Las piezas que se dibujan de pie —cono, pica y banderín— ocupan en pantalla
  // bastante más que su base, así que se dejan tocar con un poco más de margen.
  var DE_PIE = { cone: 1, pole: 1, flag: 1 };

  /* La holgura para acertar con una pieza estaba escrita en METROS de campo, y
     eso la volvía inútil justo cuando más falta hace. Con el campo entero en la
     pantalla de un móvil, 0,35 m son dos o tres píxeles: hay que dar en el
     centro exacto de una pica para poder arrastrarla. Un dedo no apunta así.

     Ahora la holgura tiene además un suelo en PÍXELES DE PANTALLA, que es la
     unidad en la que vive el dedo, y se convierte a metros con la escala del
     momento. Alejado, el margen crece; ampliado, manda la medida en metros y
     las piezas siguen sin robarse el toque unas a otras. */
  var DEDO_PX = 13;                    // radio extra mínimo, en píxeles

  function holguraEnMetros(minimoEnMetros) {
    var enMetros = T.s > 0 ? DEDO_PX / T.s : 0;
    return Math.max(minimoEnMetros, enMetros);
  }

  function hitObject(m) {
    var a = frame().objects;
    for (var i = a.length - 1; i >= 0; i--) {
      var o = a[i], k = dims(o);
      if (k.r != null) {
        var h = holguraEnMetros(DE_PIE[o.kind] ? 0.75 : 0.35);
        if (Math.hypot(m.x - o.x, m.y - o.y) <= k.r + h) return o;
      } else {
        var hc = holguraEnMetros(0.3);
        var ang = -(o.rot || 0) * Math.PI / 180;
        var dx = m.x - o.x, dy = m.y - o.y;
        var lx = dx * Math.cos(ang) - dy * Math.sin(ang);
        var ly = dx * Math.sin(ang) + dy * Math.cos(ang);
        if (Math.abs(lx) <= k.w / 2 + hc && Math.abs(ly) <= k.h / 2 + hc) return o;
      }
    }
    return null;
  }

  function hitStroke(m) {
    var a = frame().strokes;
    for (var i = a.length - 1; i >= 0; i--) {
      var s = a[i];
      if (s.tool === 'zone') {
        var p = s.pts;
        if (m.x >= Math.min(p[0].x, p[1].x) && m.x <= Math.max(p[0].x, p[1].x) &&
            m.y >= Math.min(p[0].y, p[1].y) && m.y <= Math.max(p[0].y, p[1].y)) return s;
        continue;
      }
      for (var j = 1; j < s.pts.length; j++) {
        if (distToSeg(m, s.pts[j - 1], s.pts[j]) < Math.max(0.9, s.width * 2)) return s;
      }
    }
    return null;
  }

  function distToSeg(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function pointer(e) {
    var r = canvas.getBoundingClientRect();
    return toMeters(e.clientX - r.left, e.clientY - r.top);
  }
  function snap(v) { return ui.snap ? Math.round(v * 2) / 2 : v; }

  canvas.addEventListener('pointerdown', function (e) {
    if (ui.playing) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = localPoint(e);

    // Con dos dedos se navega, no se dibuja: se cancela lo que hubiera empezado.
    if (Object.keys(pointers).length === 2) {
      drawing = null;
      drag = null;
      var g = gestureState();
      gesture = { d0: g.d, z0: ui.zoom, cx0: g.cx, cy0: g.cy, px0: ui.panX, py0: ui.panY };
      draw();
      return;
    }
    if (gesture) return;

    var m = pointer(e);

    // colocar material
    if (ui.tool === 'place') {
      placeObject(ui.place, snap(m.x), snap(m.y));
      return;
    }

    if (ui.tool === 'eraser') {
      var s = hitStroke(m);
      if (s) { frame().strokes.splice(frame().strokes.indexOf(s), 1); commit(); draw(); }
      else { var o = hitObject(m); if (o) { removeObject(o); } }
      return;
    }

    if (ui.tool === 'select') {
      // ¿tirador de rotación?
      if (ui.sel) {
        var sel = byId(ui.sel), h = sel && rotateHandlePos(sel);
        if (h) {
          var r = canvas.getBoundingClientRect();
          if (Math.hypot(e.clientX - r.left - h.x, e.clientY - r.top - h.y) < 26) {
            drag = { mode: 'rotate', o: sel };
            hint('Gira la pieza · suelta para fijar');
            return;
          }
        }
      }
      var hit = hitObject(m);
      if (hit && ui.multi.indexOf(hit.id) >= 0) {
        // arrastrar el grupo entero
        drag = {
          mode: 'group', moved: false,
          items: ui.multi.map(function (id) {
            var o = byId(id);
            return o ? { o: o, dx: o.x - m.x, dy: o.y - m.y } : null;
          }).filter(Boolean)
        };
        draw();
        return;
      }
      if (hit) {
        ui.multi = [];
        ui.sel = hit.id;
        drag = { mode: 'move', o: hit, dx: hit.x - m.x, dy: hit.y - m.y, moved: false };
        showInspector(hit);
      } else {
        ui.sel = null;
        ui.multi = [];
        hideInspector();
        drag = { mode: 'marquee', x0: m.x, y0: m.y, x1: m.x, y1: m.y, moved: false };
      }
      draw();
      return;
    }

    // herramientas de dibujo
    drawing = { id: uid(), tool: ui.tool, color: ui.color, width: ui.width, pts: [{ x: m.x, y: m.y }] };
    if (ui.tool === 'zone' || ui.tool === 'measure') drawing.pts.push({ x: m.x, y: m.y });
    draw();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (ui.playing) return;
    if (pointers[e.pointerId]) pointers[e.pointerId] = localPoint(e);

    if (gesture) {
      var g = gestureState();
      if (!g) return;
      ui.panX = gesture.px0 + (g.cx - gesture.cx0);
      ui.panY = gesture.py0 + (g.cy - gesture.cy0);
      var z = clamp(gesture.z0 * (g.d / Math.max(1, gesture.d0)), ZOOM_MIN, ZOOM_MAX);
      var cx = localW() / 2, cy = localH() / 2;
      ui.panX = g.cx - (g.cx - ui.panX - cx) * (z / ui.zoom) - cx;
      ui.panY = g.cy - (g.cy - ui.panY - cy) * (z / ui.zoom) - cy;
      ui.zoom = z;
      applyView();
      return;
    }

    var m = pointer(e);

    if (drag) {
      if (drag.mode === 'marquee') {
        drag.x1 = m.x; drag.y1 = m.y;
        drag.moved = true;
        requestDraw();
        return;
      }
      if (drag.mode === 'group') {
        drag.items.forEach(function (it) {
          it.o.x = clamp(snap(m.x + it.dx), -6, PITCH().L + 6);
          it.o.y = clamp(snap(m.y + it.dy), -6, PITCH().W + 6);
        });
        drag.moved = true;
        requestDraw();
        return;
      }
      if (drag.mode === 'move') {
        drag.o.x = clamp(snap(m.x + drag.dx), -6, PITCH().L + 6);
        drag.o.y = clamp(snap(m.y + drag.dy), -6, PITCH().W + 6);
        drag.moved = true;
        moveInspector(drag.o);
      } else {
        var a = Math.atan2(m.x - drag.o.x, -(m.y - drag.o.y)) * 180 / Math.PI;
        drag.o.rot = ui.snap ? Math.round(a / 15) * 15 : Math.round(a);
        drag.moved = true;
        hint('<b>' + ((drag.o.rot + 360) % 360) + '°</b>');
      }
      requestDraw();
      return;
    }

    if (drawing) {
      if (drawing.tool === 'zone' || drawing.tool === 'measure') {
        drawing.pts[1] = { x: m.x, y: m.y };
      } else {
        var last = drawing.pts[drawing.pts.length - 1];
        if (Math.hypot(m.x - last.x, m.y - last.y) > 0.35) drawing.pts.push({ x: m.x, y: m.y });
      }
      requestDraw();
    }
  });

  function endPointer(e) {
    if (e && e.pointerId != null) delete pointers[e.pointerId];
    if (gesture) {
      if (Object.keys(pointers).length < 2) {
        gesture = null;
        if (ui.zoom <= 1.001) { ui.zoom = 1; ui.panX = 0; ui.panY = 0; applyView(); }
      }
      return;
    }
    if (drag) {
      if (drag.mode === 'marquee') {
        var d0 = drag;
        drag = null;
        if (d0.moved && Math.abs(d0.x1 - d0.x0) > 1 && Math.abs(d0.y1 - d0.y0) > 1) selectInside(d0);
        draw();
        return;
      }
      if (drag.moved) commit();
      if (drag.mode === 'rotate') hint('');
      drag = null;
    }
    if (drawing) {
      var ok = drawing.tool === 'zone'
        ? Math.abs(drawing.pts[1].x - drawing.pts[0].x) > 1 && Math.abs(drawing.pts[1].y - drawing.pts[0].y) > 1
        : drawing.tool === 'measure'
          ? Math.hypot(drawing.pts[1].x - drawing.pts[0].x, drawing.pts[1].y - drawing.pts[0].y) > 1
          : drawing.pts.length > 1;
      if (ok) { frame().strokes.push(drawing); commit(); }
      drawing = null;
      draw();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function selectInside(r) {
    var x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
    var y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    var ids = frame().objects.filter(function (o) {
      return o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
    }).map(function (o) { return o.id; });

    if (ids.length === 1) { ui.multi = []; ui.sel = ids[0]; showInspector(byId(ids[0])); return; }
    ui.multi = ids;
    ui.sel = null;
    if (ids.length) showGroupBar(); else hideInspector();
  }

  function showGroupBar() {
    insp.innerHTML =
      '<span class="name">' + ui.multi.length + ' seleccionados</span><span class="div"></span>' +
      '<button class="ibtn" id="g-dup" aria-label="Duplicar la selección" title="Duplicar">' + icon('copy') + '</button>' +
      '<button class="ibtn danger" id="g-del" aria-label="Eliminar la selección" title="Eliminar">' + icon('trash') + '</button>';
    insp.classList.add('show');
    $('#g-dup', insp).addEventListener('click', function () {
      var copies = ui.multi.map(function (id) {
        var o = byId(id); if (!o) return null;
        var c = clone(o); c.id = uid(); c.x += 3; c.y += 3;
        return c;
      }).filter(Boolean);
      copies.forEach(function (c) { frame().objects.push(c); });
      ui.multi = copies.map(function (c) { return c.id; });
      showGroupBar(); commit(); draw();
    });
    $('#g-del', insp).addEventListener('click', function () {
      var a = frame().objects;
      ui.multi.forEach(function (id) {
        var o = byId(id), i = o ? a.indexOf(o) : -1;
        if (i >= 0) a.splice(i, 1);
      });
      ui.multi = []; hideInspector(); commit(); draw();
    });
    hint('Arrastra cualquiera de las piezas para mover todo el grupo');
  }

  canvas.addEventListener('wheel', function (e) {
    if (ui.playing) return;
    e.preventDefault();
    var p = localPoint(e);
    setZoom(ui.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('dblclick', function (e) {
    var o = hitObject(pointer(e));
    if (o && o.kind === 'text') {
      ask({ title: 'Editar texto', input: o.text || '', ok: 'Guardar' }).then(function (t) {
        if (t === null) return;
        o.text = t; commit(); draw();
      });
    }
  });

  /* =========================================================================
     9. Interfaz
     ====================================================================== */

  function placeObject(spec, x, y) {
    var o = { id: uid(), kind: spec.kind, x: x, y: y, rot: 0 };
    if (spec.kind === 'player') {
      o.team = spec.team;
      o.num = nextNumber(spec.team);
    } else if (spec.kind === 'text') {
      o.text = '';
      o.color = ui.color;
    } else if (spec.kind !== 'ball' && spec.kind !== 'goal' && spec.kind !== 'minigoal' && spec.kind !== 'dummy') {
      o.color = spec.color || null;
    }
    if (spec.kind === 'goal') {
      var P = PITCH();
      o.w = P.goal; o.h = Math.max(1.4, P.goalD);   // la de la modalidad activa
    }
    frame().objects.push(o);
    ui.sel = o.id;
    showInspector(o);
    commit();
    draw();

    if (spec.kind === 'text') {
      ask({ title: 'Texto sobre el campo', input: 'Presión alta', placeholder: 'Escribe aquí', ok: 'Colocar' })
        .then(function (t) {
          if (t === null || t === '') { removeObject(o); return; }
          o.text = t; commit(); draw();
        });
    }
  }

  function nextNumber(team) {
    var used = {};
    frame().objects.forEach(function (o) { if (o.kind === 'player' && o.team === team) used[o.num] = 1; });
    for (var n = 1; n <= 30; n++) if (!used[n]) return n;
    return '';
  }

  function removeObject(o) {
    var a = frame().objects, i = a.indexOf(o);
    if (i < 0) return;
    a.splice(i, 1);
    if (ui.sel === o.id) { ui.sel = null; ui.multi = []; hideInspector(); }
    commit(); draw();
  }

  /* --- inspector flotante --- */
  var insp = $('#inspector');

  function showInspector(o) {
    var k = dims(o);
    var html = '<span class="name">' + esc(k.label) + '</span><span class="div"></span>';

    // El dorsal, el nombre y el texto los escribe el usuario, pero también
    // pueden venir dentro de un ejercicio que ha compartido otro. Se escapan
    // con la misma función que todo lo demás: escapar solo las comillas dejaba
    // pasar los ampersands, y un nombre con «&» se corrompía al reabrirlo.
    if (o.kind === 'player') {
      html += '<input type="text" class="num" id="i-num" value="' + esc(o.num == null ? '' : o.num) + '" aria-label="Dorsal" maxlength="2">';
      html += '<input type="text" id="i-name" value="' + esc(o.name || '') + '" placeholder="Nombre" aria-label="Nombre">';
      html += '<span class="div"></span><span class="mini-sw">';
      ['home', 'away', 'neutral'].forEach(function (t) {
        html += '<button data-team="' + t + '" style="background:' + TEAM[t] + '" aria-label="Equipo ' + t + '" aria-pressed="' + (o.team === t) + '"></button>';
      });
      html += '</span>';
    } else if (o.kind === 'text') {
      html += '<input type="text" id="i-text" value="' + esc(o.text || '') + '" aria-label="Texto">';
    }

    if (k.rot) {
      html += '<span class="div"></span>' +
        '<button class="ibtn" data-rot="-15" aria-label="Girar 15 grados a la izquierda" title="Girar a la izquierda">' + icon('rotL') + '</button>' +
        '<button class="ibtn" data-rot="15" aria-label="Girar 15 grados a la derecha" title="Girar a la derecha">' + icon('rotR') + '</button>' +
        '<button class="ibtn" data-rot="90" aria-label="Girar 90 grados" title="Girar 90°">90°</button>' +
        '<button class="ibtn" data-rot="reset" aria-label="Enderezar" title="Enderezar">0°</button>';
    }

    html += '<span class="div"></span>' +
      '<button class="ibtn" id="i-dup" aria-label="Duplicar">' + icon('copy') + '</button>' +
      '<button class="ibtn" id="i-front" aria-label="Traer al frente">' + icon('front') + '</button>' +
      '<button class="ibtn danger" id="i-del" aria-label="Eliminar">' + icon('trash') + '</button>';

    insp.innerHTML = html;
    insp.classList.add('show');

    var num = $('#i-num', insp);
    if (num) num.addEventListener('input', function () { o.num = this.value.replace(/\D/g, '').slice(0, 2); draw(); });
    if (num) num.addEventListener('change', commit);
    var nm = $('#i-name', insp);
    if (nm) { nm.addEventListener('input', function () { o.name = this.value.slice(0, 14); draw(); }); nm.addEventListener('change', commit); }
    var tx = $('#i-text', insp);
    if (tx) { tx.addEventListener('input', function () { o.text = this.value.slice(0, 28); draw(); }); tx.addEventListener('change', commit); }

    $$('[data-team]', insp).forEach(function (b) {
      b.addEventListener('click', function () {
        o.team = b.dataset.team;
        $$('[data-team]', insp).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        commit(); draw();
      });
    });
    $$('[data-rot]', insp).forEach(function (b) {
      b.addEventListener('click', function () {
        o.rot = b.dataset.rot === 'reset'
          ? 0
          : ((o.rot || 0) + parseInt(b.dataset.rot, 10) + 360) % 360;
        commit(); draw();
      });
    });
    var dup = $('#i-dup', insp);
    if (dup) dup.addEventListener('click', function () {
      var c = clone(o); c.id = uid(); c.x += 2.5; c.y += 2.5;
      frame().objects.push(c); ui.sel = c.id; showInspector(c); commit(); draw();
    });
    var front = $('#i-front', insp);
    if (front) front.addEventListener('click', function () {
      var a = frame().objects, i = a.indexOf(o);
      if (i >= 0) { a.splice(i, 1); a.push(o); commit(); draw(); }
    });
    $('#i-del', insp).addEventListener('click', function () { removeObject(o); });
  }
  function moveInspector() { /* el inspector es fijo arriba: nada que recolocar */ }
  function hideInspector() { insp.classList.remove('show'); insp.innerHTML = ''; }

  function icon(n) {
    var p = {
      rotL: '<path d="M9 4L5 8l4 4"/><path d="M5 8h7a5 5 0 1 1-5 5"/>',
      rotR: '<path d="M11 4l4 4-4 4"/><path d="M15 8H8a5 5 0 1 0 5 5"/>',
      copy: '<rect x="6" y="6" width="9" height="9" rx="2"/><path d="M11 6V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
      front:'<rect x="3" y="3" width="9" height="9" rx="2"/><path d="M8 16h6a2 2 0 0 0 2-2V8"/>',
      trash:'<path d="M3 5h14M8 5V3h4v2M6 5l1 12h6l1-12"/>'
    }[n] || '';
    return '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* --- herramientas --- */
  function setTool(tool, place) {
    ui.tool = tool;
    ui.place = place || null;
    if (tool !== 'select') { ui.sel = null; ui.multi = []; hideInspector(); }
    $$('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === tool && !place); });
    $$('[data-place]').forEach(function (b) {
      b.setAttribute('aria-pressed', !!(place && b.dataset.place === place.kind && (!place.team || b.dataset.team === place.team)));
    });
    canvas.className = tool === 'select' ? 'is-select' : '';
    if (place) hint('Toca el campo para colocar <b>' + KIND[place.kind].label + '</b>'
                    + (window.innerWidth <= 900 ? '' : ' · Esc para salir'));
    else if (tool === 'measure') hint('Arrastra de un punto a otro para medir la distancia');
    else if (tool !== 'select') hint('Arrastra sobre el campo para dibujar');
    else hint('');
    draw();
  }

  /* --- diálogos propios: prompt() y confirm() no funcionan dentro de un iframe --- */
  function ask(opts) {
    return new Promise(function (resolve) {
      var dlg = $('#dlg-ask');
      $('#ask-title', dlg).textContent = opts.title;
      var field = $('#ask-field', dlg);
      var msg = $('#ask-msg', dlg);
      var input = $('#ask-input', dlg);
      // El tipo se pone siempre, no solo cuando se pide: si no, el diálogo se
      // quedaría en «contraseña» para la siguiente vez que se use.
      input.type = opts.tipo || 'text';
      input.setAttribute('autocomplete', opts.tipo === 'password' ? 'new-password' : 'off');
      if (opts.input != null) {
        field.hidden = false;
        // Un campo puede llevar además una explicación encima.
        msg.hidden = !opts.message;
        msg.textContent = opts.message || '';
        input.value = opts.input;
        input.placeholder = opts.placeholder || '';
      } else {
        field.hidden = true;
        msg.hidden = false;
        msg.textContent = opts.message || '';
      }
      var okBtn = $('#ask-ok', dlg);
      okBtn.textContent = opts.ok || 'Aceptar';
      okBtn.classList.toggle('danger', !!opts.danger);

      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        dlg.removeEventListener('close', onClose);
        okBtn.removeEventListener('click', onOk);
        input.removeEventListener('keydown', onKey);
        if (dlg.open) dlg.close();
        resolve(value);
      }
      // Una contraseña no se recorta: un espacio al final es parte de ella.
      function onOk() {
        finish(opts.input == null ? true
               : opts.tipo === 'password' ? input.value : input.value.trim());
      }
      /* El evento «close» no llega en el momento de cerrar, sino un poco
         después. Si mientras tanto se ha vuelto a abrir el diálogo —pedir otra
         vez la contraseña porque la primera era corta, por ejemplo—, ese aviso
         atrasado del diálogo anterior caía sobre el nuevo y lo cerraba recién
         abierto. Si el diálogo está abierto, el aviso es de la vez anterior y
         no va con nosotros. */
      function onClose() { if (dlg.open) return; finish(null); }
      function onKey(e) { if (e.key === 'Enter') { e.preventDefault(); onOk(); } }

      okBtn.addEventListener('click', onOk);
      dlg.addEventListener('close', onClose);
      input.addEventListener('keydown', onKey);
      dlg.showModal();
      if (opts.input != null) setTimeout(function () { input.select(); }, 30);
    });
  }

  var hintTimer;
  function hint(html) {
    var el = $('#hint');
    clearTimeout(hintTimer);
    if (!html) { el.classList.remove('show'); return; }
    el.innerHTML = html;
    el.classList.add('show');
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* --- formaciones --- */
  function applyFormation(name, team) {
    var set = formationSet(), pos = set.pos[name], nums = set.num[name] || [];
    if (!pos) return;
    var P = PITCH(), f = frame();
    f.objects = f.objects.filter(function (o) { return !(o.kind === 'player' && o.team === team); });
    pos.forEach(function (p, i) {
      f.objects.push({
        id: uid(), kind: 'player', team: team,
        x: team === 'home' ? p[0] : P.L - p[0],
        y: team === 'home' ? p[1] : P.W - p[1],
        num: nums[i] != null ? nums[i] : i + 1, rot: 0
      });
    });
    ui.sel = null; ui.multi = []; hideInspector();
    commit(); draw();
    toast('Formación ' + name + ' aplicada · ' + (team === 'home' ? 'local' : 'visitante'));
  }

  /* =========================================================================
     10. Fotogramas y animación
     ====================================================================== */

  function buildFrames() {
    var box = $('#frames');
    box.innerHTML = '';
    doc.frames.forEach(function (f, i) {
      var b = document.createElement('button');
      b.className = 'frame';
      b.textContent = i + 1;
      b.setAttribute('aria-pressed', i === ui.frame);
      b.title = 'Fotograma ' + (i + 1);
      b.addEventListener('click', function () { gotoFrame(i); });
      box.appendChild(b);
    });
    var add = document.createElement('button');
    add.className = 'frame add';
    add.textContent = '+';
    add.title = 'Añadir fotograma (duplica el actual)';
    add.setAttribute('aria-label', 'Añadir fotograma');
    add.addEventListener('click', addFrame);
    box.appendChild(add);
    // Mientras haya un solo fotograma no hay nada que reproducir, así que la
    // barra se encoge y deja el sitio al campo. Lo decide el CSS con esta clase.
    var solo = doc.frames.length < 2;
    $('#play').closest('.timeline').classList.toggle('solo-uno', solo);
    $('#play').disabled = solo;
    $('#delframe').disabled = solo;
  }

  function gotoFrame(i) {
    stop();
    ui.frame = clamp(i, 0, doc.frames.length - 1);
    ui.sel = null; ui.multi = []; hideInspector();
    buildFrames(); draw();
  }
  function addFrame() {
    stop();
    doc.frames.splice(ui.frame + 1, 0, clone(frame()));
    ui.frame++;
    ui.sel = null; ui.multi = []; hideInspector();
    commit(); buildFrames(); draw();
    toast('Fotograma ' + (ui.frame + 1) + ' añadido — mueve las fichas y pulsa reproducir');
  }
  function delFrame() {
    if (doc.frames.length < 2) return;
    stop();
    doc.frames.splice(ui.frame, 1);
    ui.frame = clamp(ui.frame, 0, doc.frames.length - 1);
    ui.sel = null; ui.multi = []; hideInspector();
    commit(); buildFrames(); draw();
  }

  function play() {
    if (doc.frames.length < 2) return;
    ui.playing = true;
    ui.sel = null; ui.multi = []; hideInspector();
    anim = { seg: 0, t0: performance.now() };
    $('#play').innerHTML = icoPause();
    $('#play').setAttribute('aria-label', 'Pausar');
    $('#progress').classList.add('show');
    hint('');
    requestAnimationFrame(tick);
  }
  function stop() {
    if (!ui.playing) return;
    ui.playing = false; anim = null;
    $('#play').innerHTML = icoPlay();
    $('#play').setAttribute('aria-label', 'Reproducir');
    $('#progress').classList.remove('show');
    $('#progress i').style.width = '0%';
    draw();
  }

  function segMs() { return 1500 / ui.speed; }

  function tick(now) {
    if (!ui.playing || !anim) return;
    var d = segMs();
    var t = clamp((now - anim.t0) / d, 0, 2);
    if (t >= 1) {
      anim.seg++;
      anim.t0 = now;
      t = 0;
      if (anim.seg >= doc.frames.length - 1) {
        if (ui.loop) { anim.seg = 0; }
        else {
          ui.frame = doc.frames.length - 1;
          stop(); buildFrames(); draw();
          return;
        }
      }
    }
    anim.t = t;
    var total = (anim.seg + t) / (doc.frames.length - 1);
    $('#progress i').style.width = (total * 100).toFixed(1) + '%';
    draw();
    requestAnimationFrame(tick);
  }

  function drawAnimated() {
    drawAnimatedInto(ctx, T, anim.seg, ease(clamp(anim.t || 0, 0, 1)));
  }

  // Pinta el instante `e` (0..1) del tramo `seg` sobre el lienzo que se le pase.
  // Lo usan tanto la reproducción en pantalla como la grabación de vídeo.
  function drawAnimatedInto(c, t, seg, e) {
    seg = clamp(seg | 0, 0, doc.frames.length - 1);
    var A = doc.frames[seg], B = doc.frames[seg + 1] || A;
    if (!A) return;

    // zonas y trazos: fundido cruzado
    A.strokes.forEach(function (s) { if (s.tool === 'zone') drawStroke(c, t, s, 1 - e); });
    B.strokes.forEach(function (s) { if (s.tool === 'zone') drawStroke(c, t, s, e); });

    var mapB = {};
    B.objects.forEach(function (o) { mapB[o.id] = o; });
    var seen = {};
    var list = [];

    A.objects.forEach(function (a) {
      seen[a.id] = 1;
      var b = mapB[a.id];
      if (b) {
        list.push({ o: mix(a, b, e), alpha: 1, from: a });
      } else {
        list.push({ o: a, alpha: 1 - e });
      }
    });
    B.objects.forEach(function (b) { if (!seen[b.id]) list.push({ o: b, alpha: e }); });

    // estelas de movimiento
    c.save();
    c.lineCap = 'round';
    list.forEach(function (it) {
      if (!it.from || it.o.kind !== 'player' && it.o.kind !== 'ball') return;
      if (Math.hypot(it.o.x - it.from.x, it.o.y - it.from.y) < 0.6) return;
      c.strokeStyle = it.o.kind === 'ball' ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.22)';
      c.lineWidth = Math.max(2, t.s * 0.22);
      c.beginPath();
      c.moveTo(it.from.x * t.s + t.ox, it.from.y * t.s + t.oy);
      c.lineTo(it.o.x * t.s + t.ox, it.o.y * t.s + t.oy);
      c.stroke();
    });
    c.restore();

    list.forEach(function (it) { if (it.o.kind !== 'player' && it.o.kind !== 'ball' && it.o.kind !== 'text') drawObject(c, t, it.o, it.alpha); });
    A.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStroke(c, t, s, 1 - e); });
    B.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStroke(c, t, s, e); });
    list.forEach(function (it) { if (it.o.kind === 'player' || it.o.kind === 'ball' || it.o.kind === 'text') drawObject(c, t, it.o, it.alpha); });
  }

  function mix(a, b, e) {
    var o = clone(a);
    o.x = lerp(a.x, b.x, e);
    o.y = lerp(a.y, b.y, e);
    var r1 = a.rot || 0, r2 = b.rot || 0, d = ((r2 - r1 + 540) % 360) - 180;
    o.rot = r1 + d * e;
    o.num = b.num != null ? b.num : a.num;
    o.name = b.name || a.name;
    o.team = b.team || a.team;
    return o;
  }

  function icoPlay() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>'; }
  function icoPause() { return '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>'; }
  /* El de compartir de toda la vida —la cajita con la flecha saliendo—, que es
     el mismo que enseña el teléfono al pulsar. */
  function icoCompartir() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/>' +
           '<path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
  }

  /* =========================================================================
     Guardar, abrir y exportar
     ====================================================================== */

  // Pinta un fotograma completo en un lienzo nuevo, a la anchura que se pida.
  function renderFrame(index, W) {
    var view = viewRect();
    var vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    var H = Math.round(W * vh / vw);
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var t = transformFor(W, H, view);
    var keepAnim = anim; anim = null;
    drawPitch(c, t, view);
    var f = doc.frames[clamp(index, 0, doc.frames.length - 1)];
    f.strokes.forEach(function (s) { if (s.tool === 'zone') drawStrokeOn(c, t, s); });
    f.objects.forEach(function (o) { if (o.kind !== 'player' && o.kind !== 'ball' && o.kind !== 'text') drawObjectOn(c, t, o); });
    f.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStrokeOn(c, t, s); });
    f.objects.forEach(function (o) { if (o.kind === 'player' || o.kind === 'ball' || o.kind === 'text') drawObjectOn(c, t, o); });
    anim = keepAnim;
    return cv;
  }

  function exportPNG() {
    renderFrame(ui.frame, 2400).toBlob(function (b) {
      download(b, 'pizarra-tactica-' + (ui.frame + 1) + '.png');
    });
  }

  /* =========================================================================
     Ficha del ejercicio
     Un formulario que vive en el documento y se imprime en una página A4
     limpia, con el dibujo de la pizarra arriba y el contenido debajo.
     ====================================================================== */

  function card() {
    if (!doc.card) doc.card = emptyCard();
    return doc.card;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Cada línea del textarea es un punto de la lista.
  function lines(s) {
    return String(s || '').split('\n')
      .map(function (l) { return l.replace(/^\s*[-•·*]\s*/, '').trim(); })
      .filter(Boolean);
  }



  // ---- Leer la pizarra para rellenar la ficha sola ----

  var PLURAL = {
    ball:     ['balón', 'balones'],
    cone:     ['cono', 'conos'],
    disc:     ['chino', 'chinos'],
    goal:     ['portería', 'porterías'],
    minigoal: ['portería pequeña', 'porterías pequeñas'],
    hurdle:   ['valla', 'vallas'],
    ladder:   ['escalera', 'escaleras'],
    pole:     ['pica', 'picas'],
    dummy:    ['maniquí', 'maniquíes'],
    ring:     ['aro', 'aros'],
    flag:     ['banderín', 'banderines']
  };

  // El portero es el jugador más pegado a su línea de gol, dentro del área
  // pequeña y centrado. Como mucho hay uno por portería.
  function countKeepers(players) {
    var P = PITCH();
    var d = P.small ? P.small[0] : P.goal;                  // fondo del área pequeña
    var w = (P.small ? P.small[1] : P.goal + 2) / 2;        // medio ancho
    var n = 0;
    [true, false].forEach(function (izq) {
      var mejor = null;
      players.forEach(function (o) {
        if (Math.abs(o.y - P.W / 2) > w) return;
        var dist = izq ? o.x : P.L - o.x;
        if (dist > d || dist < 0) return;
        if (!mejor || dist < mejor) mejor = dist;
      });
      if (mejor !== null) n++;
    });
    return n;
  }

  // Recorre todos los fotogramas y cuenta cada pieza una sola vez.
  function boardStats() {
    var seen = {}, teams = { home: 0, away: 0, neutral: 0 }, mats = {}, players = [];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;

    function extend(x, y) {
      any = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    doc.frames.forEach(function (f) {
      f.objects.forEach(function (o) {
        extend(o.x, o.y);
        if (seen[o.id]) return;
        seen[o.id] = true;
        if (o.kind === 'player') {
          teams[o.team] = (teams[o.team] || 0) + 1;
          players.push(o);
        } else if (o.kind !== 'text') {
          mats[o.kind] = (mats[o.kind] || 0) + 1;
        }
      });
      f.strokes.forEach(function (s) {
        s.pts.forEach(function (p) { extend(p.x, p.y); });
      });
    });

    return {
      teams: teams, gk: countKeepers(players), mats: mats,
      box: any ? { x0: minX, y0: minY, x1: maxX, y1: maxY } : null
    };
  }

  function statsPlayers(st) {
    var h = st.teams.home, a = st.teams.away, n = st.teams.neutral;
    var out = '';
    if (h && a) out = h + ' vs ' + a;
    else if (h + a) out = (h + a) + ' jugador' + (h + a === 1 ? '' : 'es');
    if (n) out += (out ? ' + ' : '') + n + ' comodín' + (n === 1 ? '' : 'es');
    return out;
  }

  function statsMaterial(st) {
    return Object.keys(PLURAL).filter(function (k) { return st.mats[k]; })
      .map(function (k) {
        var n = st.mats[k];
        return n + ' ' + PLURAL[k][n === 1 ? 0 : 1];
      }).join(', ');
  }

  function statsSpace(st) {
    if (!st.box) return '';
    var P = PITCH();
    var w = Math.round(clamp(st.box.x1 - st.box.x0 + 6, 5, P.L));
    var h = Math.round(clamp(st.box.y1 - st.box.y0 + 6, 5, P.W));
    return w + ' × ' + h + ' m';
  }

  // ---- El formulario ----

  function fieldEl(k) { return document.getElementById('f-' + k); }

  /* Volcar la ficha en sus campos. Ya no abre nada: la ficha vive DENTRO de la
     hoja de guardar, detrás de «Añadir detalles». Se llama al abrir esa hoja. */
  function llenaCampos() {
    var c = card();
    CARD_FIELDS.forEach(function (k) {
      var el = fieldEl(k);
      if (el) el.value = c[k] || '';
    });
    if (!c.fecha) fieldEl('fecha').value = new Date().toLocaleDateString('es-ES');
    if (!c.categoria) fieldEl('categoria').value = prefs().categoria;
    var primero = $('.paso-btn');
    if (primero) primero.click();          // se abre siempre por el primer apartado
  }

  /* «Ficha del ejercicio» lleva al mismo sitio que Guardar, con los detalles ya
     desplegados. Era un diálogo aparte con su propio Guardar: dos puertas al
     mismo sitio, y la de la ficha se saltaba el paso de a quién apuntárselo. */
  function openCard() { saveBoard(true); }

  function readCard() {
    var c = card();
    CARD_FIELDS.forEach(function (k) {
      var el = fieldEl(k);
      if (el) c[k] = el.value.trim();
    });
    return c;
  }

  /* Aquí vivía «saveCard», el segundo camino de guardado: leía la ficha y
     escribía en pt-boards con el título de la ficha, sin pasar por el nombre ni
     por a quién apuntárselo. Ya no existe. Guardar es uno solo, y lo que hacía
     esta función —comprometer lo escrito en la ficha— lo hace «readCard» justo
     antes de guardar. */

  function autofillCard() {
    var st = boardStats(), puesto = 0;
    function set(k, v) {
      var el = fieldEl(k);
      if (!el || !v) return;
      if (el.value.trim()) return;   // no se pisa lo que ya has escrito
      el.value = v; puesto++;
    }
    set('jugadores', statsPlayers(st));
    set('porteros', st.gk ? String(st.gk) : '');
    set('material', statsMaterial(st));
    /* El espacio se MIDE, siempre, esté la pizarra en el encuadre que esté.

       Antes, con la vista en «Completo», se escribía «105 × 68 m» sin mirar:
       un rondo dibujado en el círculo central salía en su ficha pidiendo un
       campo de fútbol entero. Y eso no es un adorno de la ficha: quien mira la
       biblioteca con medio campo disponible lo descarta, y el ejercicio no lo
       hace nadie. El encuadre es cómo se mira el dibujo; lo que ocupa lo dicen
       las piezas. */
    set('espacio', statsSpace(st));
    set('categoria', prefs().categoria);
    set('fecha', new Date().toLocaleDateString('es-ES'));
    toast(puesto ? 'Rellenados ' + puesto + ' campos desde la pizarra' : 'No había nada nuevo que rellenar');
  }

  // ---- La página impresa ----

  // Una hoja A4 montada como una ficha de verdad: cada cosa en su bloque, con
  // sus filetes y su cabecera; márgenes iguales por los cuatro lados; y el
  // cuadro de observaciones creciendo hasta el pie para que la página quede
  // llena en vez de dejar medio folio en blanco.
  var CARD_CSS = [
    '@page{size:A4;margin:14mm}',
    '*{box-sizing:border-box}',
    ':root{--ink:#111821;--soft:#5C6879;--line:#D3DAE4;--hair:#E7ECF2;--wash:#F5F8FA;--acc:#B3082B}',
    'html,body{margin:0;padding:0}',
    'body{font:11.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;',
      'color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    /* en pantalla no hay @page: se simulan los mismos márgenes para ver la hoja tal cual */
    '@media screen{body{padding:14mm;background:#fff}}',

    /* la página como columna: lo que sobra se lo queda el cuadro de notas */
    '.page{min-height:266mm;display:flex;flex-direction:column;gap:10px}',
    '.spine{flex:none;height:4px;border-radius:3px;',
      'background:linear-gradient(90deg,var(--acc),#E11A41 55%,#F6AABA)}',

    /* cabecera */
    'header{flex:none;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;',
      'padding-bottom:12px;border-bottom:1px solid var(--line)}',
    '.eyebrow{display:block;margin-bottom:5px;font-size:8px;font-weight:700;',
      'letter-spacing:.18em;text-transform:uppercase;color:var(--acc)}',
    'h1{margin:0;font-size:23px;line-height:1.14;letter-spacing:-.015em;font-weight:700;text-wrap:balance}',
    '.chips{display:flex;gap:6px;flex:none}',
    '.chip{border:1px solid var(--line);border-radius:7px;padding:7px 12px;background:var(--wash);max-width:44mm}',
    '.chip small{display:block;margin-bottom:1px;font-size:7px;font-weight:700;',
      'letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}',
    '.chip b{display:block;font-size:11px;font-weight:600;line-height:1.3}',

    /* fila superior: esquema grande + datos y objetivo */
    '.top{flex:none;display:grid;grid-template-columns:1.5fr 1fr;gap:10px;align-items:stretch}',
    /* Con campos verticales el marco se ajusta al dibujo, para no dejar dos
       franjas blancas a los lados. */
    '.top.alto{grid-template-columns:auto minmax(0,1fr)}',
    '.top.alto .shot{min-width:50mm}',
    '.top.alto .shot img{flex:none;align-self:center;width:auto;height:86mm}',
    '.shot{margin:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;',
      'border:1px solid var(--line);border-radius:9px;background:#fff}',
    /* el esquema se centra en lo que le toque de alto: así el marco cierra a la
       misma altura que la columna de datos, sin franja blanca suelta al pie */
    '.shot img{display:block;flex:1;min-height:0;width:100%;max-height:86mm;object-fit:contain}',
    '.shot figcaption{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;padding:7px 13px;',
      'border-top:1px solid var(--hair);background:var(--wash);',
      'font-size:8px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}',
    '.side{display:flex;flex-direction:column;gap:10px;min-width:0}',
    '.side .panel{flex:1}',   /* el objetivo llega hasta abajo: las dos columnas casan */

    /* Maqueta ancha: si la ficha tiene poco texto, en vez de dejar medio folio
       de rayas se agranda el esquema a todo el ancho y los datos pasan debajo.
       La elige la propia página midiéndose antes de imprimir. */
    '.page.ancha .top{grid-template-columns:1fr}',
    '.page.ancha .side{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:stretch}',

    /* Maqueta apretada: para una ficha muy llena, antes de partirla en dos
       folios se estrecha el esquema y se recorta el aire, nunca el margen. */
    '.page.compacta{gap:7px}',
    '.page.compacta .top{grid-template-columns:1.24fr 1fr;gap:7px}',
    '.page.compacta .side,.page.compacta .row,.page.compacta .seq{gap:7px}',
    '.page.compacta .pbody{padding:8px 11px}',
    '.page.compacta .panel > h2{padding:5px 11px}',
    '.page.compacta .stat{padding:6px 11px}',
    '.page.compacta .shot figcaption{padding:5px 11px}',
    '.page.compacta .seq figcaption{padding:3px 8px}',
    '.page.compacta .grow{min-height:12mm}',
    '.page.compacta header{padding-bottom:9px}',
    /* Tercer nivel, para las fichas más cargadas: el esquema se estrecha, los
       cuerpos se aprietan y el cuadro de observaciones se reduce al mínimo.
       Sigue siendo legible, y sobre todo sigue cabiendo en un folio. */
    '.page.aprieta{gap:6px}',
    '.page.aprieta .pbody{padding:7px 10px}',
    '.page.aprieta .grow{min-height:9mm}',

    /* los datos, en celdas con filete de un pelo */
    '.stats{flex:none;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);',
      'border:1px solid var(--line);border-radius:9px;overflow:hidden}',
    '.stat{background:#fff;padding:9px 13px;min-width:0}',
    '.stat.w{grid-column:1 / -1}',
    '.stat b{display:block;margin-bottom:2px;font-size:7px;font-weight:700;',
      'letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}',
    '.stat span{display:block;font-size:11.5px;font-weight:600;line-height:1.35;font-variant-numeric:tabular-nums}',

    /* bloques */
    '.panel{display:flex;flex-direction:column;min-width:0;overflow:hidden;background:#fff;',
      'border:1px solid var(--line);border-radius:9px;break-inside:avoid}',
    '.panel > h2{margin:0;padding:7px 13px;background:var(--wash);border-bottom:1px solid var(--hair);',
      'font-size:8px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}',
    '.panel.key{border-color:#EFC6D0}',
    '.panel.key > h2{background:#FDF1F4;border-bottom-color:#F3D8DF}',
    '.pbody{flex:1;padding:11px 13px}',
    '.pbody p{margin:0 0 5px;hyphens:auto}',
    '.pbody p:last-child{margin-bottom:0}',
    '.pbody ol{margin:0;padding:0;list-style:none;counter-reset:i}',
    '.pbody li{counter-increment:i;position:relative;padding-left:15px;margin-bottom:4px;line-height:1.45}',
    '.pbody li:last-child{margin-bottom:0}',
    '.pbody li::before{content:counter(i);position:absolute;left:0;top:0;',
      'font-size:8.5px;font-weight:700;line-height:1.95;color:var(--acc)}',

    '.row{flex:none;display:grid;gap:10px;align-items:stretch}',

    /* secuencia de la jugada */
    '.seq{display:grid;gap:9px}',
    '.seq figure{margin:0;overflow:hidden;border:1px solid var(--hair);border-radius:6px;background:#fff}',
    '.seq img{display:block;width:100%}',
    '.seq figcaption{padding:5px 9px;border-top:1px solid var(--hair);background:var(--wash);',
      'font-size:7.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}',

    /* observaciones: se estira hasta el pie y va rayado para escribir a mano */
    '.grow{flex:1 1 auto;min-height:17mm}',
    '.ruled{background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 22px,',
      'var(--hair) 22px,var(--hair) 23px)}',

    'footer{flex:none;display:flex;justify-content:space-between;align-items:center;gap:12px;',
      'padding-top:9px;border-top:1px solid var(--hair);',
      'font-size:8px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#96A2B2}'
  ].join('');

  function printCard() {
    var c = card();                       // lo que hay guardado, no lo que haya en el formulario
    var P = PITCH(), M = PITCHES[doc.pitch];
    var titulo = c.titulo || 'Ficha del ejercicio';
    var fecha = c.fecha || new Date().toLocaleDateString('es-ES');

    // --- cabecera: identificación a la izquierda, etiquetas a la derecha ---
    var chips = [['Categoría', c.categoria], ['Momento', c.momento], ['Sesión', c.sesion]]
      .filter(function (r) { return r[1]; })
      .map(function (r) {
        return '<span class="chip"><small>' + esc(r[0]) + '</small><b>' + esc(r[1]) + '</b></span>';
      }).join('');

    // --- datos de organización, en celdas ---
    function stat(k, v, ancho) {
      return '<div class="stat' + (ancho ? ' w' : '') + '"><b>' + esc(k) + '</b><span>' + esc(v) + '</span></div>';
    }
    var medias = [['Duración', c.duracion], ['Series', c.series], ['Descanso', c.descanso],
                  ['Jugadores', c.jugadores], ['Porteros', c.porteros], ['Espacio', c.espacio]]
                 .filter(function (r) { return r[1]; });
    var anchas = [['Campo', M.label + ' · ' + P.L + ' × ' + P.W + ' m'], ['Material', c.material]]
                 .filter(function (r) { return r[1]; });
    var datos = medias.map(function (r, i) {
      // una celda suelta al final ocupa la fila entera, para no dejar un hueco
      return stat(r[0], r[1], i === medias.length - 1 && medias.length % 2 === 1);
    }).concat(anchas.map(function (r) { return stat(r[0], r[1], true); })).join('');

    // --- bloques de contenido ---
    function panel(title, inner, cls) {
      return inner ? '<section class="panel' + (cls ? ' ' + cls : '') + '"><h2>' + title + '</h2>' +
        '<div class="pbody">' + inner + '</div></section>' : '';
    }
    function ol(txt) {
      var it = lines(txt);
      return it.length ? '<ol>' + it.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ol>' : '';
    }
    function pp(txt) {
      var t = String(txt || '').trim();
      return t ? '<p>' + esc(t).replace(/\n+/g, '</p><p>') + '</p>' : '';
    }

    // --- el esquema ---
    var pie = doc.frames.length > 1
      ? ['Esquema · fotograma ' + (ui.frame + 1) + ' de ' + doc.frames.length, M.label]
      : ['Esquema del ejercicio', M.label];
    var vr = viewRect();
    var encuadreAlto = (vr.y1 - vr.y0) / (vr.x1 - vr.x0) > 1.02;
    var shot = '<figure class="shot"><img src="' + renderFrame(ui.frame, 1400).toDataURL('image/png') +
      '" alt="Esquema del ejercicio"><figcaption><span>' + esc(pie[0]) + '</span><span>' +
      esc(pie[1]) + '</span></figcaption></figure>';

    // --- consignas, normas y variantes, a tantas columnas como haya ---
    var bloques = [panel('Consignas', ol(c.consignas)), panel('Normas', ol(c.normas)),
                   panel('Variantes y progresiones', ol(c.variantes))].filter(Boolean);
    var fila = bloques.length
      ? '<div class="row" style="grid-template-columns:repeat(' + bloques.length + ',1fr)">' +
        bloques.join('') + '</div>'
      : '';

    // --- secuencia de la jugada, si tiene varios fotogramas ---
    var otros = doc.frames.map(function (f, i) { return i; })
      .filter(function (i) { return i !== ui.frame; }).slice(0, 8);
    var seq = otros.length ? panel('Secuencia de la jugada',
      '<div class="seq" style="grid-template-columns:repeat(' + Math.min(otros.length, 4) + ',1fr)">' +
      otros.map(function (i) {
        return '<figure><img src="' + renderFrame(i, 620).toDataURL('image/png') +
          '" alt="Fotograma ' + (i + 1) + '"><figcaption>Fotograma ' + (i + 1) + '</figcaption></figure>';
      }).join('') + '</div>') : '';

    imprime(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
      '<title>' + esc(titulo) + '</title><style>' + CARD_CSS + '</style></head><body><div class="page">' +
      '<div class="spine"></div>' +
      '<header><div><span class="eyebrow">Ficha de entrenamiento · ' + esc(fecha) + '</span>' +
      '<h1>' + esc(titulo) + '</h1></div>' +
      (chips ? '<div class="chips">' + chips + '</div>' : '') + '</header>' +
      '<div class="top' + (encuadreAlto ? ' alto' : '') + '">' + shot + '<div class="side">' +
      (datos ? '<div class="stats">' + datos + '</div>' : '') +
      panel('Objetivo', pp(c.objetivo), 'key') +
      '</div></div>' +
      panel('Descripción y desarrollo', pp(c.descripcion)) +
      fila + seq +
      '<section class="panel grow"><h2>Observaciones</h2><div class="pbody ruled"></div></section>' +
      '<footer><span>Klym</span><span>' + esc(fecha) + '</span></footer>' +
      '</div></body></html>',
      encajarCard);
  }

  // La hoja se mide a sí misma y elige maqueta. Si sobra más de un palmo de
  // folio, se va a la ancha (esquema a todo el ancho); si no cabe, a la
  // apretada. Los márgenes no se tocan en ningún caso.
  /* -------------------------------------------------------------------------
     Imprimir sin ventana emergente.

     Abrir una pestaña nueva parecía lo natural, pero lo bloquean el iPhone, los
     navegadores que van dentro de otra aplicación y los marcos con permisos
     recortados: allí el botón no hacía nada. Se imprime desde un iframe oculto
     del propio documento, que funciona en todos ellos y además le da a la hoja
     un ancho de folio exacto, así que la maqueta se mide siempre igual.

     Si hasta eso está capado, queda el último recurso: enseñar la hoja dentro
     de la aplicación para que se pueda imprimir o guardar desde el navegador.
     ------------------------------------------------------------------------- */
  var marcoImpresion = null;

  function imprime(html, antes) {
    if (marcoImpresion && marcoImpresion.parentNode) marcoImpresion.parentNode.removeChild(marcoImpresion);
    var m = document.createElement('iframe');
    marcoImpresion = m;
    m.setAttribute('aria-hidden', 'true');
    m.setAttribute('title', 'Hoja para imprimir');
    // Tamaño de folio: así lo que se mide es lo que se imprime.
    m.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:0;' +
                      'visibility:hidden';
    document.body.appendChild(m);

    var win = m.contentWindow;
    try {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (e) { verHoja(html); return; }

    // Hay que esperar a que las imágenes estén dentro: la hoja se mide a sí
    // misma para elegir maqueta, y midiéndola sin el dibujo salen las cuentas
    // mal y se va a dos páginas.
    esperaImagenes(win, function () {
      // Si el navegador abre el diálogo de impresión avisa antes; es la única
      // manera de saber si la llamada ha servido de algo o la han ignorado.
      var arranco = false;
      var apunta = function () { arranco = true; };
      try {
        if (antes) antes(win);
        win.addEventListener('beforeprint', apunta);
        window.addEventListener('beforeprint', apunta);
        win.focus();
        win.print();
      } catch (e) {}

      setTimeout(function () {
        window.removeEventListener('beforeprint', apunta);
        if (!arranco) verHoja(html);          // aquí no se puede imprimir solo
        // El marco se queda un rato: quitarlo antes de tiempo corta la
        // impresión a medias en algunos navegadores.
        setTimeout(function () {
          if (m.parentNode) m.parentNode.removeChild(m);
          if (marcoImpresion === m) marcoImpresion = null;
        }, 60000);
      }, 1200);
    });
  }

  // Llama de vuelta cuando todas las imágenes de la hoja están cargadas, o al
  // segundo y medio como mucho: más vale imprimir algo que no imprimir nada.
  function esperaImagenes(win, sigue) {
    var listo = false;
    function ya() { if (listo) return; listo = true; setTimeout(sigue, 60); }
    var tope = setTimeout(ya, 1500);
    try {
      var imgs = [].slice.call(win.document.images);
      var faltan = imgs.filter(function (i) { return !i.complete; }).length;
      if (!faltan) { clearTimeout(tope); ya(); return; }
      imgs.forEach(function (i) {
        if (i.complete) return;
        var hecho = function () {
          if (--faltan <= 0) { clearTimeout(tope); ya(); }
        };
        i.addEventListener('load', hecho);
        i.addEventListener('error', hecho);
      });
    } catch (e) { clearTimeout(tope); ya(); }
  }

  // Último recurso: la hoja dentro de la aplicación, para verla y poder
  // imprimirla o guardarla con el botón del propio navegador.
  function verHoja(html) {
    var d = $('#dlg-hoja');
    if (!d) { toast('Este navegador no deja imprimir desde aquí'); return; }
    $('#hoja-marco').srcdoc = html;
    if (!d.open) d.showModal();
  }

  function encajarCard(win) {
    try {
      var pg = win.document.querySelector('.page');
      if (!pg) return;
      var alto = function () {                       // alto real del contenido
        var previo = pg.style.minHeight;
        pg.style.minHeight = '0';
        var h = pg.getBoundingClientRect().height;
        pg.style.minHeight = previo;
        return h;
      };
      // el hueco útil es el alto de la caja de impresión, no el de la caja ya
      // estirada: hay que leerlo del min-height, que es lo que cabe en el folio
      var folio = parseFloat(win.getComputedStyle(pg).minHeight) || 0;
      if (!folio) return;

      if (alto() > folio) {
        // Se aprieta por pasos y se comprueba que cada paso ha servido: antes
        // se daba por buena la primera maqueta y las fichas más cargadas se
        // iban a una segunda página con cuatro líneas sueltas.
        pg.classList.add('compacta');
        if (alto() > folio) pg.classList.add('aprieta');
        if (alto() > folio) recortaImagenes(pg, alto, folio);
        return;
      }
      if (folio - alto() < 230) return;              // ya está bastante llena
      pg.classList.add('ancha');
      if (alto() > folio) pg.classList.remove('ancha');
    } catch (e) {}
  }

  // Último ajuste, y el más fino: en vez de encoger la ficha entera a ojo con
  // otra clase, se mide lo que sobra y se le quita exactamente eso al dibujo.
  // Así el esquema se queda lo más grande que quepa, no lo más pequeño.
  function recortaImagenes(pg, alto, folio) {
    var seq = [].slice.call(pg.querySelectorAll('.seq img'));
    var shot = pg.querySelector('.shot img');
    function encoge(img, suelo) {
      for (var i = 0; i < 4 && alto() > folio; i++) {
        var h = img.getBoundingClientRect().height;
        var nuevo = Math.max(suelo, h - (alto() - folio) - 4);
        if (nuevo >= h) break;
        img.style.maxHeight = nuevo + 'px';
        if (nuevo === suelo) break;
      }
    }
    // primero la secuencia, que es lo accesorio; después el esquema principal
    seq.forEach(function (i) { if (alto() > folio) encoge(i, 60); });
    if (shot && alto() > folio) encoge(shot, 150);
  }

  /* =========================================================================
     Catálogo de ejercicios
     Ya no vive escrito aquí dentro, sino en assets/biblioteca.json, para que
     pueda crecer sin volver a publicar la aplicación. Se carga al arrancar,
     se guarda una copia en el navegador y, sin conexión, se usa esa copia.
     Las versiones de un solo archivo lo traen incrustado.
     ====================================================================== */

  var CATALOGO = [];
  var catalogoInfo = { fecha: '', ejercicios: 0, deCache: false };

  function aplicaCatalogo(datos, deCache) {
    if (!datos || !datos.ejercicios || !datos.ejercicios.length) return false;
    CATALOGO = datos.ejercicios.filter(function (e) {
      return e && e.id && PITCHES[e.pitch] && e.card && e.objects;
    });
    catalogoInfo = { fecha: datos.actualizado || '', ejercicios: CATALOGO.length, deCache: !!deCache };
    return true;
  }

  // '2026-09-10' se lee mejor como '10/9/2026'
  function fechaCorta(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[3]) + '/' + Number(m[2]) + '/' + m[1] : iso;
  }

  function cacheCatalogo(datos) {
    try { localStorage.setItem('pt-catalogo', JSON.stringify(datos)); } catch (e) {}
  }
  function leeCacheCatalogo() {
    try { return JSON.parse(localStorage.getItem('pt-catalogo') || 'null'); } catch (e) { return null; }
  }

  // Primero lo que ya tengamos (incrustado o en caché) para no arrancar en
  // blanco, y después se intenta traer la versión de la red.
  function cargaCatalogo() {
    var yaHay = false;
    if (typeof window !== 'undefined' && window.__BIBLIOTECA__) {
      yaHay = aplicaCatalogo(window.__BIBLIOTECA__, false);
    }
    /* Si el catálogo viene incrustado en la propia página —el archivo único,
       que se abre a doble clic y sin servidor—, no hay red a la que ir: esa
       petición no puede salir bien nunca y lo único que deja es un error en la
       consola. En el sitio de verdad no se incrusta, así que allí se sigue
       pidiendo la versión nueva como siempre. */
    if (yaHay && typeof window !== 'undefined' && window.__BIBLIOTECA__) {
      return Promise.resolve();
    }
    if (!yaHay) yaHay = aplicaCatalogo(leeCacheCatalogo(), true);

    if (typeof fetch !== 'function') return Promise.resolve();
    return fetch('../assets/biblioteca.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var actual = leeCacheCatalogo();
        if (!yaHay || !actual || (d.version || 0) >= (actual.version || 0)) {
          if (aplicaCatalogo(d, false)) {
            cacheCatalogo(d);
            llenaSelectorPlantillas();
            if ($('#dlg-lib') && $('#dlg-lib').open) pintaBiblioteca();
          }
        }
      })
      .catch(function () {});
  }
;

  /* =========================================================================
     La nube
     La biblioteca compartida vive en Supabase. Si no está configurada —o si
     no hay conexión— nada de esto se nota: la pizarra sigue con su catálogo
     y con lo que hayas guardado en este dispositivo.
     ====================================================================== */

  var nube = window.PTNube || null;
  var hayNube = !!(nube && nube.hay());
  /* La sincronización entre dispositivos. Va aparte de «nube» a propósito:
     aquella habla con el servidor y esta decide cuándo y con qué. Si no está
     —el archivo suelto, un navegador sin WebCrypto—, la aplicación funciona
     igual que siempre, cada dispositivo con lo suyo. */
  var sincro = (window.PTSincro && window.PTSincro.hay()) ? window.PTSincro : null;
  // Abrir el diálogo de la cuenta. Lo rellena el arranque; aquí solo se
  // declara para que lo alcancen los que están fuera de esa función.
  var abreCuenta = function () {};
  // Lo mismo con los ajustes: los arma el arranque y los abre el cajón.
  var abreLosAjustes = function () {};
  var nubeLista = [];                 // lo que ha compartido cualquiera
  var nubeMios  = [];                 // los tuyos, compartidos o no
  var yo = null;                      // sin cuentas: nadie firma en el servidor
  var nubeEstado = { cargando: false, error: '' };

  // Una fila del servidor con la misma forma que el resto de la biblioteca.
  function itemDeFila(fila, origen) {
    var c = emptyCard();
    CARD_FIELDS.forEach(function (k) { if (fila.ficha && fila.ficha[k]) c[k] = fila.ficha[k]; });
    var quien = fila.entrenadores || {};
    return {
      id: origen + ':nube:' + fila.id, origen: origen, fuente: 'nube',
      nombre: fila.titulo, pitch: fila.pitch, card: c, doc: fila.doc,
      fila: fila, autor: quien.nombre || '', club: quien.club || '',
      mio: !!(yo && fila.autor === yo.id), publicado: !!fila.publicado
    };
  }

  // Se pide al servidor lo mismo que se está filtrando en pantalla, para no
  // traerse la biblioteca entera cuando crezca.
  function cargaNube() {
    if (!hayNube) return Promise.resolve();
    nubeEstado = { cargando: true, error: '' };
    pintaBiblioteca();

    var f = libFiltros;
    var tarea = libFiltros.origen === 'mia'
      ? nube.mios().then(function (filas) {
          nubeMios = (filas || []).map(function (r) { return itemDeFila(r, 'mia'); });
        })
      : nube.lista(f, 0, 60).then(function (filas) {
          nubeLista = (filas || []).map(function (r) { return itemDeFila(r, 'catalogo'); });
        });

    return tarea.then(function () {
      nubeEstado = { cargando: false, error: '' };
      pintaBiblioteca();
    }).catch(function (e) {
      nubeEstado = { cargando: false, error: e && e.message ? e.message : 'Sin conexión' };
      pintaBiblioteca();
    });
  }

  /* Las iniciales para el hueco de la barra: dos como mucho, y si no hay
     nombre, la primera letra del correo. Nunca vacío —un círculo en blanco
     parece que se ha roto algo—. */
  function inicialesDe(p) {
    var n = String((p && p.nombre) || '').trim();
    if (n) {
      var trozos = n.split(/\s+/).filter(Boolean);
      return (trozos[0][0] + (trozos.length > 1 ? trozos[trozos.length - 1][0] : ''))
               .toUpperCase();
    }
    var c = String((p && p.email) || '').trim();
    return c ? c[0].toUpperCase() : '?';
  }

  function pintaCuenta() {
    if (!$('#cuenta-fuera')) return;
    var dentro = !!yo;
    $('#cuenta-fuera').hidden = dentro;
    $('#cuenta-dentro').hidden = !dentro;
    if (dentro) {
      $('#cuenta-correo').textContent = yo.email || '';
      $('#cuenta-nombre').value = yo.nombre || '';
      $('#cuenta-club').value = yo.club || '';
    }
    pintaSincro();

    /* El botón de la barra dice de un vistazo si estás dentro: con la sesión
       abierta enseña tus iniciales sobre el color de la casa; sin ella, una
       silueta y la palabra «Entrar». Antes no había manera de saberlo sin
       abrir Ajustes y bajar hasta el final. */
    var btn = $('#cuenta-btn');
    if (btn) {
      var txt = $('#cuenta-btn-txt'), ini = $('#cuenta-ini');
      /* La silueta y las iniciales están las dos puestas y las turna el CSS con
         esta clase. Se hace así, y no escondiéndolas desde aquí, porque
         «hidden» es de los elementos HTML y el icono es un SVG: ponérselo desde
         JavaScript no lo esconde, crea una propiedad que no mira nadie. */
      btn.classList.toggle('dentro', dentro);
      if (dentro) {
        ini.textContent = inicialesDe(yo);
        txt.textContent = yo.nombre ? yo.nombre.split(/\s+/)[0] : 'Tu cuenta';
        btn.title = 'Tu cuenta · ' + (yo.email || '');
        btn.setAttribute('aria-label', 'Tu cuenta, ' + (yo.email || 'has entrado'));
      } else {
        txt.textContent = 'Entrar';
        btn.title = 'Entrar o crear una cuenta';
        btn.setAttribute('aria-label', 'Entrar o crear una cuenta');
      }
    }
    // Y la fila de Ajustes, que lleva al mismo sitio, dice lo mismo.
    var fila = $('#cfg-cuenta-txt');
    if (fila) fila.textContent = dentro ? (yo.email || 'Tu cuenta') : 'Entrar o crear una cuenta';

    /* Y la del panel, que en el móvil es la única que lleva la palabra escrita:
       arriba no cabe y se queda en una silueta que nadie relaciona con entrar. */
    var enPanel = $('#cuenta-row-txt');
    if (enPanel) {
      enPanel.textContent = dentro
        ? 'Tu cuenta · ' + (yo.nombre ? yo.nombre.split(/\s+/)[0] : (yo.email || ''))
        : 'Entrar con tu correo';
    }
  }

  /* Pedir una contraseña nueva. Lo usan los dos caminos: el de «cambiarla»
     desde Ajustes y el de volver del enlace de «he olvidado la contraseña».
     En este segundo caso es importante que la escriba de verdad: el enlace del
     correo es la única llave que tiene en ese momento y caduca. */
  function pideClaveNueva(mensaje) {
    return ask({ title: 'Contraseña nueva', message: mensaje, input: '', tipo: 'password',
                 placeholder: 'Mínimo 6 caracteres', ok: 'Guardar' })
      .then(function (clave) {
        if (clave === null) return false;                 // ha cerrado el diálogo
        if (String(clave).length < 6) {
          toast('La contraseña tiene que tener al menos 6 caracteres');
          return pideClaveNueva(mensaje);                 // se vuelve a pedir
        }
        return nube.cambiaClave(clave)
          .then(function () {
            /* Y volver a envolver el cofre con la contraseña nueva. Si esto no
               se hiciera, los datos del equipo se quedarían cerrados con la
               vieja y el siguiente dispositivo que entrara no los abriría: la
               contraseña serviría para la cuenta y no para lo de dentro. */
            if (!sincro || !sincro.abierto()) return;
            return sincro.alCambiarContraseña(clave).then(function (r) {
              if (!r.ok) {
                toast('Contraseña cambiada, pero los datos del equipo se han quedado ' +
                      'con la anterior. Vuelve a entrar para arreglarlo.');
              }
            }, function () {});
          })
          .then(function () { toast('Contraseña cambiada. Ya puedes entrar con ella'); return true; })
          .catch(function (e) { toast('No se ha podido: ' + (e.message || 'error')); return false; });
      });
  }

  /* ---- lo que la sincronización tiene que contar -------------------------

     Tres cosas, y ninguna es un tecnicismo:

       Que el cofre no se ha podido abrir. Eso significa que los datos que hay
       en el servidor están cerrados con otra contraseña, y hay que decir qué
       hacer, no soltar un error.

       Que ha llegado algo nuevo de otro dispositivo, para repintar. Sin esto,
       los datos entran y la pantalla sigue enseñando lo de antes: parece que
       no ha pasado nada y luego «se ha borrado solo» al recargar.

       Que dos dispositivos cambiaron lo mismo y ha habido que elegir. Esto no
       se puede callar: alguien perdió un cambio y tiene derecho a saber
       cuál. */

  function avisaDelCofre(r) {
    if (!r || r.ok) {
      if (r && r.reenvuelto) {
        toast('Tus datos del equipo ya van con la contraseña nueva');
      }
      return;
    }
    if (r.porque === 'cerrado') {
      toast('Tus datos del equipo están guardados con otra contraseña. Entra con la que ' +
            'usaste la última vez, o en el dispositivo donde ya habías entrado.');
    } else if (r.porque === 'a-la-vez') {
      toast('Otro dispositivo estaba cambiando lo mismo. Vuelve a intentarlo.');
    } else if (r.porque === 'sin-red' && r.error) {
      /* Al entrar sí se dice, una vez: acaba de escribir su contraseña
         esperando encontrarse su equipo, y si el servidor no contesta tiene
         que saberlo. Los baches de después se los traga la sincronización,
         que reintenta sola. */
      toast(r.error);
    }
  }

  /* Los avisos que hay junto a la plantilla y junto a los partidos. Decían
     «los nombres se quedan en este dispositivo», y eso deja de ser verdad en
     cuanto alguien enciende la sincronización. Un aviso de privacidad que
     miente es peor que no tenerlo: la gente decide fiándose de él. */
  function pintaPrivacidadDelEquipo() {
    /* Con cuenta, la plantilla va con la cuenta; sin cuenta, se queda aquí.
       Es la única diferencia que hay, y es la que hay que contar. */
    var conCuenta = !!(sincro && yo);
    var a = $('#squad-aviso'), b = $('#par-aviso');
    if (a) {
      a.textContent = conCuenta
        ? 'Los nombres van con tu cuenta, cifrados en este dispositivo antes de salir: en el ' +
          'servidor son un bloque que no puede abrir nadie más. No se suben a la biblioteca ' +
          'común, no viajan en los enlaces y no aparecen en la pizarra.'
        : 'Los nombres se quedan en este dispositivo. No se suben a la biblioteca común, no ' +
          'viajan en los enlaces y no aparecen en la pizarra.';
    }
    if (b) {
      b.textContent = conCuenta
        ? 'Los nombres y lo que hizo cada uno van con tu cuenta, cifrados antes de salir de ' +
          'aquí. No se suben a la biblioteca común ni viajan en los enlaces.'
        : 'Los nombres y lo que hizo cada uno se quedan en este dispositivo. No se suben a ' +
          'la biblioteca común ni viajan en los enlaces.';
    }
  }

  /* «Todo se queda en este dispositivo» era una coletilla repetida en cuatro
     pantallas. Ahora depende de un interruptor, así que se dice en un sitio y
     las cuatro preguntan. Cuatro copias de una frase es una frase que algún
     día dirá cosas distintas en cada pantalla. */
  function dondeSeQueda() {
    return (sincro && yo)
      ? ' Va con tu cuenta, cifrado antes de salir de aquí.'
      : ' Todo se queda en este dispositivo.';
  }

  function pintaSincro() {
    pintaPrivacidadDelEquipo();
    var caja = $('#cuenta-sincro');
    if (!caja) return;
    caja.hidden = !(sincro && yo);
    if (caja.hidden) return;
    var e = sincro.estado(), t = $('#cuenta-sincro-estado');
    t.textContent =
        e.estado === 'cerrado' ? 'No se están guardando: lo que hay en tu cuenta está cerrado ' +
          'con otra contraseña. Cierra sesión y entra con la que usaste la última vez.'
      : e.estado === 'pendiente' || e.estado === 'sin-red' ? 'Sin conexión. Se guardarán en cuanto vuelva.'
      : e.estado === 'sincronizando' ? 'Guardando…'
      : e.cuando ? 'Al día.'
      : 'Se guardan al entrar y cada vez que cambias algo.';
  }

  function cuentaLosChoques(ch) {
    var QUE = { jugador: 'un jugador', sesion: 'una sesión',
                asistencia: 'una lista de asistencia', partido: 'un partido' };
    var uno = QUE[ch[0].qué] || 'algo';
    toast(ch.length === 1
      ? 'Habías cambiado ' + uno + ' (' + ch[0].clave + ') en dos dispositivos. Se ha ' +
        'quedado lo último que guardaste.'
      : ch.length + ' cosas habían cambiado en dos dispositivos. Se ha quedado lo último ' +
        'que guardaste de cada una.');
  }

  /* Repintar cuando llega algo de otro dispositivo. Con una precaución: si hay
     un campo con el foco, la persona está escribiendo, y repintar le quitaría
     de las manos lo que está a medio escribir. Se espera a que suelte. */
  var relojRepinte = null;
  function repintaElEquipo() {
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
      clearTimeout(relojRepinte);
      relojRepinte = setTimeout(repintaElEquipo, 2000);
      return;
    }
    if (!window.PTEquipo) return;
    pintaApartadoPlantilla();
    pintaSesiones();
    pintaDiario();
    pintaPartidos();
    pintaStats();
    pintaHoy();
    pistasDelCajon();
  }

  // Quién eres, para saber qué puedes hacer.
  function refrescaCuenta() {
    if (!hayNube) return Promise.resolve(null);
    return nube.quienSoy().then(function (p) { yo = p; pintaCuenta(); return p; });
  }

  // Lo que dice la ayuda sobre la privacidad tiene que ser verdad en los dos
  // casos: con biblioteca común y sin ella.
  function pintaPrivacidad() {
    var p = $('#help-privacidad');
    if (!p) return;
    p.textContent = !hayNube
      ? 'Todo se guarda en tu dispositivo: nada viaja a ningún servidor.'
      : 'Tus pizarras se guardan en este dispositivo. Al servidor solo va lo que compartes ' +
        'a propósito y, si entras, tu correo para reconocerte. Tu correo no lo ve nadie más.' +
        (sincro
          ? ' Los datos de tu equipo van con tu cuenta, pero cifrados desde aquí: en el ' +
            'servidor son un bloque que no puede abrir nadie más.'
          : ' Los datos de tu equipo no salen de este dispositivo.');
  }

  // Compartir la pizarra que tienes abierta.
  // El ejercicio en el mismo formato que assets/biblioteca.json, listo para
  // entrar en la biblioteca común tal cual, sin tener que traducir nada.
  function paqueteEjercicio() {
    var c = doc.card || emptyCard(), f = doc.frames[ui.frame] || doc.frames[0];
    var ficha = {};
    CARD_FIELDS.forEach(function (k) { if (c[k]) ficha[k] = c[k]; });
    return {
      id: sinAcentos(c.titulo || 'ejercicio').replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '').slice(0, 40) || 'ejercicio',
      pitch: doc.pitch, view: doc.view, card: ficha,
      autor: (yo && yo.nombre) || '', club: (yo && yo.club) || '',
      objects: clone(f.objects), strokes: clone(f.strokes || [])
    };
  }

  // Sin servidor todavía, compartir es esto: dejar el ejercicio preparado para
  // que salga del dispositivo. Se manda con la hoja de compartir del móvil, o
  // se copia, o se enseña para copiarlo a mano. Cuando haya base de datos,
  // este camino se queda como el de siempre para quien no tenga cuenta.
  function comparteSinNube() {
    var texto = JSON.stringify(paqueteEjercicio(), null, 1);
    var titulo = doc.card.titulo;
    var nota = 'Ejercicio para la biblioteca común: ' + titulo;

    function alPortapapeles() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(
          function () { toast('Copiado. Pégalo donde quieras mandarlo'); },
          function () { aMano(); });
      } else aMano();
    }
    function aMano() {
      showFile(new Blob([texto], { type: 'application/json' }), titulo + '.json');
      var n = $('#file-note');
      if (n) n.textContent = 'Este es tu ejercicio listo para la biblioteca común. ' +
                             'Cópialo y mándaselo a quien la mantiene.';
    }

    if (navigator.share) {
      navigator.share({ title: nota, text: texto })
        .catch(function (e) { if (!e || e.name !== 'AbortError') alPortapapeles(); });
      return;
    }
    alPortapapeles();
  }

  /* -------------------------------------------------------------------------
     Mandar la jugada por enlace.

     La jugada va dentro del propio enlace, detrás del #: sin cuenta, sin
     servidor, sin caducidad y sin que la jugada salga de los dos dispositivos
     —lo que va detrás del # ni se manda al abrir la dirección—. Quien lo recibe
     pincha y le sale la jugada montada, con su ficha.

     Se manda lo que haya en la pizarra, o —desde la biblioteca— el ejercicio
     que se señale, sin tener que abrirlo antes.
     ---------------------------------------------------------------------- */
  /* El enlace se va preparando al apoyar el dedo, antes de soltarlo.

     No es un capricho: armar el enlace lleva su milisegundo, y Safari solo deja
     abrir la hoja de compartir del teléfono si se le pide en el mismo gesto del
     usuario, no después de esperar a nada. Preparándolo en el «pointerdown»,
     cuando llega el «click» ya está hecho y la hoja se abre. Si no diera tiempo,
     se sigue por el camino de siempre y, como mucho, el enlace se copia. */
  var enlaceEnCamino = null;
  function preparaEnlace(jugada) {
    if (!window.PTEnlace) return;
    var mio = enlaceEnCamino = { jugada: jugada, url: null };
    PTEnlace.direccion(jugada).then(function (url) {
      if (enlaceEnCamino === mio) mio.url = url;
    }, function () { if (enlaceEnCamino === mio) enlaceEnCamino = null; });
  }

  function enviaPorEnlace(cual, comoSeLlama) {
    if (!window.PTEnlace) { toast('Este navegador no puede hacer el enlace'); return; }
    var jugada = cual || doc;
    var titulo = comoSeLlama || (jugada.card && jugada.card.titulo || '').trim();

    function conLaDireccion(url) {
      if (url.length > PTEnlace.comodo) {
        /* Un enlace muy largo lo abre bien el navegador, pero algunas
           aplicaciones de mensajería lo parten por la mitad y llega roto. Se
           avisa y se deja decidir, que para eso es su jugada. */
        ask({
          title: 'El enlace sale muy largo',
          message: 'Esta jugada tiene muchos fotogramas y el enlace ocupa ' +
                   url.length + ' caracteres. El navegador lo abre sin problema, pero ' +
                   'algunas aplicaciones de mensajería cortan los enlaces largos y ' +
                   'llegaría roto.\n\nPuedes quitarle fotogramas, o mandar el archivo ' +
                   'desde Exportar, que no tiene límite.',
          ok: 'Mandarlo igual'
        }).then(function (si) { if (si) mandaEnlace(url, titulo); });
        return;
      }
      mandaEnlace(url, titulo);
    }

    // Si ya se preparó al apoyar el dedo, se manda aquí mismo, sin esperar.
    if (enlaceEnCamino && enlaceEnCamino.jugada === jugada && enlaceEnCamino.url) {
      conLaDireccion(enlaceEnCamino.url);
      return;
    }
    PTEnlace.direccion(jugada).then(conLaDireccion)
      .catch(function () { toast('No se ha podido preparar el enlace'); });
  }

  function mandaEnlace(url, titulo) {
    var nombre = titulo || 'una jugada';
    function alPortapapeles() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { toast('Enlace copiado. Pégalo donde quieras mandarlo'); },
          function () { aMano(); });
      } else aMano();
    }
    function aMano() {
      // Si ni se puede compartir ni copiar, al menos que se vea para copiarlo.
      showFile(new Blob([url], { type: 'text/plain' }), 'enlace.txt');
      var n = $('#file-note');
      if (n) n.textContent = 'Este es el enlace de la jugada. Cópialo y mándalo.';
    }
    if (navigator.share) {
      navigator.share({ title: 'Klym', text: nombre, url: url })
        .catch(function (e) { if (!e || e.name !== 'AbortError') alPortapapeles(); });
      return;
    }
    alPortapapeles();
  }

  /* Al abrir, mirar si la dirección trae una jugada dentro.

     Quien recibe el enlace casi nunca usa la aplicación: si no tiene nada
     guardado, se le abre la jugada directamente, que es lo que espera al
     pinchar. Si sí tiene algo suyo en la pizarra, se pregunta antes: perder el
     trabajo de otro sin avisar no lo arregla ningún enlace. */
  function abreLoQueTraeElEnlace() {
    if (!window.PTEnlace) return;
    var dato = PTEnlace.loQueTraeLaDireccion();
    if (!dato) return;
    PTEnlace.limpiaDireccion();          // que una recarga no lo repita

    var habia = false;
    try { habia = !!localStorage.getItem('pt-autosave'); } catch (e) {}

    PTEnlace.desempaqueta(dato).then(function (d) {
      if (!d || !d.frames || !d.frames.length) {
        toast('Ese enlace no trae ninguna jugada, o ha llegado cortado');
        return;
      }
      var limpio = saneaDoc(d);          // por la misma aduana que todo lo demás
      var nombre = (limpio.card && limpio.card.titulo || '').trim() || 'La jugada';

      function abre() {
        doc = limpio;
        /* Lo que llega por enlace no es «una versión de» nada: el enlace trae
           la jugada entera y suelta, sin biblioteca detrás de la que salga. */
        docSale = null;
        ui.frame = 0; ui.sel = null; ui.multi = [];
        syncViewButtons(); buildFrames(); hideInspector(); commit(); resize();
        hint('');
        toast('«' + nombre + '» abierta' +
              (limpio.frames.length > 1 ? ' · ' + limpio.frames.length + ' fotogramas' : ''));
      }

      if (!habia) { abre(); return; }
      ask({
        title: nombre,
        message: 'Te han mandado esta jugada' +
                 (limpio.frames.length > 1 ? ', de ' + limpio.frames.length + ' fotogramas' : '') +
                 '. Si la abres, se cambiará lo que tienes ahora en la pizarra.',
        ok: 'Abrir la jugada'
      }).then(function (si) { if (si) abre(); });
    }).catch(function () {
      // Pase lo que pase con un enlace de fuera, la pizarra sigue en pie.
      toast('Ese enlace no trae ninguna jugada, o ha llegado cortado');
    });
  }

  // Compartir no pide cuenta: como mucho, tu nombre la primera vez, para que
  // el ejercicio vaya firmado. Se guarda y no se vuelve a preguntar.


  function comparteActual() {
    if (!doc.card || !doc.card.titulo) {
      toast('Ponle un título en la ficha antes de compartirlo');
      openCard();
      return;
    }
    if (!hayNube) { comparteSinNube(); return; }

    if (!yo) {
      ask({ title: 'Compartir «' + doc.card.titulo + '»',
            message: 'Para subirlo a la biblioteca común hace falta una cuenta, así el ' +
                     'ejercicio va firmado y puedes retirarlo cuando quieras. Se crea en ' +
                     'diez segundos con tu correo y una contraseña, sin confirmar nada.',
            ok: 'Crear mi cuenta' })
        .then(function (si) {
          if (!si) return;
          // Ha dicho que quiere crearla: se abre ya en «Crear una cuenta».
          abreCuenta(true);
        });
      return;
    }

    ask({ title: 'Compartir «' + doc.card.titulo + '»',
          message: 'Se sube a la biblioteca común y lo verá cualquiera que abra la pizarra, ' +
                   'con tu nombre debajo. Puedes retirarlo cuando quieras.',
          ok: 'Compartir' })
      .then(function (si) {
        if (!si) return;
        toast('Subiendo…');
        // Si ya lo habías compartido, se actualiza en vez de duplicarse: nadie
        // quiere ver el mismo ejercicio tres veces en la biblioteca común.
        nube.mios().then(function (filas) {
          var ya = (filas || []).filter(function (f) {
            return sinAcentos(f.titulo) === sinAcentos(doc.card.titulo);
          })[0];
          return nube.publica(clone(doc), { publicado: true, id: ya && ya.id });
        }).then(function () {
          nubeMios = []; nubeLista = [];
          toast('Compartido. Ya está en la biblioteca de todos');
          cargaNube();
        }).catch(function (e) {
          toast('No se ha podido compartir: ' + (e.message || 'error'));
        });
      });
  }

  /* =========================================================================
     Biblioteca
     Reúne el catálogo que viene con la aplicación y las pizarras que hayas
     guardado tú, y deja filtrarlas. Sin filtros salen todas.
     ====================================================================== */

  // Documento completo de una entrada del catálogo.
  function docDeCatalogo(ej) {
    var c = emptyCard();
    CARD_FIELDS.forEach(function (k) { if (ej.card[k]) c[k] = ej.card[k]; });
    return { pitch: ej.pitch, view: ej.view, card: c,
             frames: [{ objects: clone(ej.objects), strokes: clone(ej.strokes || []) }] };
  }

  // Todo lo que hay, con los datos que usan los filtros:
  //   general → los que vienen con la aplicación + los que comparte la gente
  //   mías    → lo guardado en este dispositivo + lo tuyo que está en la nube
  function bibliotecaItems() {
    var items = CATALOGO.map(function (ej) {
      return { id: 'cat:' + ej.id, origen: 'catalogo', fuente: 'app', nombre: ej.card.titulo,
               pitch: ej.pitch, card: ej.card, doc: null, ej: ej,
               autor: ej.autor || '', club: ej.club || '' };
    });
    items = items.concat(nubeLista);

    // Un ejercicio que ya está subido no se enseña dos veces: manda la copia
    // del servidor, que es la que te sigue a cualquier dispositivo. Antes, al
    // compartir, el mismo ejercicio salía duplicado en «Mías».
    var enLaNube = {};
    nubeMios.forEach(function (it) { enLaNube[sinAcentos(it.nombre)] = true; });

    var mias = savedBoards();
    Object.keys(mias).sort(function (a, b) { return mias[b].at - mias[a].at; })
      .forEach(function (n) {
        if (enLaNube[sinAcentos(n)]) return;
        var d = mias[n].doc || {};
        items.push({ id: 'mia:' + n, origen: 'mia', fuente: 'local', nombre: n, guardada: n,
                     pitch: d.pitch || 'f11', card: d.card || emptyCard(),
                     doc: d, at: mias[n].at,
                     // Quién participó. Va aparte del documento a propósito: al
                     // compartir se sube «doc», y los nombres no están ahí.
                     meta: mias[n].meta || null,
                     // De dónde salió, si salió de algo. Igual que «meta»: fuera
                     // del documento, porque es cosa de esta copia y no viaja.
                     sale: mias[n].sale || null });
      });
    return items.concat(nubeMios);
  }

  // Por aquí pasan todos: el catálogo que trae la aplicación, lo guardado en
  // este navegador y lo que ha subido la gente. Es el sitio donde se le pasa la
  // aduana a un documento que no hemos escrito nosotros.
  function itemDoc(it) {
    if (!it.docListo) {
      it.doc = saneaDoc(it.doc || docDeCatalogo(it.ej));
      it.docListo = true;
    }
    return it.doc;
  }

  // Miniatura del primer fotograma. Hay que prestarle el documento al motor,
  // que dibuja siempre el que está abierto.
  /* Las miniaturas se dibujan de una en una y cuestan lo suyo. Guardarlas todas
     para siempre haría que la memoria creciera sin freno según se llene la
     biblioteca común, así que se recuerdan las últimas 80 y las demás se
     olvidan: si vuelven a hacer falta, se vuelven a dibujar. */
  var libMini = {}, libMiniOrden = [], LIB_MINI_MAX = 80;
  function recuerdaMini(id, url) {
    if (!(id in libMini)) libMiniOrden.push(id);
    libMini[id] = url;
    while (libMiniOrden.length > LIB_MINI_MAX) delete libMini[libMiniOrden.shift()];
  }
  function olvidaMini(id) {
    delete libMini[id];
    var i = libMiniOrden.indexOf(id);
    if (i >= 0) libMiniOrden.splice(i, 1);
  }

  function miniatura(it) {
    if (it.id in libMini) return libMini[it.id];
    var d = itemDoc(it);
    var guardaDoc = doc, guardaFrame = ui.frame, guardaAnim = anim;
    doc = d; ui.frame = 0; anim = null;
    var url = '';
    try { url = renderFrame(0, 320).toDataURL('image/png'); }
    catch (e) {}
    doc = guardaDoc; ui.frame = guardaFrame; anim = guardaAnim;
    if (url) recuerdaMini(it.id, url);      // un dibujo fallido no se recuerda: se reintenta
    return url;
  }

  // Todo el texto de una entrada, para la búsqueda libre.
  function textoItem(it) {
    var t = [it.nombre];
    CARD_FIELDS.forEach(function (k) { if (it.card[k]) t.push(it.card[k]); });
    t.push(PITCHES[it.pitch] ? PITCHES[it.pitch].label : '');
    return t.join(' ').toLowerCase();
  }

  function sinAcentos(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Minutos que declara la ficha, para el filtro de duración.
  function minutos(c) {
    var m = /(\d+)/.exec(c.duracion || '');
    return m ? Number(m[1]) : null;
  }

  /* Dónde guarda cada origen su vista. Los tres la tienen, pero en un sitio
     distinto: el del catálogo dentro de «ej», el de la nube suelta, y el
     guardado dentro de su documento. La primera versión del filtro miraba solo
     «it.view» y por eso no descartaba nada: el catálogo entero pasaba. Salió en
     la prueba —24 ejercicios con cualquier espacio— y no leyendo el código.

     Si no se sabe, se devuelve vacío y el filtro lo deja pasar: esconder un
     ejercicio por no saber dónde cabe es peor que enseñarlo de más. */
  /* ---- cuánto sitio pide un ejercicio -------------------------------------

     Esto se sacaba del encuadre del dibujo, y era un error con consecuencias.
     El encuadre es cómo se MIRA la pizarra; el sitio que hace falta lo dicen
     las piezas. Un rondo de fútbol sala dibujado sobre la pista entera —que
     es el único encuadre que tiene esa modalidad— salía como «necesita la
     pista completa» cuando ocupa ocho metros por ocho.

     Y quien filtra por «medio campo» no ve lo que el filtro cree que no cabe.
     Así que cinco ejercicios perfectamente hacibles en un rincón estaban
     escondidos para casi todo el mundo: en fútbol base lo normal es compartir
     campo, no tenerlo entero.

     Ahora se mide la huella real, y se mide GIRADA también: lo que ocupa 30 ×
     20 cabe en un hueco de 20 × 30, porque un ejercicio se puede orientar como
     haga falta. «Un área» son 32 × 22 m, que es un área grande de verdad, y
     vale igual para las tres modalidades: es una cantidad de terreno, no una
     fracción del campo. */

  var AREA = [32, 22];

  function huellaDe(it) {
    if (it.huella !== undefined) return it.huella;
    var piezas = [], trazos = [];
    if (it.ej) { piezas = it.ej.objects || []; trazos = it.ej.strokes || []; }
    else {
      // Todos los fotogramas, no solo el primero: la jugada usa lo que recorre.
      ((it.doc && it.doc.frames) || []).forEach(function (f) {
        piezas = piezas.concat(f.objects || []);
        trazos = trazos.concat(f.strokes || []);
      });
    }
    var pts = piezas.slice();
    trazos.forEach(function (s) { pts = pts.concat(s.pts || []); });
    pts = pts.filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
    if (!pts.length) { it.huella = null; return null; }
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    });
    it.huella = { largo: x1 - x0, ancho: y1 - y0 };
    return it.huella;
  }

  function cabeEn(h, L, W) {
    // Un metro de margen: las fichas tienen radio y el dibujo no es un plano.
    return (h.largo <= L + 1 && h.ancho <= W + 1) ||
           (h.ancho <= L + 1 && h.largo <= W + 1);
  }

  function cuantoSitio(it) {
    var h = huellaDe(it);
    if (!h) return '';                       // sin piezas, cabe donde sea
    if (cabeEn(h, AREA[0], AREA[1])) return 'area';
    var P = PITCHES[it.pitch] || PITCHES.f11;
    if (cabeEn(h, P.L / 2, P.W)) return 'half';
    return 'full';
  }

  function filtraBiblioteca(items, f) {
    var q = sinAcentos(f.q).trim();
    return items.filter(function (it) {
      if (f.origen && it.origen !== f.origen) return false;
      if (f.pitch && it.pitch !== f.pitch) return false;
      if (f.momento && it.card.momento !== f.momento) return false;
      if (f.duracion) {
        var min = minutos(it.card);
        if (min === null) return false;
        if (f.duracion === 'corta' && min > 15) return false;
        if (f.duracion === 'media' && (min <= 15 || min > 25)) return false;
        if (f.duracion === 'larga' && min <= 25) return false;
      }
      /* Cuántos hacen falta. Lo dice la ficha en cristiano —«4 vs 2», «6 vs 6
         + 3 comodines», «Grupo entero»— y lo traduce a un número el mismo
         lector que usa el generador, así que los dos entienden lo mismo.

         Un ejercicio que no dice cuánta gente necesita NO se descarta: «Grupo
         entero» vale para los que seas. Descartarlo sería esconder la mitad de
         la biblioteca por no llevar etiqueta. */
      if (f.cuantos) {
        var pide = PTEquipo.jugadoresDe(it.card.jugadores);
        if (pide != null && pide > Number(f.cuantos)) return false;
      }
      /* Y cuánto sitio, medido en las piezas (ver «cuantoSitio»). Se filtra
         por «me cabe», no por «es exactamente esto»: un área cabe en medio
         campo y medio campo cabe en el entero. Lo que no ocupa nada —una
         pizarra en blanco— cabe en cualquier sitio. */
      if (f.espacio) {
        var cabe = { area: 1, half: 2, full: 3 };
        var suya = cabe[cuantoSitio(it)] || 0;
        if (suya && suya > (cabe[f.espacio] || 3)) return false;
      }
      if (q && sinAcentos(textoItem(it)).indexOf(q) < 0) return false;
      return true;
    });
  }

  // Los filtros arrancan en la modalidad predeterminada: mezclar fútbol 11,
  // fútbol 7 y sala en la misma lista no le sirve a nadie.
  function filtrosPorDefecto() {
    return { q: '', origen: 'catalogo', pitch: prefs().pitch, momento: '', duracion: '',
             cuantos: '', espacio: '' };
  }
  var libFiltros = filtrosPorDefecto();

  // La línea que explica de dónde sale lo que estás viendo.
  function notaBiblioteca() {
    if (libFiltros.origen === 'mia') {
      if (!hayNube) return 'Lo que guardas se queda en este dispositivo';
      if (!yo) return 'Lo guardado se queda en este dispositivo · para tenerlo en ' +
                      'cualquier sitio hace falta una cuenta';
      return 'Lo guardado se queda en este dispositivo · lo compartido te sigue allá donde entres';
    }
    var partes = ['Los que trae la aplicación'];
    if (catalogoInfo.fecha) partes.push('al día del ' + fechaCorta(catalogoInfo.fecha));
    if (hayNube) {
      partes.push(nubeEstado.cargando ? 'trayendo los de la comunidad…'
        : nubeEstado.error ? 'sin conexión con la biblioteca común'
        : 'y los que va compartiendo la gente');
    }
    if (catalogoInfo.deCache) partes.push('sin conexión, versión guardada');
    return partes.join(' · ');
  }

  function pintaBiblioteca() {
    var items = bibliotecaItems();
    var vistos = filtraBiblioteca(items, libFiltros);
    var grid = $('#lib-grid'), cuenta = $('#lib-cuenta');

    // el total contra el que se compara es el de la pestaña y la modalidad
    var base = items.filter(function (i) {
      return (!libFiltros.origen || i.origen === libFiltros.origen) &&
             (!libFiltros.pitch || i.pitch === libFiltros.pitch);
    });
    var modo = libFiltros.pitch ? ' de ' + PITCHES[libFiltros.pitch].label.toLowerCase() : '';
    var palabra = function (n) { return n === 1 ? ' ejercicio' : ' ejercicios'; };
    cuenta.textContent = vistos.length === base.length
      ? base.length + palabra(base.length) + modo
      : vistos.length + ' de ' + base.length + palabra(base.length) + modo;

    var porDefecto = filtrosPorDefecto();
    /* Un solo sitio que decide si hay algo filtrado. Estaba escrito dos veces,
       con listas distintas, y al añadir un filtro había que acordarse de los
       dos: uno para enseñar «quitar filtros» y otro para saber si la lista
       está vacía por culpa de un filtro o porque de verdad no hay nada. */
    var hayFiltros = !!(libFiltros.q || libFiltros.momento || libFiltros.duracion ||
                        libFiltros.cuantos || libFiltros.espacio ||
                        libFiltros.pitch !== porDefecto.pitch);
    $('#lib-limpiar').hidden = !hayFiltros;

    /* Los desplegables se pliegan en el móvil, y plegados no pueden tragarse
       lo que hay puesto: la línea que los abre lleva la cuenta. Se cuentan los
       desplegables, no la búsqueda escrita, que se ve sola ahí encima. */
    var mas = $('#lib-mas');
    if (mas) {
      var puestos = [libFiltros.momento, libFiltros.duracion, libFiltros.cuantos,
                     libFiltros.espacio].filter(Boolean).length +
                    (libFiltros.pitch !== porDefecto.pitch ? 1 : 0);
      mas.classList.toggle('puestos', puestos > 0);
      $('#lib-mas-t').textContent = puestos
        ? (puestos === 1 ? '1 filtro puesto' : puestos + ' filtros puestos')
        : 'Afinar la búsqueda';
    }

    $$('.lib-tab').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.origen === libFiltros.origen));
    });
    $('#lib-nota').textContent = notaBiblioteca();
    /* «Entrar desde el botón de arriba» decía dónde estaba la puerta, pero con
       el diálogo abierto ese botón ni se ve: había que cerrar la biblioteca,
       buscar una silueta y volver. Se entra desde aquí, que es donde acaba de
       venir a cuento. */
    if (libFiltros.origen === 'mia' && hayNube && !yo) {
      var entrar = document.createElement('button');
      entrar.type = 'button';
      entrar.className = 'linkish';
      entrar.id = 'lib-entrar';
      entrar.textContent = 'Entrar con tu correo';
      entrar.addEventListener('click', function () { cierraBiblioteca(); abreCuenta(false); });
      $('#lib-nota').appendChild(entrar);
    }

    grid.innerHTML = '';
    preparaMiniObs(grid);      // observador nuevo en cada repintado, sin dejar el viejo suelto
    if (!vistos.length) {
      if (nubeEstado.cargando) {
        grid.innerHTML = '<p class="empty">Trayendo la biblioteca…</p>';
        return;
      }
      grid.innerHTML = libFiltros.origen === 'mia' && !hayFiltros
        ? '<div class="lib-vacio"><b>Todavía no has guardado ninguna</b>' +
          'Monta un ejercicio, dale a Guardar y aparecerá aquí, solo en este dispositivo.</div>'
        : '<p class="empty">Ningún ejercicio encaja con esos filtros.</p>';
      return;
    }

    vistos.forEach(function (it) {
      var c = it.card, art = document.createElement('article');
      art.className = 'lib-card';

      var etiquetas = [PITCHES[it.pitch] ? PITCHES[it.pitch].label : '', c.momento,
                       c.duracion, c.jugadores].filter(Boolean)
        .map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');

      art.innerHTML =
        '<img alt="" loading="lazy">' +
        '<div class="lib-txt">' +
          '<b>' + esc(it.nombre || 'Sin título') + '</b>' +
          (c.objetivo ? '<small>' + esc(c.objetivo) + '</small>' : '') +
          (etiquetas ? '<div class="lib-tags">' + etiquetas + '</div>' : '') +
        '</div>';

      /* Aquí iba antes «quién participó», con los nombres copiados dentro de
         cada pizarra guardada. Ya no: quién hizo un ejercicio es cosa de la
         sesión de ese día, y los nombres viven en un solo sitio. La biblioteca
         vuelve a ser una biblioteca. */

      var pie = document.createElement('div');
      pie.className = 'lib-pie';
      var marca = document.createElement('span');
      marca.className = 'lib-origen';
      marca.textContent = firmaItem(it);
      if (it.fuente === 'nube' && !it.publicado) marca.classList.add('privado');
      pie.appendChild(marca);

      /* Cualquier ejercicio se manda por enlace sin abrirlo antes: es lo que se
         hace con la biblioteca delante, pasarle uno a otro entrenador. Va con
         el icono de compartir de siempre —el de la flecha saliendo— para que se
         reconozca sin leer, y abre la hoja del teléfono: WhatsApp, correo,
         lo que tenga puesto. */
      var enlazar = document.createElement('button');
      enlazar.className = 'tbtn icono';
      enlazar.title = 'Mandar «' + (it.nombre || 'este ejercicio') + '» por enlace';
      enlazar.setAttribute('aria-label', enlazar.title);
      enlazar.innerHTML = icoCompartir();
      enlazar.addEventListener('pointerdown', function () { preparaEnlace(itemDoc(it)); });
      enlazar.addEventListener('click', function () {
        enviaPorEnlace(itemDoc(it), it.nombre || '');
      });
      pie.appendChild(enlazar);

      var abrir = document.createElement('button');
      abrir.className = 'tbtn primary';
      if (libParaSesion) {
        abrir.textContent = 'Añadir';
        abrir.title = 'Añadir a la sesión';
        abrir.addEventListener('click', function () { meteEnLaSesion(it); });
      } else {
        abrir.textContent = 'Abrir';
        abrir.addEventListener('click', function () { abreItem(it); });
      }
      pie.appendChild(abrir);

      // Eligiendo para una sesión, borrar o publicar no viene a cuento.
      if (!libParaSesion) botonesDeItem(it).forEach(function (b) { pie.appendChild(b); });
      art.appendChild(pie);
      grid.appendChild(art);
      encargaMini(art.firstChild, it);
    });
    pintaLoQueSeVe(grid);
  }

  /* -------------------------------------------------------------------------
     Las miniaturas, solo cuando toca.

     Cada una se dibuja de verdad en el lienzo, y eso cuesta. Pintándolas todas
     de golpe, abrir la biblioteca con una página llena (68 ejercicios) tardaba
     casi tres segundos con la pantalla congelada en un teléfono normal, y se
     quedaban seis megas de imágenes en memoria. Ahora cada tarjeta pide la suya
     cuando está a punto de asomar por la pantalla: se dibujan seis o siete, no
     setenta, y el resto según se va bajando.
     ---------------------------------------------------------------------- */
  var miniObs = null;
  function pintaMini(img) {
    var it = img.itemDeLaTarjeta;
    if (!it || img.getAttribute('src')) return;
    var url = miniatura(it);
    if (!url) return;                       // no se ha podido dibujar: que se reintente
    img.src = url;
    if (miniObs) miniObs.unobserve(img);
  }
  function encargaMini(img, it) {
    if (!img || img.tagName !== 'IMG') return;
    img.itemDeLaTarjeta = it;
    if (miniObs) miniObs.observe(img); else pintaMini(img);   // sin observador, al momento
  }
  /* Por dónde se desplaza la biblioteca. Hoy es el cuerpo del diálogo; el día
     que sea una pantalla más, será otra cosa. Lo piden dos sitios —el
     observador y el primer pintado— y hasta ahora cada uno lo buscaba por su
     cuenta.

     También aquí conviene no vender humo: probado con «root: null», las
     miniaturas se siguen dibujando por tandas, porque el observador pasa a
     mirar la ventana y lo que está debajo del diálogo tampoco se ve desde ahí.
     Así que esto es un sitio en vez de dos, no un fallo arreglado. */
  function contenedorDeLaBiblioteca(grid) {
    return (grid && grid.closest('.dbody')) || null;
  }

  function preparaMiniObs(grid) {
    if (miniObs) { miniObs.disconnect(); miniObs = null; }
    if (typeof IntersectionObserver !== 'function') return;   // navegador viejo: como antes
    miniObs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) { if (e.isIntersecting) pintaMini(e.target); });
    }, { root: contenedorDeLaBiblioteca(grid), rootMargin: '500px 0px' });
  }
  /* El observador avisa cuando el navegador quiere, y en el primer pintado —con
     el diálogo recién abierto— a veces no ha avisado todavía. Lo que ya cae
     dentro de la pantalla no espera a nadie: se dibuja aquí mismo. */
  function pintaLoQueSeVe(grid) {
    var cont = contenedorDeLaBiblioteca(grid) || document.documentElement;
    var caja = cont.getBoundingClientRect();
    $$('img', grid).forEach(function (img) {
      var r = img.getBoundingClientRect();
      if (r.bottom > caja.top - 300 && r.top < caja.bottom + 300) pintaMini(img);
    });
  }

  // De quién es cada ejercicio, dicho en dos palabras.
  function firmaItem(it) {
    // Si el ejercicio viene firmado, se firma. Da igual que lleve ya tiempo en
    // la biblioteca común: el que lo montó merece aparecer.
    if (it.fuente === 'app') {
      return it.autor ? 'De ' + it.autor + (it.club ? ' · ' + it.club : '') : 'Del catálogo';
    }
    /* Una pizarra tuya que salió de otra lo dice: dentro de tres meses, «Rondo
       4 contra 2 (mi versión)» sin más no te recuerda de qué era versión. */
    if (it.fuente === 'local') {
      if (it.sale && it.sale.nombre) {
        return 'Tuya · a partir de «' + it.sale.nombre + '»' +
               (it.sale.autor ? ', de ' + it.sale.autor : '');
      }
      return 'Tuya, en este dispositivo';
    }
    if (!it.publicado) return 'Tuyo, sin compartir';
    if (it.mio) return 'Tuyo, compartido';
    return it.autor ? 'De ' + it.autor + (it.club ? ' · ' + it.club : '') : 'De la comunidad';
  }

  // Lo que puedes hacer con él, que depende de quién sea.
  function botonesDeItem(it) {
    var bs = [];
    function boton(txt, clase, fn) {
      var b = document.createElement('button');
      b.className = 'tbtn' + (clase ? ' ' + clase : ''); b.textContent = txt;
      b.addEventListener('click', fn); bs.push(b); return b;
    }

    if (it.fuente === 'local') {
      if (hayNube && yo) {
        boton('Compartir', '', function () {
          ask({ title: 'Compartir «' + it.nombre + '»',
                message: 'Se sube a la biblioteca común y lo verá cualquiera, con tu nombre debajo. ' +
                         'Puedes retirarlo cuando quieras.', ok: 'Compartir' })
            .then(function (si) {
              if (!si) return;
              var d = clone(itemDoc(it));
              if (!d.card) d.card = emptyCard();
              if (!d.card.titulo) d.card.titulo = it.nombre;
              nube.publica(d, { publicado: true })
                .then(function () { toast('Compartido'); nubeMios = []; cargaNube(); })
                .catch(function (e) { toast('No se ha podido: ' + (e.message || 'error')); });
            });
        });
      }
      boton('Borrar', '', function () {
        ask({ title: 'Borrar «' + it.guardada + '»', message: 'Se quita de tu biblioteca. Esto no se puede deshacer.', ok: 'Borrar', danger: true })
          .then(function (si) {
            if (!si) return;
            var a = savedBoards(); delete a[it.guardada]; writeBoards(a);
            olvidaMini(it.id);
            pintaBiblioteca();
          });
      });
      return bs;
    }

    if (it.fuente === 'nube' && it.mio) {
      boton(it.publicado ? 'Retirar' : 'Compartir', '', function () {
        nube.cambiaPublicado(it.fila.id, !it.publicado)
          .then(function () {
            toast(it.publicado ? 'Retirado de la biblioteca común' : 'Compartido');
            nubeMios = []; nubeLista = []; cargaNube();
          })
          .catch(function (e) { toast('No se ha podido: ' + (e.message || 'error')); });
      });
      boton('Borrar', '', function () {
        ask({ title: 'Borrar «' + it.nombre + '»',
              message: 'Se borra del servidor y deja de verse. Esto no se puede deshacer.',
              ok: 'Borrar', danger: true })
          .then(function (si) {
            if (!si) return;
            nube.borra(it.fila.id)
              .then(function () { toast('Borrado'); nubeMios = []; nubeLista = []; cargaNube(); })
              .catch(function (e) { toast('No se ha podido: ' + (e.message || 'error')); });
          });
      });
      return bs;
    }

    /* Lo que no es tuyo se puede hacer tuyo de un toque, sin abrirlo: se copia
       a este dispositivo y desde ahí ya es una pizarra más, que se edita, se
       comparte y se mete en una sesión. Es la mitad del sentido de que haya
       biblioteca común. */
    boton('Copiar a lo mío', '', function () { copiaALoMio(it); });

    if (it.fuente === 'nube' && yo) {
      boton('Reportar', 'sutil', function () {
        ask({ title: 'Reportar «' + it.nombre + '»',
              message: 'Avisas de que este ejercicio no debería estar en la biblioteca. ' +
                       'Con tres avisos deja de verse.', ok: 'Reportar', danger: true })
          .then(function (si) {
            if (!si) return;
            nube.reporta(it.fila.id, '')
              .then(function () { toast('Gracias, queda avisado'); })
              .catch(function (e) {
                toast(/duplicate|unique/i.test(e.message || '') ? 'Ya lo habías reportado'
                                                                : 'No se ha podido avisar');
              });
          });
      });
    }
    return bs;
  }

  function abreItem(it) {
    if (it.fuente === 'nube' && it.fila && !it.mio) nube.apertura(it.fila.id);
    doc = clone(itemDoc(it));
    docSale = saleDe(it);
    ui.frame = 0; ui.sel = null; ui.multi = [];
    syncViewButtons(); buildFrames(); hideInspector(); commit(); resize();
    cierraBiblioteca();
    toast('«' + (it.nombre || 'Ejercicio') + '» abierto');
  }

  /* -------------------------------------------------------------------------
     De dónde sale lo que hay en la pizarra.

     Un entrenador no monta un ejercicio de cero casi nunca: coge uno, le cambia
     el espacio, le quita dos jugadores y lo hace suyo. Eso es adaptar, y hasta
     ahora se perdía: guardabas y quedaba una pizarra tuya con el mismo nombre
     que la del catálogo, sin nada que dijera de dónde venía ni en qué se
     diferenciaba. Ahora la pizarra se acuerda, el nombre que propone al guardar
     ya dice que es tu versión, y la tarjeta lo cuenta.

     Vale solo para lo que NO es tuyo. Volver a guardar algo tuyo no es hacer
     una variante: es guardar. */
  var docSale = null;

  function saleDe(it) {
    if (!it || it.fuente === 'local' || it.mio) return null;
    return {
      nombre: String(it.nombre || '').slice(0, 80),
      autor: String(it.autor || '').slice(0, 60),
      de: it.fuente === 'app' ? 'catalogo' : 'comunidad'
    };
  }

  function comoLoLlamarias(sale) {
    // «Rondo 4 contra 2» → «Rondo 4 contra 2 (mi versión)», y si ya existe esa,
    // «(mi versión 2)». Sin esto, guardar pisaría la variante anterior.
    var base = (sale && sale.nombre ? sale.nombre : '').trim() || 'Ejercicio';
    var guardadas = savedBoards();
    var n = base + ' (mi versión)';
    var i = 2;
    while (guardadas[n] && i < 40) { n = base + ' (mi versión ' + i + ')'; i++; }
    return n.slice(0, 80);
  }

  /* Copiar sin abrir: con la biblioteca delante, «este me lo quedo» es un gesto
     de uno. Se guarda tal cual, con su procedencia, y la biblioteca se repinta
     para que aparezca ya en «Mías». */
  function copiaALoMio(it) {
    var sale = saleDe(it);
    var nombre = comoLoLlamarias(sale);
    var guardadas = savedBoards();
    guardadas[nombre] = { at: Date.now(), doc: clone(itemDoc(it)), sale: sale };
    if (!writeBoards(guardadas)) {
      toast('No cabe en el almacenamiento del navegador: borra alguna pizarra guardada');
      return;
    }
    olvidaMini('mia:' + nombre);
    toast('Copiado a lo tuyo como «' + nombre + '»');
    pintaBiblioteca();
  }

  /* =========================================================================
     MI EQUIPO · la plantilla y quién ha venido hoy

     La plantilla se escribe una vez por temporada. La asistencia se marca al
     llegar al campo, una vez, y de ahí sale sola en cada ejercicio que se
     guarde ese día. Nadie tiene que volver a escribir un nombre.
     ====================================================================== */
  function pintaApartadoPlantilla() {
    if (!window.PTEquipo) return;
    pintaPosiciones();
    pintaTemporadas();
    pintaPlantilla();
  }

  function pintaPosiciones() {
    var sel = $('#squad-posicion');
    if (sel.options.length) return;                    // solo la primera vez
    var vacia = document.createElement('option');
    vacia.value = ''; vacia.textContent = 'Posición…';
    sel.appendChild(vacia);
    PTEquipo.POSICIONES.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p;
      sel.appendChild(o);
    });
  }

  function pintaTemporadas() {
    var sel = $('#squad-temporada'), actual = PTEquipo.temporadaActual();
    sel.textContent = '';
    PTEquipo.temporadas().forEach(function (t) {
      var o = document.createElement('option');
      o.value = t; o.textContent = t;
      if (t === actual) o.selected = true;
      sel.appendChild(o);
    });
  }

  function pintaPlantilla() {
    var lista = PTEquipo.jugadores();
    var deHoy = PTEquipo.presentesHoy();
    var ul = $('#squad-lista');
    ul.textContent = '';

    lista.forEach(function (j) {
      ul.appendChild(filaJugador(j, deHoy.indexOf(j.id) >= 0, function (marcado) {
        PTEquipo.marcaAsistencia(j.id, marcado);
        cuentaEquipo();
      }, function (quien) {
        ask({ title: 'Quitar a ' + quien.nombre,
              message: 'Sale de la plantilla de esta temporada. Lo que ya haya entrenado se ' +
                       'queda en las estadísticas: no se borra nada del historial.',
              ok: 'Quitar', danger: true })
          .then(function (si) {
            if (!si) return;
            PTEquipo.quita($('#squad-temporada').value, quien.id);
            pintaPlantilla();
          });
      }));
    });

    var nota = $('#squad-nota');
    nota.textContent = lista.length
      ? lista.length + ' de ' + PTEquipo.TOPE_JUGADORES + ' jugadores'
      : 'Añade a tus jugadores una vez y ya no vuelves a escribir un nombre: en cada ' +
        'entrenamiento solo marcas quién ha venido.';
    cuentaEquipo();
  }

  function cuentaEquipo() {
    var total = PTEquipo.jugadores().length;
    var dentro = PTEquipo.presentesHoy().filter(function (id) {
      return PTEquipo.jugadores().some(function (j) { return j.id === id; });
    }).length;
    $('#squad-cuenta').textContent = dentro + ' de ' + total;
  }

  function añadeJugador() {
    var dorsal = $('#squad-dorsal'), nombre = $('#squad-nombre'), pos = $('#squad-posicion');
    var r = PTEquipo.añade($('#squad-temporada').value, {
      dorsal: dorsal.value, nombre: nombre.value, posicion: pos.value
    });
    if (!r.ok) {
      toast(r.porque === 'tope' ? 'La plantilla ya tiene ' + PTEquipo.TOPE_JUGADORES + ' jugadores'
          : r.porque === 'no-cabe' ? 'No cabe en el almacenamiento del navegador'
          : 'Hace falta el nombre');
      if (r.porque === 'sin-nombre') nombre.focus();
      return;
    }
    dorsal.value = ''; nombre.value = ''; pos.value = '';
    pintaPlantilla();
    dorsal.focus();                                    // para seguir metiendo
    if (r.dorsalRepetido) toast('Ojo: ya había alguien con el dorsal ' + r.jugador.dorsal);
  }

  function nuevaTemporada() {
    var propuesta = PTEquipo.temporadaSiguiente(PTEquipo.temporadaActual());
    ask({ title: 'Nueva temporada', input: propuesta, placeholder: '2026/27',
          message: 'Empieza con la plantilla vacía. Las temporadas anteriores se quedan ' +
                   'guardadas con sus jugadores y sus estadísticas.',
          ok: 'Crear' })
      .then(function (t) {
        if (t === null) return;
        if (!PTEquipo.temporadaValida(t)) { toast('El formato es 2026/27'); return; }
        if (!PTEquipo.cambiaTemporada(t)) { toast('No se ha podido guardar'); return; }
        pintaTemporadas(); pintaPlantilla(); sueltaElDiaAbierto();
        toast('Temporada ' + t);
      });
  }

  /* =========================================================================
     LAS SESIONES

     Un día de entrenamiento: quién vino y qué se hizo, en orden.

     La pestaña tiene dos caras y ninguna es un diálogo: el DIARIO, que son los
     días que tienen algo agrupados por meses, y el DETALLE de un día. Se va de
     una a la otra dentro de la misma pestaña, como quien abre una carpeta. Un
     diálogo más encima de los diez que ya hay no le hacía falta a nadie.

     Montar una sesión se puede hacer de dos maneras, y las dos están a la vista
     en el detalle: escribir un ejercicio a mano —«estiramientos, 10 min», que no
     necesita dibujo— o traerlo de la biblioteca, que es la biblioteca de
     siempre abierta en modo «elegir» en vez de en modo «abrir».
     ====================================================================== */
  var sesFecha = null;              // el día abierto, o null si se ve el diario
  var sesVista = 'diario';          // diario · detalle · asistencia

  function pintaSesiones() {
    if (!sesFecha) sesVista = 'diario';
    if (sesVista === 'asistencia') pintaAsistenciaDeSesion();
    else if (sesVista === 'generar') pintaGenerador();
    else if (sesVista === 'detalle') pintaDetalleSesion();
    else pintaDiario();
  }

  function vaAlDiario() { sesFecha = null; sesVista = 'diario'; arriba(); pintaSesiones(); }

  function abreSesion(fecha) {
    sesFecha = fecha;
    sesVista = 'detalle';
    arriba();
    pintaSesiones();
  }

  function abrePasarLista() {
    sesElegidos = null;             // se relee del almacén al pintar
    sesVista = 'asistencia';
    arriba();
    pintaSesiones();
  }

  // Cambiar de pantalla y quedarse a media página es de las cosas que más
  // desorientan: al entrar y al salir se vuelve arriba.
  function arriba() {
    var caja = $('#equipo');
    if (caja) caja.scrollTop = 0;
  }

  function pintaDiario() {
    $('#ses-diario').hidden = false;
    $('#ses-detalle').hidden = true;
    $('#ses-asistencia').hidden = true;
    $('#ses-generar').hidden = true;

    var lista = PTEquipo.diario();
    var meses = PTEquipo.porMeses(lista);
    /* La cuenta de arriba es de lo ENTRENADO, y una sesión que aún no ha
       llegado no se ha entrenado. Sumarla aquí decía «60 min esta temporada»
       cuando 45 eran de un domingo que todavía no ha pasado: el mismo fallo que
       en las estadísticas, pero en una frase suelta que nadie vuelve a mirar.
       Las planificadas se cuentan aparte y se dicen aparte. */
    var totalEj = 0, totalMin = 0, hechas = 0, planes = 0;
    lista.forEach(function (s) {
      if (s.futura) { planes++; return; }
      hechas++;
      totalEj += s.ejercicios.length;
      totalMin += s.minutos;
    });

    var trozos = [];
    if (hechas) trozos.push(hechas + (hechas === 1 ? ' sesión' : ' sesiones'));
    if (totalEj) trozos.push(totalEj + (totalEj === 1 ? ' ejercicio' : ' ejercicios'));
    if (totalMin) trozos.push(totalMin + ' min');
    if (planes) trozos.push(planes + (planes === 1 ? ' planificada' : ' planificadas'));
    $('#ses-resumen').textContent = trozos.length
      ? 'Temporada ' + PTEquipo.temporadaActual() + ': ' + trozos.join(' · ')
      : 'Temporada ' + PTEquipo.temporadaActual() + ', todavía sin sesiones.';

    var caja = $('#ses-meses');
    caja.textContent = '';
    meses.forEach(function (m) {
      var h = document.createElement('p');
      h.className = 'ses-mes';
      h.textContent = m.nombre;
      caja.appendChild(h);

      var ul = document.createElement('ul');
      ul.className = 'ses-dias';
      m.sesiones.forEach(function (s) { ul.appendChild(filaSesion(s)); });
      caja.appendChild(ul);
    });

    /* El selector arranca en hoy. Vacío enseñaba el «mm/dd/yyyy» del navegador,
       que además sale en el formato de su idioma y no en el de quien mira. Con
       hoy puesto se ve de qué fecha se parte y el hueco deja de ser un cartel. */
    $('#ses-dia').value = PTEquipo.hoyISO();

    $('#ses-nota').textContent = lista.length
      ? 'Cada sesión es un día. Puedes dejar preparadas las que vienen y ' +
        'rellenar las de atrás que no apuntaste.' + dondeSeQueda()
      : 'Una sesión es un día de entrenamiento: quién vino y qué hicisteis. ' +
        'Empieza por la de hoy, elige otro día para dejarlo preparado, o guarda ' +
        'un ejercicio desde la pizarra y se apunta solo.';
  }

  function filaSesion(s) {
    var hoy = PTEquipo.hoyISO();
    var li = document.createElement('li');
    li.className = 'ses-dia' + (s.fecha === hoy ? ' es-hoy' : '') +
                   (s.futura ? ' es-plan' : '');

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ses-dia-btn';

    var fecha = document.createElement('span');
    fecha.className = 'ses-dia-fecha';
    fecha.textContent = s.fecha === hoy ? 'Hoy' : diaCorto(s.fecha);
    b.appendChild(fecha);

    var med = document.createElement('span');
    med.className = 'ses-dia-med';
    // El nombre lo escribe el entrenador: por el DOM, nunca por innerHTML.
    var tit = document.createElement('b');
    tit.textContent = s.nombre || (s.ejercicios.length
      ? s.ejercicios[0].titulo + (s.ejercicios.length > 1
          ? ' y ' + (s.ejercicios.length - 1) + ' más' : '')
      : 'Sin ejercicios apuntados');
    if (!s.nombre && !s.ejercicios.length) tit.className = 'flojo';
    med.appendChild(tit);

    var sub = document.createElement('small');
    var t = [];
    /* Lo primero que se dice de un día que aún no ha llegado es que no ha
       llegado: leído en una lista que va de lo más nuevo a lo más viejo, si no
       se dijera parecería que ya se entrenó. */
    if (s.futura) t.push('Planificada');
    if (s.ejercicios.length) t.push(s.ejercicios.length + (s.ejercicios.length === 1 ? ' ejercicio' : ' ejercicios'));
    if (s.minutos) t.push(s.minutos + ' min');
    if (!s.futura && s.hayAsistencia) t.push(s.presentes.length + (s.presentes.length === 1 ? ' jugador' : ' jugadores'));
    sub.textContent = t.join(' · ') || 'Nada apuntado todavía';
    med.appendChild(sub);
    b.appendChild(med);

    var fl = document.createElement('span');
    fl.className = 'ses-dia-fl';
    fl.setAttribute('aria-hidden', 'true');
    fl.textContent = '›';
    b.appendChild(fl);

    b.setAttribute('aria-label', 'Abrir la sesión del ' + diaLargo(s.fecha, true));
    b.addEventListener('click', function () { abreSesion(s.fecha); });
    li.appendChild(b);
    return li;
  }

  function pintaDetalleSesion() {
    $('#ses-diario').hidden = true;
    $('#ses-detalle').hidden = false;
    $('#ses-asistencia').hidden = true;
    $('#ses-generar').hidden = true;

    var s = PTEquipo.sesionDe(sesFecha);
    var hoy = sesFecha === PTEquipo.hoyISO();
    $('#ses-fecha').textContent = hoy ? 'Hoy, ' + diaLargo(sesFecha)
                                      : mayus(diaLargo(sesFecha, true));
    var campo = $('#ses-nombre');
    if (campo.value !== s.nombre) campo.value = s.nombre;

    /* La lista de ese día se pasa AQUÍ, en su propia pantalla, no en el
       apartado Plantilla. Plantilla es donde se monta el equipo de la
       temporada; mandar allí a quien quiere apuntar quién faltó un jueves de
       hace dos semanas es mandarlo a otro sitio a hacer otra cosa. */
    var asis = $('#ses-asis');
    asis.textContent = '';
    /* Un día que aún no ha llegado no se pasa lista: no ha venido nadie. Pedirlo
       sería pedir que te inventes la asistencia, y esa lista es de la que salen
       después los minutos de cada uno. */
    if (s.futura) {
      asis.appendChild(document.createTextNode(
        'Está por llegar: queda apuntada como plan. Cuando llegue el día podrás ' +
        'pasar lista, y hasta entonces no cuenta como entrenada.'));
      pintaEjerciciosDeSesion(s);
      pintaPieDeSesion(s);
      return;
    }
    asis.appendChild(document.createTextNode(s.hayAsistencia
      ? 'Vinieron ' + s.presentes.length +
        (s.presentes.length === 1 ? ' jugador' : ' jugadores') + '. '
      : 'De este día no quedó apuntado quién vino. '));
    if (PTEquipo.jugadores().length) {
      var ir = document.createElement('button');
      ir.type = 'button';
      ir.className = 'linkish';
      ir.textContent = s.hayAsistencia ? 'Cambiar quién vino' : 'Pasar lista';
      ir.addEventListener('click', abrePasarLista);
      asis.appendChild(ir);
    } else {
      // Sin plantilla no hay a quién pasar lista, pero dejarlo ahí sin decir
      // nada es dejar a alguien mirando una frase y sin saber qué hacer.
      asis.appendChild(document.createTextNode(
        'Monta tu plantilla en Plantilla y podrás pasarla.'));
    }

    pintaEjerciciosDeSesion(s);
    pintaPieDeSesion(s);
  }

  /* El pie del detalle. Sacado a su función porque ahora hay dos caminos que
     llegan a él: el día normal y el que todavía no ha llegado, que se salta
     todo lo de la asistencia. */
  function pintaPieDeSesion(s) {
    var pie = [];
    if (s.ejercicios.length) {
      pie.push(s.ejercicios.length + (s.ejercicios.length === 1 ? ' ejercicio' : ' ejercicios'));
      if (s.minutos) pie.push(s.minutos + ' min en total');
      if (s.sinDuracion) pie.push(s.sinDuracion + ' sin duración apuntada');
    }
    $('#ses-pie').textContent = pie.length ? pie.join(' · ')
      : 'Escribe uno a mano o tráelo de la biblioteca. Los que guardes desde la ' +
        'pizarra marcando «añadir a una sesión» entran aquí solos.';
    $('#ses-imprimir').disabled = !s.ejercicios.length;
  }

  function pintaEjerciciosDeSesion(s) {
    var ol = $('#ses-lista');
    ol.textContent = '';
    if (!s.ejercicios.length) {
      var p = document.createElement('li');
      p.className = 'ses-vacia';
      p.textContent = 'Todavía no hay ejercicios en esta sesión.';
      ol.appendChild(p);
      return;
    }
    s.ejercicios.forEach(function (e, i) {
      ol.appendChild(filaEjercicio(s, e, i));
    });
  }

  function filaEjercicio(s, e, i) {
    var li = document.createElement('li');
    li.className = 'ses-ej';

    var orden = document.createElement('span');
    orden.className = 'ses-ej-n';
    orden.textContent = String(i + 1);
    li.appendChild(orden);

    /* El texto es el botón que abre el dibujo, cuando lo hay. Antes eso era un
       icono más en la fila de mandos, y entre cuatro iconos al título le
       quedaban 130 px: salía «Finalización tras c…». Tocar el ejercicio para
       verlo es además lo que uno hace sin que se lo expliquen. */
    var med = document.createElement(e.ref ? 'button' : 'div');
    med.className = 'ses-ej-med' + (e.ref ? ' abrible' : '');
    if (e.ref) {
      med.type = 'button';
      med.title = 'Abrir «' + e.titulo + '» en la pizarra';
      med.addEventListener('click', function () { abreRefDeSesion(e.ref); });
    }
    var tit = document.createElement('b');
    tit.textContent = e.titulo;
    med.appendChild(tit);
    var sub = document.createElement('small');
    var t = [];
    if (e.momento) t.push(e.momento);
    if (e.duracion) t.push(e.duracion);
    /* Cuántos lo hicieron, solo cuando NO lo hizo todo el que vino: eso es lo
       que hay que ver de un vistazo, porque sus minutos van a otra cuenta.
       Ponerlo también cuando coincide con la asistencia llenaría todas las
       filas de un dato que ya está arriba, y se comía el momento y la duración,
       que sí cambian de una fila a otra. */
    if (e.quienes && !mismosQue(e.quienes, s.presentes)) {
      t.push(e.quienes.length + (e.quienes.length === 1 ? ' jugador' : ' jugadores'));
    }
    sub.textContent = t.join(' · ');
    if (t.length) med.appendChild(sub);
    li.appendChild(med);

    var mandos = document.createElement('div');
    mandos.className = 'ses-ej-mandos';

    mandos.appendChild(botonMini('Subir', '↑', function () {
      PTEquipo.mueveEjercicio(s.fecha, e.id, 'arriba'); pintaSesiones();
    }, i === 0));
    mandos.appendChild(botonMini('Bajar', '↓', function () {
      PTEquipo.mueveEjercicio(s.fecha, e.id, 'abajo'); pintaSesiones();
    }, i === s.ejercicios.length - 1));
    mandos.appendChild(botonMini('Quitar de la sesión', '✕', function () {
      PTEquipo.quitaEjercicio(s.fecha, e.id); pintaSesiones();
    }));

    li.appendChild(mandos);
    return li;
  }

  /* Pasar lista de un día.

     Se parece a la lista de Plantilla a propósito —la misma fila, el mismo
     gesto— pero es otra pantalla y hace otra cosa: allí se monta el equipo de
     la temporada, aquí se apunta quién vino un día concreto.

     Vienen TODOS marcados si ese día no tenía lista. Se marca al que falta, no
     al que viene: en un campo faltan dos, no vienen dieciocho.

     Se guarda al tocar, sin botón de guardar. Lo que se toca es lo que queda. */
  var sesElegidos = null;

  function pintaAsistenciaDeSesion() {
    $('#ses-diario').hidden = true;
    $('#ses-detalle').hidden = true;
    $('#ses-asistencia').hidden = false;
    $('#ses-generar').hidden = true;

    var hoy = sesFecha === PTEquipo.hoyISO();
    $('#ses-asis-fecha').textContent = hoy ? 'Hoy, ' + diaLargo(sesFecha)
                                           : mayus(diaLargo(sesFecha, true));
    /* El texto de arriba dice la verdad de este día, no una frase fija: la
       primera vez vienen todos marcados y solo hay que quitar a los que
       faltaron; volviendo a entrar, lo que hay es lo que se dejó apuntado. */
    var yaTenia = PTEquipo.sesionDe(sesFecha).hayAsistencia;
    $('#ses-asis-como').textContent = yaTenia
      ? 'Está como lo dejaste. Marca o desmarca lo que haga falta.'
      : 'Vienen todos marcados. Desmarca al que faltó.';

    if (sesElegidos === null) sesElegidos = PTEquipo.presentesDe(sesFecha);
    pintaListaDeAsistencia();
  }

  function pintaListaDeAsistencia() {
    var lista = PTEquipo.jugadores();
    var ul = $('#ses-asis-lista');
    ul.textContent = '';
    lista.forEach(function (j) {
      ul.appendChild(filaJugador(j, sesElegidos.indexOf(j.id) >= 0, function (marcado) {
        var i = sesElegidos.indexOf(j.id);
        if (marcado && i < 0) sesElegidos.push(j.id);
        if (!marcado && i >= 0) sesElegidos.splice(i, 1);
        guardaAsistenciaDeSesion();
        cuentaAsistenciaDeSesion(lista.length);
      }, null));
    });
    cuentaAsistenciaDeSesion(lista.length);

    $('#ses-asis-nota').textContent = lista.length
      ? 'Se guarda solo, según vas marcando.' + dondeSeQueda()
      : 'Todavía no tienes plantilla. Móntala en el apartado Plantilla y vuelve aquí.';
  }

  function cuentaAsistenciaDeSesion(total) {
    var hay = PTEquipo.jugadores();
    var dentro = sesElegidos.filter(function (id) {
      return hay.some(function (j) { return j.id === id; });
    }).length;
    var p = $('#ses-asis-cuenta');
    p.textContent = '';
    var n = document.createElement('b');
    n.textContent = dentro + ' de ' + total;
    p.appendChild(n);
    p.appendChild(document.createTextNode(
      total - dentro === 0 ? ' · no falta nadie'
      : total - dentro === 1 ? ' · falta uno' : ' · faltan ' + (total - dentro)));
  }

  function guardaAsistenciaDeSesion() {
    if (!PTEquipo.ponAsistenciaEn(sesFecha, sesElegidos)) {
      toast('No se ha podido guardar en este navegador');
    }
  }

  function vuelveDeLaLista() {
    sesElegidos = null;
    sesVista = 'detalle';
    arriba();
    pintaSesiones();
  }

  /* =========================================================================
     Proponer una sesión

     El formulario viene relleno con lo que la aplicación ya sabe: la modalidad
     que usas, y cuánta gente vino ese día contando cuántos son porteros. Lo
     normal es mirarlo, cambiar el espacio si hoy te toca medio campo, y darle.

     La propuesta no se guarda hasta que se acepta, y se puede pedir otra. Y
     cada ejercicio lleva escrito por qué está ahí: sin eso, una lista que sale
     sola no se puede discutir, y lo que no se puede discutir o se traga entero
     o se tira entero.
     ====================================================================== */
  var genPropuesta = null;
  // Lo que ya se propuso en esta visita: «otra propuesta» tiene que traer otra
  // cosa, y el criterio de elección no lleva ningún azar del que tirar.
  var genDescartados = [];

  function abreGenerador() {
    sesVista = 'generar';
    genPropuesta = null;
    genDescartados = [];
    arriba();
    pintaSesiones();
  }

  function pintaGenerador() {
    $('#ses-diario').hidden = true;
    $('#ses-detalle').hidden = true;
    $('#ses-asistencia').hidden = true;
    $('#ses-generar').hidden = false;

    var hoy = sesFecha === PTEquipo.hoyISO();
    $('#ses-gen-fecha').textContent = hoy ? 'Hoy, ' + diaLargo(sesFecha)
                                          : mayus(diaLargo(sesFecha, true));
    if (!$('#gen-espacio').options.length) montaCamposDelGenerador();
    if (!genPropuesta) rellenaGeneradorConLoQueSabemos();
    $('#gen-salida').hidden = !genPropuesta;
    $('#gen-otra').hidden = !genPropuesta;
    diCualEsElContexto();
  }

  function montaCamposDelGenerador() {
    PTEquipo.ESPACIOS.forEach(function (e) {
      var o = document.createElement('option');
      o.value = e.id; o.textContent = e.nombre;
      $('#gen-espacio').appendChild(o);
    });
    PTEquipo.CONTEXTOS.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id; o.textContent = c.nombre;
      $('#gen-contexto').appendChild(o);
    });
    $('#gen-contexto').addEventListener('change', diCualEsElContexto);
  }

  function diCualEsElContexto() {
    var id = $('#gen-contexto').value;
    var c = PTEquipo.CONTEXTOS.filter(function (x) { return x.id === id; })[0];
    $('#gen-pie').textContent = c ? c.pie : '';
  }

  /* Lo que la aplicación ya sabe de ese día: quién vino y cuántos de ellos son
     porteros. Escribir a mano un número que está tres pantallas más allá es
     justo lo que esta parte tenía que ahorrar. */
  /* Cuántos suele haber cuando la aplicación todavía no sabe nada de ti: sin
     plantilla montada el campo salía vacío, y vacío significa «no filtres por
     gente», con lo que proponía un 6 contra 6 a un equipo de cero jugadores.
     Un número de partida verosímil es más útil que un hueco. */
  var CUANTOS_POR_DEFECTO = { f11: { campo: 14, porteros: 1 },
                              f7:  { campo: 10, porteros: 1 },
                              futsal: { campo: 8, porteros: 2 } };

  function rellenaGeneradorConLoQueSabemos() {
    var s = PTEquipo.sesionDe(sesFecha);
    var vinieron = s.hayAsistencia ? s.presentes : PTEquipo.presentesDe(sesFecha);
    var porteros = 0;
    vinieron.forEach(function (id) {
      var j = PTEquipo.buscaJugador(id);
      if (j && j.posicion === 'Portero') porteros++;
    });
    var deCampo = Math.max(0, vinieron.length - porteros);

    var pitch = prefs().pitch || 'f11';
    var porSiAcaso = CUANTOS_POR_DEFECTO[pitch] || CUANTOS_POR_DEFECTO.f11;
    $('#gen-pitch').value = pitch;
    $('#gen-espacio').value = 'full';
    $('#gen-jugadores').value = String(deCampo || porSiAcaso.campo);
    $('#gen-porteros').value = String(vinieron.length ? porteros : porSiAcaso.porteros);
    $('#gen-minutos').value = '75';
    $('#gen-contexto').value = 'datos';
  }

  function numeroDe(sel, porDefecto) {
    var n = parseInt(String($(sel).value).replace(/\D/g, ''), 10);
    return isFinite(n) ? n : porDefecto;
  }

  function proponSesion(otra) {
    if (otra === true && genPropuesta) {
      genPropuesta.ejercicios.forEach(function (e) { genDescartados.push(e.titulo); });
    } else if (otra !== true) {
      genDescartados = [];            // cambió el formulario: se empieza de cero
    }
    var candidatos = bibliotecaItems().map(function (it) {
      return {
        id: it.id, nombre: it.nombre, pitch: it.pitch, view: it.view || 'full',
        card: it.card,
        ref: it.origen === 'mia' && it.fuente === 'local'
          ? { de: 'guardado', nombre: it.nombre }
          : { de: 'catalogo', id: it.id }
      };
    });
    genPropuesta = PTEquipo.generaSesion(candidatos, {
      pitch: $('#gen-pitch').value,
      espacio: $('#gen-espacio').value,
      jugadores: numeroDe('#gen-jugadores', 0),
      porteros: numeroDe('#gen-porteros', 0),
      minutos: numeroDe('#gen-minutos', 75),
      contexto: $('#gen-contexto').value,
      evita: genDescartados
    });
    pintaPropuesta();
  }

  function pintaPropuesta() {
    var p = genPropuesta;
    $('#gen-salida').hidden = false;
    $('#gen-otra').hidden = false;

    var avisos = $('#gen-avisos');
    avisos.textContent = '';
    p.avisos.forEach(function (t) {
      var el = document.createElement('p');
      el.className = 'stats-olvido';
      el.textContent = t;
      avisos.appendChild(el);
    });

    var ol = $('#gen-lista');
    ol.textContent = '';
    p.ejercicios.forEach(function (e, i) {
      var li = document.createElement('li');
      li.className = 'ses-ej';
      var n = document.createElement('span');
      n.className = 'ses-ej-n';
      n.textContent = String(i + 1);
      li.appendChild(n);

      var med = document.createElement('div');
      med.className = 'ses-ej-med';
      var t = document.createElement('b');
      t.textContent = e.titulo;
      med.appendChild(t);
      var sub = document.createElement('small');
      sub.textContent = [e.momento, e.duracion].filter(Boolean).join(' · ');
      med.appendChild(sub);
      // El porqué, que es lo que convierte una lista en una propuesta.
      var pq = document.createElement('small');
      pq.className = 'gen-porque';
      pq.textContent = e.porque || '';
      if (e.porque) med.appendChild(pq);
      li.appendChild(med);

      var mandos = document.createElement('div');
      mandos.className = 'ses-ej-mandos';
      mandos.appendChild(botonMini('Quitar de la propuesta', '✕', function () {
        genPropuesta.ejercicios.splice(i, 1);
        genPropuesta.minutos = genPropuesta.ejercicios.reduce(function (a, x) {
          return a + (x.minutos || 0); }, 0);
        pintaPropuesta();
      }));
      li.appendChild(mandos);
      ol.appendChild(li);
    });

    var n = p.ejercicios.length;
    $('#gen-resumen').textContent = n
      ? n + (n === 1 ? ' ejercicio · ' : ' ejercicios · ') + p.minutos + ' min en total'
      : 'No queda ningún ejercicio en la propuesta.';
    $('#gen-usar').disabled = !n;
  }

  /* Aceptarla la escribe en la sesión de ese día, AÑADIENDO a lo que ya
     hubiera: quien ya tenía dos ejercicios apuntados no quiere que una
     propuesta se los borre sin avisar. */
  function usaLaPropuesta() {
    if (!genPropuesta || !genPropuesta.ejercicios.length) return;
    var metidos = 0;
    genPropuesta.ejercicios.forEach(function (e) {
      var r = PTEquipo.añadeEjercicio(sesFecha, {
        titulo: e.titulo, momento: e.momento, duracion: e.duracion,
        ref: e.ref, quienes: null
      });
      if (r.ok) metidos++;
    });
    toast(metidos === genPropuesta.ejercicios.length
      ? 'Sesión propuesta añadida'
      : 'Se han añadido ' + metidos + ' de ' + genPropuesta.ejercicios.length);
    genPropuesta = null;
    sesVista = 'detalle';
    arriba();
    pintaSesiones();
  }

  /* Cambiar de temporada deja el día que tuvieras abierto en Sesiones fuera de
     sitio: es un día de OTRA temporada, y quedarte dentro de él sin que nada lo
     diga es quedarte mirando datos que ya no son los de la temporada que has
     elegido. Se vuelve al diario, que sí es el de la nueva. */
  function sueltaElDiaAbierto() {
    sesFecha = null;
    sesVista = 'diario';
    genPropuesta = null;
    sesElegidos = null;
    if (modo === 'equipo' && eqApartado === 'sesiones') pintaSesiones();
  }

  /* Hacer algo cuando el que escribe para de escribir. */
  function conRespiro(fn, ms) {
    var t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function mismosQue(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var hay = {};
    b.forEach(function (x) { hay[x] = true; });
    return a.every(function (x) { return hay[x]; });
  }

  function botonMini(titulo, dentro, alPulsar, apagado) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tbtn icono ses-mini';
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    if (dentro.charAt(0) === '<') b.innerHTML = dentro; else b.textContent = dentro;
    if (apagado) b.disabled = true;
    b.addEventListener('click', alPulsar);
    return b;
  }

  /* Abrir el dibujo de un ejercicio de la sesión. Puede que ya no exista —lo
     borraste de tu biblioteca—, y entonces se dice, que es mejor que no hacer
     nada al pulsar. La sesión no se toca: sigue contando lo que se hizo. */
  function abreRefDeSesion(ref) {
    if (ref.de === 'guardado') {
      var todas = savedBoards();
      if (!todas[ref.nombre] || !todas[ref.nombre].doc) {
        toast('«' + ref.nombre + '» ya no está en tu biblioteca. La sesión lo sigue contando.');
        return;
      }
      doc = clone(todas[ref.nombre].doc);
      // La suya, no la de lo que hubiera antes en la pizarra.
      docSale = todas[ref.nombre].sale || null;
      ui.frame = 0; ui.sel = null; ui.multi = [];
      syncViewButtons(); buildFrames(); hideInspector(); commit();
      vaModo('pizarra');               // resize() va dentro: el campo ya tiene hueco
      toast('«' + ref.nombre + '» abierto');
      return;
    }
    var it = bibliotecaItems().filter(function (x) { return x.id === ref.id; })[0];
    if (!it) { toast('Ese ejercicio ya no está en la biblioteca'); return; }
    /* El modo, antes de cargar: «abreItem» mide el campo contra el hueco que
       tiene, y estando en Equipo ese hueco es cero. Se escribió para abrirse
       desde la biblioteca, con la pizarra ya delante. */
    vaModo('pizarra');
    abreItem(it);
  }

  function añadeEjercicioAMano() {
    var tit = $('#ses-ej-titulo'), mom = $('#ses-ej-momento'), dur = $('#ses-ej-duracion');
    var r = PTEquipo.añadeEjercicio(sesFecha, {
      titulo: tit.value, momento: mom.value, duracion: dur.value, ref: null, quienes: null
    });
    if (!r.ok) {
      toast(r.porque === 'tope' ? 'La sesión ya lleva ' + PTEquipo.TOPE_EJERCICIOS + ' ejercicios'
          : r.porque === 'no-cabe' ? 'No cabe en el almacenamiento del navegador'
          : 'Hace falta el título');
      if (r.porque === 'sin-titulo') tit.focus();
      return;
    }
    tit.value = ''; dur.value = '';          // el momento se queda: suelen ir seguidos
    pintaSesiones();
    tit.focus();
  }

  /* La hoja de la sesión para imprimir o guardar en PDF. No es una pantalla
     nueva: es una ventana con el texto y un poco de CSS, que es lo que hace
     falta para llevarla al campo en papel. Se abre sin nombres si no los hay. */
  function imprimeSesion() {
    var s = PTEquipo.sesionDe(sesFecha);
    if (!s.ejercicios.length) { toast('Esta sesión no tiene ejercicios'); return; }
    var v = window.open('', '_blank');
    if (!v) { toast('El navegador ha bloqueado la ventana de impresión'); return; }

    var d = v.document;
    d.title = 'Sesión · ' + diaLargo(s.fecha, true);
    var est = d.createElement('style');
    est.textContent =
      'body{font:13px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;' +
      'margin:28px;max-width:720px}' +
      'h1{font-size:19px;margin:0 0 2px}h2{font-size:14px;margin:0 0 18px;font-weight:400;color:#555}' +
      'ol{padding-left:20px;margin:0}li{margin:0 0 12px;break-inside:avoid}' +
      'li b{display:block;font-size:14px}li small{color:#555;font-size:12px}' +
      '.tot{margin:20px 0 0;padding-top:10px;border-top:1px solid #ccc;color:#555;font-size:12px}' +
      '@media print{body{margin:0}}';
    d.head.appendChild(est);

    function mete(padre, etiqueta, texto, clase) {
      var el = d.createElement(etiqueta);
      el.textContent = texto;
      if (clase) el.className = clase;
      padre.appendChild(el);
      return el;
    }
    mete(d.body, 'h1', s.nombre || 'Sesión de entrenamiento');
    mete(d.body, 'h2', diaLargo(s.fecha, true) +
         (s.hayAsistencia ? ' · ' + s.presentes.length +
            (s.presentes.length === 1 ? ' jugador' : ' jugadores') : ''));
    var ol = d.createElement('ol');
    s.ejercicios.forEach(function (e) {
      var li = d.createElement('li');
      mete(li, 'b', e.titulo);
      var t = [e.momento, e.duracion].filter(Boolean).join(' · ');
      if (t) mete(li, 'small', t);
      ol.appendChild(li);
    });
    d.body.appendChild(ol);
    var tot = [s.ejercicios.length + (s.ejercicios.length === 1 ? ' ejercicio' : ' ejercicios')];
    if (s.minutos) tot.push(s.minutos + ' min');
    mete(d.body, 'p', tot.join(' · '), 'tot');
    v.focus();
    setTimeout(function () { v.print(); }, 120);
  }

  /* =========================================================================
     LOS PARTIDOS

     La misma forma que Sesiones —una lista y uno por dentro, dentro de la misma
     pestaña— porque es el mismo gesto y no hacía falta inventar otro.

     Lo que se cuida aquí es el camino corto. Apuntar un partido se hace el
     domingo por la tarde y con prisa, así que al abrir uno nuevo ya viene la
     fecha de hoy, la duración según la modalidad y NADIE marcado. Marcas a los
     que jugaron —un toque cada uno, que les pone los minutos enteros del
     partido— y Guardar. Los goles, las asistencias y las tarjetas son campos
     que aparecen al marcar a alguien: si no los tocas, quedan a cero, que es lo
     que pasa en casi todas las fichas de casi todos los partidos.
     ====================================================================== */
  var parId = null;                 // el partido abierto, o null si se ve la lista
  var parBorrador = null;           // lo que se está editando, sin guardar aún

  function pintaPartidos() {
    if (!window.PTEquipo) return;
    if (parId === null && !parBorrador) pintaListaPartidos();
    else pintaDetallePartido();
  }

  function vaAPartidos() {
    parId = null; parBorrador = null; arriba(); pintaPartidos();
  }

  function abrePartido(id) {
    var p = id ? PTEquipo.partidoDe(id) : null;
    if (id && !p) { toast('Ese partido ya no está'); vaAPartidos(); return; }
    parId = id || null;
    parBorrador = p ? copiaPartido(p) : partidoNuevo();
    arriba();
    pintaPartidos();
  }

  function partidoNuevo() {
    return {
      fecha: PTEquipo.hoyISO(),
      rival: '', casa: true, competicion: '',
      duracion: PTEquipo.duracionSugerida(prefs().pitch),
      golesFavor: null, golesContra: null,
      convocados: []
    };
  }

  function copiaPartido(p) {
    return {
      fecha: p.fecha, rival: p.rival, casa: p.casa, competicion: p.competicion,
      duracion: p.duracion, golesFavor: p.golesFavor, golesContra: p.golesContra,
      convocados: p.convocados.map(function (c) {
        return { id: c.id, minutos: c.minutos, goles: c.goles,
                 asistencias: c.asistencias, amarillas: c.amarillas, roja: c.roja };
      })
    };
  }

  /* ---- la lista ---- */

  function pintaListaPartidos() {
    $('#par-diario').hidden = false;
    $('#par-detalle').hidden = true;

    var st = PTEquipo.estadisticasPartidos();
    var e = st.equipo;
    var temp = PTEquipo.temporadaActual();

    if (!e.partidos) {
      $('#par-resumen').textContent = 'Temporada ' + temp + ', todavía sin partidos.';
    } else {
      var t = [e.partidos + (e.partidos === 1 ? ' partido' : ' partidos')];
      if (e.jugados) {
        t.push(e.victorias + 'G · ' + e.empates + 'E · ' + e.derrotas + 'P');
        t.push(e.golesFavor + '-' + e.golesContra);
      }
      $('#par-resumen').textContent = 'Temporada ' + temp + ': ' + t.join(' · ');
    }

    var caja = $('#par-meses');
    caja.textContent = '';
    PTEquipo.porMeses(st.lista).forEach(function (m) {
      var h = document.createElement('p');
      h.className = 'ses-mes';
      h.textContent = m.nombre;
      caja.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'ses-dias';
      m.sesiones.forEach(function (p) { ul.appendChild(filaPartido(p)); });
      caja.appendChild(ul);
    });

    pintaTablaPartidos(st.jugadores);

    $('#par-nota').textContent = e.partidos
      ? 'Los minutos de partido van por su cuenta: no se mezclan con los del ' +
        'entrenamiento ni cuentan como asistencia.'
      : 'Apunta un partido y lleva la cuenta de minutos, goles, asistencias y ' +
        'tarjetas de cada uno. Se puede apuntar a mano, sin haberlo preparado aquí.';
  }

  function filaPartido(p) {
    var li = document.createElement('li');
    var res = PTEquipo.resultadoDe(p);
    li.className = 'ses-dia par-dia' + (res ? ' es-' + res : '');

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ses-dia-btn';

    var fecha = document.createElement('span');
    fecha.className = 'ses-dia-fecha';
    fecha.textContent = p.fecha === PTEquipo.hoyISO() ? 'Hoy' : diaCorto(p.fecha);
    b.appendChild(fecha);

    var med = document.createElement('span');
    med.className = 'ses-dia-med';
    // El nombre del rival lo escribe el entrenador: por el DOM, nunca innerHTML.
    var tit = document.createElement('b');
    tit.textContent = p.rival
      ? (p.casa ? 'vs ' : 'en ') + p.rival
      : (p.casa ? 'Partido en casa' : 'Partido fuera');
    if (!p.rival) tit.className = 'flojo';
    med.appendChild(tit);

    var sub = document.createElement('small');
    var t = [];
    if (p.competicion) t.push(p.competicion);
    var cuantos = p.convocados.filter(function (c) { return c.minutos > 0; }).length;
    if (cuantos) t.push(cuantos + (cuantos === 1 ? ' jugador' : ' jugadores'));
    else if (p.convocados.length) t.push('Convocatoria sin minutos');
    else t.push('Falta apuntar quién jugó');
    sub.textContent = t.join(' · ');
    med.appendChild(sub);
    b.appendChild(med);

    var marc = document.createElement('span');
    marc.className = 'par-marca';
    marc.textContent = res ? p.golesFavor + '–' + p.golesContra : '–';
    if (!res) marc.classList.add('flojo');
    b.appendChild(marc);

    b.setAttribute('aria-label', 'Abrir el partido del ' + diaLargo(p.fecha, true));
    b.addEventListener('click', function () { abrePartido(p.id); });
    li.appendChild(b);
    return li;
  }

  function pintaTablaPartidos(filas) {
    var hay = filas.length > 0;
    $('#par-tabla-tit').hidden = !hay;
    $('#par-tabla-marco').hidden = !hay;
    var tb = $('#par-tabla');
    tb.textContent = '';
    if (!hay) return;

    filas.forEach(function (f) {
      var tr = document.createElement('tr');
      if (f.baja) tr.className = 'flojo';

      var th = document.createElement('th');
      th.scope = 'row';
      var quien = document.createElement('span');
      quien.className = 'par-quien';
      if (f.dorsal) {
        var d = document.createElement('span');
        d.className = 'squad-dorsal';
        d.textContent = f.dorsal;
        quien.appendChild(d);
      }
      // El nombre lo escribe el entrenador: por el DOM, nunca por innerHTML.
      var n = document.createElement('b');
      n.textContent = f.nombre;
      quien.appendChild(n);
      th.appendChild(quien);
      tr.appendChild(th);

      [f.jugados, f.minutos, f.goles, f.asistencias, f.amarillas, f.rojas]
        .forEach(function (v) {
          var td = document.createElement('td');
          td.textContent = String(v);
          if (!v) td.className = 'cero';
          tr.appendChild(td);
        });
      tb.appendChild(tr);
    });
  }

  /* ---- uno por dentro ---- */

  function convocadoDe(id) {
    var l = parBorrador.convocados.filter(function (c) { return c.id === id; });
    return l.length ? l[0] : null;
  }

  function pintaDetallePartido() {
    $('#par-diario').hidden = true;
    $('#par-detalle').hidden = false;

    var p = parBorrador;
    $('#par-titulo').textContent = parId ? 'El partido' : 'Un partido nuevo';
    $('#par-borrar').hidden = !parId;

    $('#par-fecha').value = p.fecha;
    $('#par-rival').value = p.rival;
    $('#par-competicion').value = p.competicion;
    $('#par-duracion').value = String(p.duracion);
    $('#par-gf').value = p.golesFavor == null ? '' : String(p.golesFavor);
    $('#par-gc').value = p.golesContra == null ? '' : String(p.golesContra);
    $$('#par-donde [data-casa]').forEach(function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.casa === '1') === !!p.casa));
    });

    /* Que el marcador sea SIEMPRE el tuyo primero, juegues donde juegues, es la
       clase de cosa que hay que decir una vez y no volver a dudar. */
    $('#par-marcador-nota').textContent = p.casa
      ? 'Los tuyos primero. Déjalo vacío si no quieres apuntar el resultado.'
      : 'Los tuyos primero, aunque juguéis fuera. Déjalo vacío si no lo apuntas.';

    pintaJugadoresDelPartido();
  }

  function pintaJugadoresDelPartido() {
    var lista = PTEquipo.jugadores(null, true);
    var ul = $('#par-jugadores');
    ul.textContent = '';

    // Los de baja solo salen si jugaron: si no, ensucian la convocatoria.
    lista = lista.filter(function (j) { return !j.baja || convocadoDe(j.id); });

    lista.forEach(function (j) { ul.appendChild(filaDelPartido(j)); });

    cuentaDelPartido();
    $('#par-jug-nota').textContent = lista.length
      ? 'Marcar a uno le pone los minutos enteros del partido. Cámbialos si salió ' +
        'del banquillo, y déjalo a 0 si se quedó sin jugar.'
      : 'Monta tu plantilla en Plantilla y aquí solo tendrás que marcar quién jugó.';
  }

  function filaDelPartido(j) {
    var c = convocadoDe(j.id);
    var li = document.createElement('li');
    li.className = 'squad-fila par-fila' + (c ? '' : ' falta');

    var lab = document.createElement('label');
    lab.className = 'squad-marca';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!c;
    cb.setAttribute('aria-label', 'Jugó ' + j.nombre);

    var dor = document.createElement('span');
    dor.className = 'squad-dorsal';
    dor.textContent = j.dorsal;

    var nom = document.createElement('span');
    nom.className = 'squad-nombre';
    nom.textContent = j.nombre;

    lab.appendChild(cb); lab.appendChild(dor); lab.appendChild(nom);
    li.appendChild(lab);

    // Los números, solo cuando hay a quién ponérselos.
    var cifras = document.createElement('div');
    cifras.className = 'par-cifras';
    cifras.hidden = !c;
    li.appendChild(cifras);

    [['minutos', 'Min', 3, 'Minutos de ' + j.nombre],
     ['goles', 'G', 2, 'Goles de ' + j.nombre],
     ['asistencias', 'A', 2, 'Asistencias de ' + j.nombre],
     ['amarillas', 'TA', 1, 'Amarillas de ' + j.nombre]].forEach(function (campo) {
      var w = document.createElement('label');
      w.className = 'par-cifra';
      var t = document.createElement('span');
      t.textContent = campo[1];
      var i = document.createElement('input');
      i.type = 'text';
      i.inputMode = 'numeric';
      i.maxLength = campo[2];
      i.value = c ? String(c[campo[0]]) : '';
      i.setAttribute('aria-label', campo[3]);
      i.addEventListener('input', function () {
        var cc = convocadoDe(j.id);
        if (!cc) return;
        var n = parseInt(i.value.replace(/\D/g, ''), 10);
        cc[campo[0]] = isFinite(n) ? n : 0;
        if (campo[0] === 'minutos') cuentaDelPartido();
      });
      w.appendChild(t); w.appendChild(i);
      cifras.appendChild(w);
    });

    // La roja es un sí o un no, no una cuenta.
    var roja = document.createElement('label');
    roja.className = 'par-roja';
    var rcb = document.createElement('input');
    rcb.type = 'checkbox';
    rcb.checked = !!(c && c.roja);
    rcb.setAttribute('aria-label', 'Roja a ' + j.nombre);
    var rt = document.createElement('span');
    rt.textContent = 'Roja';
    rcb.addEventListener('change', function () {
      var cc = convocadoDe(j.id);
      if (cc) cc.roja = rcb.checked;
    });
    roja.appendChild(rcb); roja.appendChild(rt);
    cifras.appendChild(roja);

    cb.addEventListener('change', function () {
      marcaDelPartido(j.id, cb.checked);
      li.classList.toggle('falta', !cb.checked);
      cifras.hidden = !cb.checked;
      var cc = convocadoDe(j.id);
      if (cc) {
        var ins = cifras.querySelectorAll('input[type="text"]');
        ins[0].value = String(cc.minutos);
        ins[1].value = String(cc.goles);
        ins[2].value = String(cc.asistencias);
        ins[3].value = String(cc.amarillas);
        rcb.checked = !!cc.roja;
      }
      cuentaDelPartido();
    });

    return li;
  }

  /* Marcar a uno le pone los minutos enteros del partido: es lo que pasa la
     mayoría de las veces y quita un campo que rellenar a mano once veces. */
  function marcaDelPartido(id, dentro) {
    if (!dentro) {
      parBorrador.convocados = parBorrador.convocados.filter(function (c) {
        return c.id !== id;
      });
      return;
    }
    if (convocadoDe(id)) return;
    parBorrador.convocados.push({
      id: id, minutos: parBorrador.duracion, goles: 0, asistencias: 0,
      amarillas: 0, roja: false
    });
  }

  function cuentaDelPartido() {
    var total = PTEquipo.jugadores().length;
    var jug = parBorrador.convocados.filter(function (c) { return c.minutos > 0; }).length;
    var banco = parBorrador.convocados.length - jug;
    var txt = jug + ' de ' + total + (jug === 1 ? ' jugó' : ' jugaron');
    if (banco) txt += ' · ' + banco + ' sin minutos';
    $('#par-cuenta').textContent = txt;
  }

  function leeCamposDelPartido() {
    var p = parBorrador;
    p.fecha = $('#par-fecha').value || p.fecha;
    p.rival = $('#par-rival').value;
    p.competicion = $('#par-competicion').value;
    var dur = parseInt($('#par-duracion').value.replace(/\D/g, ''), 10);
    if (isFinite(dur) && dur > 0) p.duracion = dur;
    var gf = $('#par-gf').value.replace(/\D/g, '');
    var gc = $('#par-gc').value.replace(/\D/g, '');
    p.golesFavor = gf === '' ? null : Number(gf);
    p.golesContra = gc === '' ? null : Number(gc);
  }

  function guardaElPartido() {
    leeCamposDelPartido();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parBorrador.fecha)) {
      toast('Falta la fecha del partido');
      $('#par-fecha').focus();
      return;
    }
    var r = PTEquipo.guardaPartido(parId, parBorrador);
    if (!r.ok) {
      toast(r.porque === 'tope' ? 'Ya hay ' + 200 + ' partidos guardados'
          : r.porque === 'no-cabe' ? 'No cabe en el almacenamiento del navegador'
          : 'No se ha podido guardar');
      return;
    }
    var nuevo = !parId;
    vaAPartidos();
    pintaCajon();
    toast(nuevo ? 'Partido apuntado' : 'Partido guardado');
  }

  function borraElPartido() {
    if (!parId) return;
    ask({ title: '¿Borrar el partido?',
          message: 'Se van también los minutos, los goles y las tarjetas de ese día. ' +
                   'Lo demás no se toca.',
          ok: 'Borrar', danger: true })
      .then(function (si) {
        if (!si) return;
        PTEquipo.quitaPartido(parId);
        vaAPartidos();
        pintaCajon();
        toast('Partido borrado');
      });
  }

  /* =========================================================================
     ESTADÍSTICAS

     Se calcula todo aquí, leyendo las sesiones guardadas en este navegador.
     Ni una llamada a la red.
     ====================================================================== */
  var statsPeriodo = 'micro';
  var statsOrden = 'minutos';

  /* De menos a más asistencia: si la lista se ordena para encontrar al que
     falta, el que falta va arriba. A igualdad, primero el que menos minutos
     lleva, que es el que más razones tiene para estar en lo alto. */
  function porAsistencia(a, b) {
    var ra = a.deSesiones ? a.sesiones / a.deSesiones : 1;
    var rb = b.deSesiones ? b.sesiones / b.deSesiones : 1;
    if (ra !== rb) return ra - rb;
    if (a.minutos !== b.minutos) return a.minutos - b.minutos;
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  }

  function pintaStats() {
    var d = PTEquipo.estadisticas(statsPeriodo);
    $$('#stats-periodo [data-periodo]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.periodo === statsPeriodo));
    });

    var cuando = statsPeriodo === 'micro' ? 'los últimos 7 días'
               : statsPeriodo === 'mes' ? 'los últimos 30 días'
               : 'la temporada ' + PTEquipo.temporadaActual();
    var trozos = [d.ejercicios + (d.ejercicios === 1 ? ' ejercicio' : ' ejercicios'),
                  d.minutos + ' min'];
    if (d.sesiones) trozos.push(d.sesiones + (d.sesiones === 1 ? ' sesión' : ' sesiones'));
    if (d.sinDuracion) trozos.push(d.sinDuracion + ' sin duración');
    $('#stats-resumen').textContent = 'En ' + cuando + ': ' + trozos.join(' · ');

    // El aviso de lo que lleva mucho sin tocarse. Va sobre todo el historial,
    // no sobre el periodo: la pregunta no cambia porque mires la semana.
    var caja = $('#stats-olvido');
    caja.textContent = '';
    if (d.olvidados.length) {
      var p = document.createElement('p');
      p.className = 'stats-olvido';
      p.appendChild(document.createTextNode('Llevas sin trabajar: '));
      d.olvidados.forEach(function (o, i) {
        if (i) p.appendChild(document.createTextNode(' · '));
        var b = document.createElement('b');
        b.textContent = o.nombre + ' (' + o.dias + ' días)';
        p.appendChild(b);
      });
      caja.appendChild(p);
    }

    /* Y de aquí se sale hacia algún sitio.

       Datos te decía lo que te falta y ahí se acababa: una frase muerta. El
       generador ya existe, ya tiene un contexto llamado «Lo que te hace falta»
       y ya lee estas mismas cuentas. Las dos piezas estaban hechas y no se
       hablaban; lo único que faltaba era el puente. No se añade ninguna función
       nueva, se enlaza lo que ya hay.

       Sale con CUALQUIERA de las dos señales, no solo con «llevas sin
       trabajar»: esa lista solo recoge fases que trabajaste y dejaste 21 días,
       así que un entrenador que empieza no la ve nunca. Lo que sí ve desde el
       primer día son las fases sin tocar del radar. Si no hay ni una cosa ni
       la otra, no hay nada que recomendar y no sale botón. */
    /* Solo se recomienda contra lo que YA has hecho. Sin un solo ejercicio
       apuntado, «te faltan las seis fases» es verdad y no dice nada: no has
       empezado. Un recién llegado vería un cartel de recomendación en una
       pantalla vacía, y el generador no tendría de dónde tirar. La lista de
       «llevas sin trabajar» sí vale aunque el periodo esté vacío, porque mira
       todo el historial: se entra por cualquiera de las dos puertas. */
    var hayHistorial = d.ejercicios > 0;
    var hueco = PTEquipo.equilibrio(statsPeriodo);
    if (hayHistorial && hueco && hueco.sinTocar) {
      /* El porqué, antes del botón. Un «monta una sesión con lo que falta» sin
         decir qué falta es una recomendación que hay que creerse; con la cuenta
         delante, se entiende y se puede discutir. El número sale del mismo
         radar que hay debajo, no de ningún cálculo nuevo. */
      var q = document.createElement('p');
      q.className = 'stats-olvido';
      q.textContent = hueco.sinTocar === 1
        ? 'En este periodo te falta una de las seis fases del juego.'
        : 'En este periodo te faltan ' + hueco.sinTocar + ' de las seis fases del juego.';
      caja.appendChild(q);
    }
    if (d.olvidados.length || (hayHistorial && hueco && hueco.sinTocar)) {
      var ir = document.createElement('button');
      ir.type = 'button';
      ir.className = 'tbtn marco';
      ir.id = 'stats-a-sesion';
      ir.textContent = 'Montar una sesión con lo que falta';
      ir.addEventListener('click', function () {
        vaApartado('sesiones');
        abreGenerador();
        // El generador arranca ya en «Lo que te hace falta»: es de donde viene
        // quien pulsa. Lo deja así pintaGenerador().
      });
      caja.appendChild(ir);
    }

    pintaRadar($('#stats-radar'), PTEquipo.equilibrio(statsPeriodo));

    /* El reparto se saca contra los minutos QUE ESTÁN REPARTIDOS, no contra el
       total. Iba contra el total, y como un ejercicio sin momento del juego
       suma al total pero no sale en ninguna barra, las barras nunca llegaban a
       100 y nada explicaba el hueco. */
    pintaBarras($('#stats-momentos'), d.momentos.map(function (m) {
      return { nombre: m.nombre, minutos: m.minutos };
    }), { total: d.minutosConMomento, destaca: true, nombrePct: 'del reparto' });

    /* Y lo que se queda fuera se dice, en vez de desaparecer. No como una barra
       de «(sin clasificar)» —eso no dice nada de fútbol— sino como una frase
       que además explica qué hacer: el momento del juego se pone al guardar el
       ejercicio o al añadirlo a la sesión. */
    var fuera = $('#stats-momentos-fuera');
    var sm = d.sinMomento || { ejercicios: 0, minutos: 0 };
    fuera.hidden = !sm.ejercicios;
    if (sm.ejercicios) {
      fuera.textContent = sm.ejercicios === 1
        ? 'Un ejercicio más (' + sm.minutos + ' min) no entra en este reparto porque no ' +
          'tiene momento del juego. Se lo pones al guardarlo o al añadirlo a la sesión.'
        : sm.ejercicios + ' ejercicios más (' + sm.minutos + ' min) no entran en este ' +
          'reparto porque no tienen momento del juego. Se lo pones al guardarlos o al ' +
          'añadirlos a la sesión.';
    }

    var jug = d.jugadores.map(function (j) {
      return { dorsal: j.dorsal, nombre: j.nombre, minutos: j.minutos,
               sesiones: j.sesiones, deSesiones: j.deSesiones, fuera: j.fuera };
    });
    // La lista viene ordenada por minutos. Ordenarla por asistencia es lo que
    // contesta a «¿quién me está faltando?», que es la pregunta por la que se
    // abre esta pantalla la mitad de las veces.
    if (statsOrden === 'asistencia') jug.sort(porAsistencia);
    $$('#stats-orden [data-orden]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.orden === statsOrden));
    });
    pintaBarras($('#stats-jugadores'), jug,
                { asistencia: true, destaca: statsOrden === 'minutos' });

    var faltones = jug.filter(function (j) {
      return j.deSesiones > 0 && j.sesiones < j.deSesiones * POCO;
    }).length;
    $('#stats-jugadores-pie').textContent = !d.sesiones
      ? 'Apunta quién viene a cada entrenamiento en Plantilla y aquí saldrá la asistencia.'
      : 'Asistencia: entrenamientos a los que ha venido, de ' + d.sesiones +
        ' apuntados en el periodo. ' + (faltones
          ? 'El aviso ⚠ marca a ' + (faltones === 1 ? 'quien ha venido' : faltones +
            ' que han venido') + ' a menos de la mitad.'
          : 'Nadie baja de la mitad.');

    $('#stats-nota').textContent = d.ejercicios
      ? 'Las cuentas se hacen en este dispositivo, con lo que has guardado: ' +
        'no hay ningún servidor echándolas.'
      : 'Guarda algún ejercicio con su duración y su momento del juego, y aquí saldrán las cuentas.';
  }

  /* El radar y las barras viven en graficos.js: dibujo puro, sin estado de la
     aplicación. «pintaBarras» se trae con su nombre de siempre porque su firma
     no cambia; «pintaRadar» sí recibe ahora el periodo y el avisador, que
     antes cogía del cierre. */
  var pintaBarras = window.PTGraficos.pintaBarras;
  var POCO = window.PTGraficos.POCO;        // el umbral de «viene poco»
  function pintaRadar(caja, eq) {
    return window.PTGraficos.pintaRadar(caja, eq, { periodo: statsPeriodo, avisa: toast });
  }

  /* =========================================================================
     Los dos modos

     Dibujar una jugada y llevar un equipo son dos trabajos distintos, y antes
     se peleaban por la misma barra: cada función nueva tenía que buscarse un
     hueco entre botones que eran de otra cosa. Ahora son dos modos, y cada uno
     enseña lo suyo y esconde lo del otro.

     El modo no se guarda entre visitas a propósito: la aplicación es una
     pizarra, y quien la abre viene a dibujar.
     ====================================================================== */
  /* Se entra por «Hoy»: es la pantalla que contesta a la pregunta con la que
     se abre la aplicación. Antes se caía en Plantilla, que es una lista de
     nombres —útil el primer día y poco más—. Desde Hoy se llega a la plantilla
     de un toque, y el propio Hoy lo ofrece cuando todavía no hay. */
  var modo = 'pizarra', eqApartado = 'hoy';
  /* La hoja del móvil se abre y se cierra dentro del cableado, con su estado
     propio. Cambiar de modo tiene que poder cerrarla, así que se deja aquí una
     referencia en vez de repetir la lógica o sacarla de su sitio. */
  var cierraLaHoja = function () {};

  function vaModo(cual, apartado) {
    if (cual === 'equipo' && !window.PTEquipo) {
      toast('No se ha podido cargar la parte del equipo');
      return;
    }
    modo = cual === 'equipo' ? 'equipo' : 'pizarra';
    document.querySelector('.app').dataset.modo = modo;
    pintaCajon();
    cierraLaHoja();
    if (modo === 'equipo') { vaApartado(apartado || eqApartado); }
    else {
      /* Volver a la pizarra la deja como estaba: el campo se mide contra el
         hueco que tiene, y mientras estaba escondido ese hueco era cero. */
      resize();
    }
  }

  /* -------------------------------------------------------------------------
     El cajón.

     «hidden» se quita ANTES de animar y se repone DESPUÉS de cerrarse: mientras
     está escondido de verdad no lo ve ni el teclado ni un lector de pantalla, y
     mientras se mueve tiene que estar ahí para que se le vea moverse. */
  /* ---- el cartel de la primera vez ----

     Cumple el principio de la casa al pie de la letra: no pide nada, no tapa el
     campo y no hay que contestarle para poder dibujar. Solo dice, una vez, que
     el botón de tres rayas lleva a algún sitio.

     Se enseña únicamente en una instalación que no ha hecho nada todavía. Quien
     ya tiene una pizarra guardada, o plantilla, o un partido, no es nuevo: a ese
     se le estaría explicando su propia aplicación. */
  function instalacionNueva() {
    try {
      if (prefs().vistoElCajon) return false;
      var llaves = ['pt-boards', 'pt-squad', 'pt-sesiones', 'pt-partidos', 'pt-asistencia'];
      for (var i = 0; i < llaves.length; i++) {
        var t = localStorage.getItem(llaves[i]);
        if (t && t !== '{}' && t !== '[]') return false;
      }
      return true;
    } catch (e) { return false; }   // sin almacén no se enseña y no se insiste
  }

  function guardaQueYaLoHaVisto() {
    var p = prefs();
    if (p.vistoElCajon) return;
    p.vistoElCajon = true;
    guardaPrefs(p);
  }

  function cierraLaPista() {
    var e = $('#pista-cajon');
    if (!e || e.hidden) return;
    e.hidden = true;
    guardaQueYaLoHaVisto();
  }

  function quizaEnseñaLaPista() {
    var e = $('#pista-cajon');
    if (!e || !instalacionNueva()) return;
    e.hidden = false;
    /* Y se va sola al primer trazo: quien ha empezado a dibujar ya está
       haciendo lo que venía a hacer, y el cartel sobra sin tocarlo. */
    var lienzo = $('#board');
    if (lienzo) lienzo.addEventListener('pointerdown', cierraLaPista, { once: true });
  }

  function abreCajon() {
    cierraLaPista();                 // abrir el menú es haber entendido el cartel
    var c = $('#cajon');
    c.hidden = false;
    pintaCajon();
    requestAnimationFrame(function () {
      c.classList.add('open');
      $('#cajon-scrim').classList.add('show');
      $('#cajon-btn').setAttribute('aria-expanded', 'true');
      var actual = $('.cajon-ir[aria-current="true"]') || $('.cajon-ir');
      if (actual) actual.focus();
    });
  }

  function cierraCajon() {
    var c = $('#cajon');
    if (!c.classList.contains('open')) { c.hidden = true; return; }
    c.classList.remove('open');
    $('#cajon-scrim').classList.remove('show');
    $('#cajon-btn').setAttribute('aria-expanded', 'false');
    setTimeout(function () {
      if (!c.classList.contains('open')) c.hidden = true;
    }, 240);
  }

  /* A dónde lleva cada destino. Cuatro de ellos son apartados de Equipo, que ya
     existían como pestañas: «vaModo» acepta apartado desde el principio, así
     que subirlos al cajón no cambia nada por dentro. Los tres del pie abren lo
     suyo y te dejan donde estabas: ajustes o ayuda no son sitios a los que ir.
     La biblioteca sigue siendo un diálogo; lo que cambia es que ahora se ve. */
  var DESTINOS = {
    hoy:        { modo: 'equipo', apartado: 'hoy',       nombre: 'Hoy' },
    sesiones:   { modo: 'equipo', apartado: 'sesiones',  nombre: 'Sesiones' },
    plantilla:  { modo: 'equipo', apartado: 'plantilla', nombre: 'Plantilla' },
    partidos:   { modo: 'equipo', apartado: 'partidos',  nombre: 'Partidos' },
    datos:      { modo: 'equipo', apartado: 'datos',     nombre: 'Análisis' },
    pizarra:    { modo: 'pizarra',                       nombre: 'Pizarra' },
    ejercicios: { abre: function () { openLibrary(null); },  nombre: 'Ejercicios' },
    cuenta:     { abre: function () { abreCuenta(false); } },
    ajustes:    { abre: function () { abreLosAjustes(); } },
    ayuda:      { abre: function () { $('#dlg-help').showModal(); } }
  };

  function vaDestino(id) {
    var d = DESTINOS[id];
    if (!d) return;
    if (d.abre) { d.abre(); return; }
    vaModo(d.modo, d.apartado);
  }

  /* El botón dice dónde estás. Un icono de tres rayas solo dice «hay más», y
     con el interruptor fuera esa es la única señal de en qué sección andas. */
  function dondeEstoy() {
    if (modo !== 'equipo') return 'pizarra';
    return eqApartado;                       // hoy · sesiones · plantilla · datos
  }

  function pintaCajon() {
    var aqui = dondeEstoy();
    var t = $('#cajon-btn-txt');
    if (t) t.textContent = (DESTINOS[aqui] && DESTINOS[aqui].nombre) || 'Ir a';
    $$('.cajon-ir').forEach(function (b) {
      if (b.dataset.ir === aqui) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    pistasDelCajon();
  }

  /* Cada destino dice en qué estado está lo suyo. Es lo que convierte una lista
     de nombres en algo que guía: ves «sin plantilla» o «la de hoy sin montar» y
     ya sabes dónde te falta trabajo, sin entrar a mirar. */
  function pistasDelCajon() {
    if (!window.PTEquipo) return;
    function pon(id, txt) {
      var e = $('[data-pista="' + id + '"]');
      if (e && txt) e.textContent = txt;
    }
    var jug = PTEquipo.jugadores().length;
    var hoy = PTEquipo.sesionDe(PTEquipo.hoyISO());
    var d = PTEquipo.estadisticas('micro');

    pon('plantilla', jug ? jug + (jug === 1 ? ' jugador' : ' jugadores') : 'Sin montar todavía');
    pon('hoy', !jug ? 'Empieza por aquí'
             : hoy.vacia ? 'La sesión de hoy está sin montar'
             : !hoy.hayAsistencia ? 'Falta apuntar quién vino'
             : 'Todo al día');
    pon('sesiones', hoy.vacia ? 'Hoy no tienes nada apuntado'
                              : 'Hoy: ' + hoy.ejercicios.length +
                                (hoy.ejercicios.length === 1 ? ' ejercicio' : ' ejercicios'));
    var par = PTEquipo.estadisticasPartidos().equipo;
    pon('partidos', !par.partidos ? 'Sin partidos apuntados'
      : par.partidos + (par.partidos === 1 ? ' partido' : ' partidos') +
        (par.jugados ? ' · ' + par.victorias + 'G ' + par.empates + 'E ' + par.derrotas + 'P' : ''));
    pon('datos', d.ejercicios
      ? d.ejercicios + (d.ejercicios === 1 ? ' ejercicio' : ' ejercicios') + ' estos siete días'
      : 'Cuando apuntes algo, sale aquí');
    var cta = $('[data-pista="cuenta"]');
    if (cta) {
      var b = cta.closest('.cajon-ir').querySelector('span');
      if (yo) { b.textContent = 'Tu cuenta'; cta.textContent = comoVaLaCuenta(); }
      else { b.textContent = 'Entrar'; cta.textContent = 'Para compartir y tenerlo en otro sitio'; }
    }
  }

  /* Qué decir debajo de «Tu cuenta». Lo normal es que no haya nada que contar
     y entonces pone el correo, que es lo útil. Se habla de los datos solo
     cuando hay algo que saber. */
  function comoVaLaCuenta() {
    var correo = (yo && yo.email) || 'Entrada';
    if (!sincro) return correo;
    var e = sincro.estado();
    if (e.estado === 'cerrado') return 'Tus datos no se están guardando · toca aquí';
    if (e.estado === 'pendiente' || e.estado === 'sin-red') return correo + ' · sin guardar aún';
    if (e.estado === 'sincronizando') return correo + ' · guardando…';
    if (e.estado === 'listo' && e.cuando) return correo + ' · al día';
    return correo;
  }

  var APARTADOS = { hoy: 1, plantilla: 1, sesiones: 1, partidos: 1, datos: 1 };

  function vaApartado(cual) {
    eqApartado = APARTADOS[cual] ? cual : 'hoy';
    $('#eq-hoy').hidden       = eqApartado !== 'hoy';
    $('#eq-plantilla').hidden = eqApartado !== 'plantilla';
    $('#eq-sesiones').hidden  = eqApartado !== 'sesiones';
    $('#eq-partidos').hidden  = eqApartado !== 'partidos';
    $('#eq-datos').hidden     = eqApartado !== 'datos';
    $$('[data-eq]').forEach(function (b) {
      var suyo = b.dataset.eq === eqApartado;
      b.setAttribute('aria-selected', String(suyo));
      b.setAttribute('aria-pressed', String(suyo));
    });
    pintaCajon();
    if (eqApartado === 'hoy') pintaHoy();
    else if (eqApartado === 'plantilla') pintaApartadoPlantilla();
    else if (eqApartado === 'sesiones') pintaSesiones();
    else if (eqApartado === 'partidos') pintaPartidos();
    else pintaStats();
    var cuerpo = $('#equipo');
    if (cuerpo) cuerpo.scrollTop = 0;
  }

  /* ---- Hoy · qué toca ----------------------------------------------------

     Klym sabía muchas cosas y no decía ninguna. Los minutos por fase, quién
     vino, qué lleva semanas sin tocarse, si hay sesión puesta para hoy: todo
     eso ya se calculaba, repartido entre tres pantallas, y el entrenador tenía
     que juntarlo en su cabeza y decidir solo.

     Esta pantalla no calcula NADA nuevo. Coge esas cuentas y las convierte en
     una frase y un botón. Y cada cosa que dice se puede discutir, porque
     enseña de dónde sale: «llevas 3 fases sin tocar», no «te recomiendo esto».

     El orden no es casual: va de lo que te bloquea a lo que te mejora. Sin
     plantilla no hay nada que hacer; con plantilla pero sin la sesión de hoy,
     lo urgente es esa; y con la sesión puesta, lo útil es mirar qué falta. */
  function pintaHoy() {
    var caja = $('#eq-hoy');
    caja.textContent = '';

    var jug = PTEquipo.jugadores();
    var hoy = PTEquipo.hoyISO();
    var ses = PTEquipo.sesionDe(hoy);
    var d = PTEquipo.estadisticas('micro');
    var eq = PTEquipo.equilibrio('micro');

    function bloque(rotulo) {
      var h = document.createElement('p');
      h.className = 'form-group';
      h.textContent = rotulo;
      caja.appendChild(h);
    }
    function dice(txt, clase) {
      var p = document.createElement('p');
      p.className = clase || 'hoy-frase';
      p.textContent = txt;
      caja.appendChild(p);
      return p;
    }
    /* Esta pantalla contesta a «¿qué hago ahora?», y esa pregunta tiene una
       respuesta, no dos. Dos botones rojos en la misma pantalla obligan a
       elegir justo a quien ha entrado para que le digan. El primero que pide
       ser principal se lo queda —son los bloques en orden de urgencia— y los
       demás bajan a secundarios aunque los pidan. */
    var yaHayPrincipal = false;
    function boton(txt, alPulsar, principal) {
      var manda = principal && !yaHayPrincipal;
      if (manda) yaHayPrincipal = true;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbtn ' + (manda ? 'primary' : 'marco');
      b.textContent = txt;
      b.addEventListener('click', alPulsar);
      caja.appendChild(b);
      return b;
    }

    // ---- 1 · lo primero que falta ----
    bloque('Lo siguiente');
    if (!jug.length) {
      dice('Todavía no tienes plantilla. Sin ella no se puede apuntar quién ' +
           'viene a entrenar ni saber cuántos minutos lleva cada uno.');
      boton('Montar la plantilla', function () { vaApartado('plantilla'); }, true);
    } else if (!ses || !ses.ejercicios.length) {
      dice('Hoy no tienes sesión apuntada. Ponla y, al acabar, marca quién vino: ' +
           'de ahí salen todas las cuentas.');
      boton('La sesión de hoy', function () {
        vaApartado('sesiones');
        abreSesion(hoy);
      }, true);
    } else {
      var min = ses.ejercicios.reduce(function (a, e) {
        return a + (PTEquipo.minutosDe ? (PTEquipo.minutosDe(e.duracion) || 0) : 0);
      }, 0);
      dice('La sesión de hoy está puesta: ' + ses.ejercicios.length +
           (ses.ejercicios.length === 1 ? ' ejercicio' : ' ejercicios') +
           (min ? ' · ' + min + ' min' : '') + '.');

      /* Y aquí se cierra el círculo: entrenar → REGISTRAR. Apuntar quién vino
         es el paso que más se olvida y del que dependen todas las cuentas de
         después; los minutos de un ejercicio son de quien estuvo. Si no está
         apuntado, se pide desde aquí en vez de esperar a que alguien se
         acuerde de ir a Plantilla. */
      /* Con «presentesDe» no basta: cuando el día no tiene lista, devuelve la
         plantilla entera, que es lo razonable para proponerla marcada. Pero
         aquí la pregunta es otra —¿se ha pasado lista o no?— y «todos» se leía
         como «ya está hecho». Eso lo dice «hayAsistencia», que distingue entre
         no haber apuntado nada y haber apuntado que vinieron todos. */
      var vinieron = ses.presentes || [];
      if (!ses.hayAsistencia) {
        dice('Falta apuntar quién vino. Sin eso, los minutos de hoy no son de nadie ' +
             'y no cuentan en la asistencia.', 'block-note');
        boton('Apuntar quién ha venido', function () {
          vaApartado('sesiones');
          abreSesion(hoy);
          abrePasarLista();          // la pantalla de asistencia, que ya existe
        }, true);
      } else {
        dice('Vinieron ' + vinieron.length + ' de ' + jug.length + '.', 'block-note');
      }
      boton('Ver la sesión', function () { vaApartado('sesiones'); abreSesion(hoy); });
    }

    // ---- 2 · qué se ha entrenado ----
    bloque('Estos siete días');
    if (!d.ejercicios) {
      dice('Nada apuntado todavía. En cuanto guardes un ejercicio en una sesión, ' +
           'aquí empiezan a salir las cuentas.');
    } else {
      dice(d.ejercicios + (d.ejercicios === 1 ? ' ejercicio' : ' ejercicios') +
           ' · ' + d.minutos + ' min' +
           (d.sesiones ? ' · ' + d.sesiones + (d.sesiones === 1 ? ' sesión' : ' sesiones') : ''));
      var top = d.momentos.slice(0, 2).map(function (m) {
        return m.nombre.toLowerCase() + ' (' + m.minutos + ' min)';
      });
      if (top.length) dice('Sobre todo ' + top.join(' y ') + '.', 'block-note');
    }

    /* ---- 3 · lo que se juega ----
       Entrenar es la mitad; la otra mitad es el domingo. Este bloque existe
       para que el partido no se quede sin apuntar por no saber dónde va: la
       primera vez lo explica, y a partir de ahí lleva la cuenta y avisa de lo
       que esté a medias, que casi siempre es el resultado o quién jugó. */
    if (jug.length) {
      var par = PTEquipo.estadisticasPartidos();
      var hoyPar = par.lista.filter(function (p) { return p.fecha === hoy; });
      var aMedias = par.lista.filter(function (p) {
        return !p.convocados.length || PTEquipo.resultadoDe(p) === null;
      });
      bloque('Los partidos');
      if (hoyPar.length && !hoyPar[0].convocados.length) {
        dice('Hoy tienes un partido apuntado y todavía no dice quién jugó.');
        boton('Apuntar quién jugó', function () {
          vaApartado('partidos'); abrePartido(hoyPar[0].id);
        }, true);
      } else if (!par.equipo.partidos) {
        dice('Cuando juguéis, apúntalo aquí: quién salió, cuántos minutos, ' +
             'goles, asistencias y tarjetas. Se puede apuntar a mano, aunque no ' +
             'lo hayas preparado en la aplicación.');
        boton('Apuntar un partido', function () {
          vaApartado('partidos'); abrePartido(null);
        });
      } else {
        var e2 = par.equipo;
        dice(e2.partidos + (e2.partidos === 1 ? ' partido' : ' partidos') +
             ' esta temporada' +
             (e2.jugados ? ' · ' + e2.victorias + 'G · ' + e2.empates + 'E · ' +
                           e2.derrotas + 'P · ' + e2.golesFavor + '-' + e2.golesContra : '') + '.');
        if (aMedias.length) {
          dice(aMedias.length === 1
            ? 'Uno se quedó a medias: le falta el resultado o quién jugó.'
            : aMedias.length + ' se quedaron a medias: les falta el resultado o quién jugó.',
            'block-note');
          boton('Terminar de apuntarlo' + (aMedias.length > 1 ? 's' : ''), function () {
            vaApartado('partidos'); abrePartido(aMedias[0].id);
          });
        } else {
          boton('Apuntar un partido', function () {
            vaApartado('partidos'); abrePartido(null);
          });
        }
      }
    }

    // ---- 4 · qué falta ----
    if (d.ejercicios && eq && eq.sinTocar) {
      bloque('Lo que te falta');
      var sinTocar = (eq.ejes || []).filter(function (e) { return !e.minutos; })
        .map(function (e) { return e.nombre.toLowerCase(); });
      dice(sinTocar.length
        ? 'En estos siete días no has tocado ' + enLista(sinTocar) + '.'
        : 'Te faltan ' + eq.sinTocar + ' de las seis fases del juego.');
      if (d.olvidados.length) {
        dice('Y lo que más tiempo lleva parado: ' + d.olvidados.slice(0, 2).map(function (o) {
          return o.nombre.toLowerCase() + ', ' + o.dias + ' días';
        }).join(' · ') + '.', 'block-note');
      }
      boton('Montar una sesión con lo que falta', function () {
        vaApartado('sesiones');
        abreGenerador();
      }, true);
    }

    // ---- 5 · de dónde sale todo esto ----
    var pie = document.createElement('p');
    // «tras-boton» deja pasar el resplandor del botón rojo de arriba. El
    // número vive en la hoja de estilos, con el resto de la escala, y no aquí.
    pie.className = 'block-note tras-boton';
    pie.textContent = 'Todo esto sale de lo que tú has apuntado, y se calcula aquí. ' +
                      'Nada se inventa.';
    caja.appendChild(pie);
  }

  // «a, b y c», como se escribe en castellano.
  function enLista(xs) {
    if (xs.length === 1) return xs[0];
    return xs.slice(0, -1).join(', ') + ' ni ' + xs[xs.length - 1];
  }

  /* La biblioteca, en modo «elegir». Es la misma de siempre, con sus filtros y
     su buscador: lo único que cambia es que el botón grande de cada tarjeta
     añade el ejercicio a la sesión en vez de abrirlo en la pizarra. Una
     pantalla que ya se sabe usar vale más que otra nueva parecida. */
  var libParaSesion = null;         // fecha de la sesión, o null en modo normal

  /* -------------------------------------------------------------------------
     Salir de la biblioteca, en un solo sitio.

     Antes se cerraba con «$('#dlg-lib').close()» desde tres sitios, y el «para
     qué» —la fecha de la sesión para la que estás eligiendo— se limpiaba en el
     evento «close». Ahora se sale por aquí: el día que la biblioteca deje de
     ser un diálogo, esto es lo único que hay que cambiar.

     Conviene decir lo que esto NO es, porque yo mismo lo di por más grave de lo
     que es: NO arregla ningún fallo. Se probó rompiéndolo a propósito y la
     aplicación siguió bien, porque «openLibrary» reinicia el para qué en cada
     apertura. Es un sitio en vez de tres, no una red de seguridad. */
  function cierraBiblioteca() {
    libParaSesion = null;
    var d = $('#dlg-lib');
    if (d && d.open) d.close();
  }

  function openLibrary(paraSesion) {
    libParaSesion = paraSesion || null;
    // La modalidad vuelve a la tuya cada vez que se abre; lo demás también.
    libFiltros = filtrosPorDefecto();
    $('#lib-q').value = '';
    ['#lib-momento', '#lib-duracion', '#lib-cuantos', '#lib-espacio']
      .forEach(function (id) { $(id).value = ''; });
    $('#lib-pitch').value = libFiltros.pitch;
    $('#dlg-lib-t').textContent = libParaSesion ? 'Elegir para la sesión' : 'Biblioteca';
    /* En una pantalla ancha los cinco desplegables caben y no estorban; en un
       móvil son media pantalla antes del primer ejercicio. Se decide al abrir,
       no en el HTML, porque el mismo archivo se ve en las dos. */
    var mas0 = $('#lib-mas');
    if (mas0) mas0.open = !matchMedia('(max-width: 560px)').matches;
    pintaBiblioteca();
    $('#dlg-lib').showModal();
    cargaNube();
  }

  function meteEnLaSesion(it) {
    var c = it.card || {};
    var r = PTEquipo.añadeEjercicio(libParaSesion, {
      titulo: (c.titulo || it.nombre || '').trim() || 'Sin título',
      momento: c.momento || '',
      duracion: c.duracion || '',
      ref: it.origen === 'mia' && it.fuente === 'local'
        ? { de: 'guardado', nombre: it.nombre }
        : { de: 'catalogo', id: it.id },
      quienes: null
    });
    if (!r.ok) {
      toast(r.porque === 'tope'
        ? 'La sesión ya lleva ' + PTEquipo.TOPE_EJERCICIOS + ' ejercicios'
        : 'No se ha podido añadir');
      return;
    }
    toast('Añadido a la sesión');
    pintaSesiones();
  }

  // ---- Sugerencias campo a campo ----
  // Lo básico de lo que partir, para no escribir «4 × 3 min» cuarenta veces.
  var SUGERENCIAS = {
    duracion:  ['8 min', '10 min', '12 min', '15 min', '20 min', '25 min', '30 min'],
    series:    ['3 × 3 min', '4 × 2 min', '4 × 3 min', '5 × 2 min', '2 × 8 min',
                '8 repeticiones', '10 lanzamientos'],
    descanso:  ['30 s', '45 s entre series', '1 min entre series', '2 min entre series',
                'Vuelta andando', 'Sin descanso'],
    jugadores: ['3 vs 2', '4 vs 2', '4 vs 4', '5 vs 5', '7 vs 7', '9 vs 9', '11 vs 11',
                '+ 2 comodines', 'Grupo entero'],
    porteros:  ['Sin portero', '1', '2'],
    espacio:   ['15 × 15 m', '20 × 20 m', '30 × 20 m', '40 × 30 m',
                'Medio campo', 'Campo completo'],
    material:  ['Conos y balones', 'Petos, conos y balones', '2 porterías pequeñas',
                'Vallas y escalera', 'Picas y maniquíes'],
    consignas: ['Perfil abierto al recibir', 'Mirar antes de recibir', 'Primer pase al lado libre',
                'Apoyos cerca, no a diez metros', 'Cambiar de orientación si se cierra',
                'Rematar en el primer contacto'],
    normas:    ['Máximo dos toques', 'Un toque', 'Gol tras cambio de banda: doble',
                'Fuera de juego en la línea de medios', 'Diez pases: un punto',
                'Cinco segundos para recuperar'],
    variantes: ['Añadir un comodín', 'Quitar un jugador al equipo que ataca',
                'Reducir el espacio cinco metros', 'Limitar a un toque',
                'Bajar el tiempo de la jugada']
  };

  // En los campos de una línea la sugerencia sustituye; en los de varias, suma una más.
  var SUG_LINEA = { consignas: 1, normas: 1, variantes: 1 };

  function pintaSugerencias() {
    $$('.sugs').forEach(function (caja) {
      var campo = caja.dataset.para.replace(/^f-/, '');
      var lista = SUGERENCIAS[campo];
      if (!lista || caja.childNodes.length) return;
      lista.forEach(function (txt) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'sug'; b.textContent = txt;
        b.addEventListener('click', function () {
          var el = fieldEl(campo);
          if (!el) return;
          if (SUG_LINEA[campo]) {
            var v = el.value.trim();
            var yaEsta = v.split('\n').some(function (l) { return l.trim() === txt; });
            if (!yaEsta) el.value = v ? v + '\n' + txt : txt;
          } else {
            el.value = txt;
          }
          el.focus({ preventScroll: true });
        });
        caja.appendChild(b);
      });
    });
  }

  // ---- Plantillas dentro de la ficha ----

  function aplicaPlantilla(id) {
    var ej = CATALOGO.filter(function (e) { return e.id === id; })[0];
    if (!ej) return;
    CARD_FIELDS.forEach(function (k) {
      var el = fieldEl(k);
      if (!el) return;
      if (k === 'fecha' || k === 'sesion' || k === 'categoria') return;  // eso es tuyo
      el.value = ej.card[k] || '';
    });
    toast('Ficha rellenada con «' + ej.card.titulo + '»');
  }

  function llenaSelectorPlantillas() {
    var sel = $('#f-plantilla');
    if (!sel) return;
    sel.innerHTML = '<option value="">Partir de una plantilla…</option>' +
      CATALOGO.map(function (e) {
        return '<option value="' + e.id + '">' + esc(e.card.titulo) + '</option>';
      }).join('');
  }

  /* ---- Hoja de sesión: todos los fotogramas en una página para llevar al campo ----
     El título se escapa como todo lo demás. Era el ÚNICO sitio de la aplicación
     donde se armaba HTML sin pasar por esc(), y no era inocente: el cuadro de
     texto viene relleno con el título de la ficha, y una ficha puede llegar de
     un enlace que te manden o de la biblioteca común. Con eso, quien te manda
     el enlace escribe HTML dentro de tu hoja. La CSP lo dejaba en un destrozo
     de la hoja impresa; en el archivo único, que no lleva CSP, era ejecución de
     código. Lo encontró una revisión de seguridad, no yo. */
  function printSheet() {
    ask({ title: 'Hoja de sesión', input: card().titulo || 'Sesión del martes',
          placeholder: 'Título de la sesión', ok: 'Preparar' })
      .then(function (title) {
        if (title === null) return;
        var P = PITCH();
        var imgs = doc.frames.map(function (f, i) {
          return '<figure><img src="' + renderFrame(i, 1100).toDataURL('image/png') + '" alt="Fotograma ' + (i + 1) + '">' +
                 '<figcaption>' + (doc.frames.length > 1 ? 'Fotograma ' + (i + 1) : 'Esquema') + '</figcaption></figure>';
        }).join('');

        imprime(
          '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
          '<title>' + esc(title || 'Hoja de sesión') + '</title><style>' +
          '@page{margin:14mm}' +
          'body{margin:0;font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111}' +
          'header{display:flex;justify-content:space-between;align-items:baseline;' +
          'border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px}' +
          'h1{font-size:20px;margin:0}' +
          'header span{font-size:12px;color:#555}' +
          '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}' +
          '.grid.one{grid-template-columns:1fr}' +
          'figure{margin:0;break-inside:avoid}' +
          'img{width:100%;display:block;border:1px solid #ccc;border-radius:4px}' +
          'figcaption{font-size:11px;color:#555;margin-top:4px}' +
          'footer{margin-top:18px;border-top:1px solid #ccc;padding-top:8px;font-size:11px;color:#666}' +
          '.notes{margin-top:16px;border:1px solid #ccc;border-radius:4px;height:70px}' +
          '</style></head><body>' +
          '<header><h1>' + esc(title || 'Hoja de sesión') + '</h1>' +
          '<span>' + PITCHES[doc.pitch].label + ' · ' + P.L + ' × ' + P.W + ' m · ' +
          new Date().toLocaleDateString('es-ES') + '</span></header>' +
          '<div class="grid' + (doc.frames.length === 1 ? ' one' : '') + '">' + imgs + '</div>' +
          '<div class="notes"></div>' +
          '<footer>Klym</footer>' +
          '</body></html>');
        toast('Hoja de sesión preparada');
      });
  }

  // Variantes que aceptan una transformación distinta a la de pantalla.
  function drawObjectOn(c, t, o) {
    var saveT = T; T = t; drawObject(c, t, o); T = saveT;
  }
  function drawStrokeOn(c, t, s) { drawStroke(c, t, s); }

  // Si la pizarra está embebida en otra página, el navegador bloquea las descargas.
  // En ese caso enseñamos el resultado para que se pueda guardar o copiar a mano.
  function embedded() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  function download(blob, name) {
    if (embedded()) { showFile(blob, name); return; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function showFile(blob, name) {
    var dlg = $('#dlg-file');
    var img = $('#file-img'), box = $('#file-text'), note = $('#file-note');
    $('#file-title').textContent = name;
    var video = $('#file-video');
    video.hidden = true; video.removeAttribute('src');
    if (/\.(webm|mp4)$/.test(name)) {
      var vurl = URL.createObjectURL(blob);
      video.src = vurl; video.hidden = false;
      img.hidden = true; box.hidden = true;
      note.textContent = 'Aquí va embebida y el navegador no deja descargar. Reproduce el vídeo y guárdalo con una pulsación larga.';
      dlg.showModal();
      return;
    }
    if (/\.(png|gif)$/.test(name)) {
      var url = URL.createObjectURL(blob);
      img.src = url; img.hidden = false; box.hidden = true;
      note.textContent = 'Aquí va embebida y el navegador no deja descargar. Pulsa y mantén sobre la imagen (o clic derecho) para guardarla.';
      dlg.addEventListener('close', function once() {
        dlg.removeEventListener('close', once);
        setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      });
    } else {
      blob.text().then(function (t) { box.value = t; });
      img.hidden = true; box.hidden = false;
      note.textContent = 'Aquí va embebida y el navegador no deja descargar. Copia este texto y guárdalo como archivo .json.';
    }
    dlg.showModal();
  }

  // ---- Vídeo de la jugada ----------------------------------------------------
  // Se pinta la animación en un lienzo aparte, a resolución fija, y se graba con
  // MediaRecorder. Sin servidores ni bibliotecas externas.
  function canRecord() {
    return typeof MediaRecorder !== 'undefined' &&
           !!HTMLCanvasElement.prototype.captureStream &&
           doc.frames.length > 1;
  }

  // MP4 primero: es lo que graba Safari y lo único que reproducen sin más la app
  // de Fotos del iPhone y WhatsApp. WebM queda como último recurso.
  function pickMime() {
    var opts = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (var i = 0; i < opts.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
    }
    return '';
  }

  /* Los dos codificadores —GIF y MP4— viven en codecs.js: son manejo de bits
     puro, no tocan nada de la aplicación y aquí solo estorbaban. Se traen con
     su nombre de siempre para que quien los usa se lea igual que antes. */
  var medianCut = window.PTCodecs.medianCut,
      quantize  = window.PTCodecs.quantize,
      GifWriter = window.PTCodecs.GifWriter,
      buildMp4  = window.PTCodecs.buildMp4,
      pickAvc   = window.PTCodecs.pickAvc;


  // Genera el GIF pintando la animación fotograma a fotograma en un lienzo aparte.
  function exportGif() {
    if (doc.frames.length < 2) { toast('Añade al menos dos fotogramas para exportar la jugada'); return; }

    var view = viewRect();
    var vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    var W = 520, H = Math.round(W * vh / vw);
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d', { willReadFrequently: true });
    var t = transformFor(W, H, view);

    var FPS = 10, segs = doc.frames.length - 1;
    var total = Math.round(segs * (segMs() / 1000) * FPS);
    var pause = Math.round(FPS * 0.5);          // medio segundo quieto al final

    recording = true;
    setExportBusy(true, 'Preparando el GIF…');

    var shots = [];
    for (var f = 0; f <= total + pause; f++) {
      var p = Math.min(f, total) / Math.max(1, total) * segs;
      var seg = clamp(Math.floor(p), 0, segs - 1);
      c.clearRect(0, 0, W, H);
      drawPitch(c, t, view);
      drawAnimatedInto(c, t, seg, ease(clamp(p - seg, 0, 1)));
      shots.push(c.getImageData(0, 0, W, H).data);
    }

    // paleta común a toda la secuencia, para que no parpadee entre fotogramas
    var samples = [];
    shots.forEach(function (d, i) {
      var step = (i % 3 === 0) ? 40 : 160;      // se muestrea más el primero de cada tres
      for (var q = 0; q < d.length; q += 4 * step) samples.push(d[q], d[q + 1], d[q + 2]);
    });
    var palette = medianCut(samples, 255);

    var gif = new GifWriter(W, H, palette, Math.round(100 / FPS));
    var cache = new Map();
    var prev = null;

    shots.forEach(function (d) {
      var idx = quantize(d, palette, cache);
      if (!prev) {
        gif.addFrame(idx, 0, 0, W, H);
        prev = idx;
        return;
      }
      // rectángulo mínimo que ha cambiado
      var x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (var y = 0; y < H; y++) {
        var row = y * W;
        for (var x = 0; x < W; x++) {
          if (idx[row + x] !== prev[row + x]) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }   // sin cambios: un píxel basta
      var fw = x1 - x0 + 1, fh = y1 - y0 + 1;
      var sub = new Uint8Array(fw * fh);
      for (var yy = 0; yy < fh; yy++) {
        sub.set(idx.subarray((y0 + yy) * W + x0, (y0 + yy) * W + x0 + fw), yy * fw);
      }
      gif.addFrame(sub, x0, y0, fw, fh);
      prev = idx;
    });

    var blob = new Blob([gif.finish()], { type: 'image/gif' });
    recording = false;
    setExportBusy(false);
    download(blob, 'jugada.gif');
    toast('GIF listo · ' + Math.round(blob.size / 1024) + ' KB');
  }

  function setExportBusy(on, msg) {
    var b = $('#export');
    if (b) b.classList.toggle('rec', !!on);
    hint(on ? (msg || 'Trabajando…') : '');
  }




  /* =========================================================================
     Exportar la jugada en vídeo
     ====================================================================== */

  // Prepara el lienzo y la transformación con los que se pinta la animación.
  function videoStage(width) {
    var view = viewRect();
    var vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    var W = width - (width % 2);
    var H = Math.round(W * vh / vw);
    if (H % 2) H += 1;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    return { cv: cv, c: cv.getContext('2d'), t: transformFor(W, H, view), view: view, W: W, H: H };
  }

  function paintAt(st, p, segs) {
    var seg = clamp(Math.floor(p), 0, segs - 1);
    st.c.clearRect(0, 0, st.W, st.H);
    drawPitch(st.c, st.t, st.view);
    drawAnimatedInto(st.c, st.t, seg, ease(clamp(p - seg, 0, 1)));
  }

  function exportVideo() {
    if (doc.frames.length < 2) { toast('Añade al menos dos fotogramas para grabar la jugada'); return; }

    var mime = pickMime();
    // 1) El navegador sabe grabar MP4 él solo (Safari, Chrome reciente).
    if (mime && mime.indexOf('mp4') > -1 && canRecord()) { recordVideo(mime); return; }

    // 2) Si no, se codifica H.264 con WebCodecs y se empaqueta el MP4 aquí.
    var st = videoStage(1280), FPS = 30;
    pickAvc(st.W, st.H, FPS).then(function (codec) {
      if (codec) { encodeMp4(st, codec, FPS); return; }
      // 3) Sin MP4 posible: se dice claramente en vez de colar un WebM.
      ask({
        title: 'Este navegador no puede hacer MP4',
        message: 'Ni sabe grabar en MP4 ni codificar H.264. El GIF animado se ve en cualquier sitio y es la mejor alternativa aquí. ' +
                 'Si necesitas MP4, abre la pizarra en Safari o en Chrome.',
        ok: 'Exportar en GIF'
      }).then(function (si) { if (si) exportGif(); });
    });
  }

  // --- Camino 1: grabación en tiempo real -------------------------------------
  function recordVideo(mime) {
    var st = videoStage(1280);
    var rec;
    try {
      rec = new MediaRecorder(st.cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6000000 });
    } catch (err) { toast('Este navegador no puede grabar vídeo'); return; }

    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var type = mime.split(';')[0];
      download(new Blob(chunks, { type: type }), 'jugada.' + (type.indexOf('mp4') > -1 ? 'mp4' : 'webm'));
      recording = false;
      setExportBusy(false);
      toast('Vídeo listo');
    };

    var segs = doc.frames.length - 1;
    var segMsRec = segMs();
    var total = segs * segMsRec + 900;      // un respiro al final
    var t0 = performance.now();

    recording = true;
    setExportBusy(true, 'Grabando la jugada…');
    rec.start();

    (function frameLoop(now) {
      // La marca de tiempo de requestAnimationFrame corresponde al inicio del cuadro
      // y puede ser anterior a t0: sin acotar, el primer cuadro pedía el tramo -1.
      var el = clamp((now || performance.now()) - t0, 0, total);
      paintAt(st, Math.min(el, segs * segMsRec) / segMsRec, segs);
      if (el < total) requestAnimationFrame(frameLoop);
      else { try { rec.stop(); } catch (err) {} }
    })();
  }

  // --- Camino 2: codificación cuadro a cuadro con WebCodecs -------------------
  function encodeMp4(st, codec, FPS) {
    var segs = doc.frames.length - 1;
    var total = Math.round(segs * (segMs() / 1000) * FPS);
    var last = total + Math.round(FPS * 0.6);      // fija el final medio segundo
    var samples = [], avcC = null, fallo = null;

    recording = true;
    setExportBusy(true, 'Preparando el vídeo…');

    var enc = new VideoEncoder({
      output: function (chunk, meta) {
        if (!avcC && meta && meta.decoderConfig && meta.decoderConfig.description) {
          avcC = new Uint8Array(meta.decoderConfig.description);
        }
        var d = new Uint8Array(chunk.byteLength);
        chunk.copyTo(d);
        samples.push({ data: d, key: chunk.type === 'key' });
      },
      error: function (e) { fallo = e && e.message ? e.message : 'error de codificación'; }
    });

    try {
      enc.configure({
        codec: codec, width: st.W, height: st.H,
        bitrate: 5000000, framerate: FPS, avc: { format: 'avc' }
      });
    } catch (e) {
      recording = false; setExportBusy(false);
      toast('No se ha podido preparar el vídeo');
      return;
    }

    var i = 0;
    function paso() {
      if (fallo) { terminar(); return; }
      var lote = 0;
      while (i <= last && lote < 6 && enc.encodeQueueSize < 8) {
        paintAt(st, Math.min(i, total) / Math.max(1, total) * segs, segs);
        var vf = new VideoFrame(st.cv, {
          timestamp: Math.round(i * 1000000 / FPS),
          duration: Math.round(1000000 / FPS)
        });
        enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
        vf.close();
        i++; lote++;
      }
      if (i <= last) {
        setExportBusy(true, 'Codificando… ' + Math.round(i / last * 100) + '%');
        setTimeout(paso, 0);
      } else {
        enc.flush().then(terminar, terminar);
      }
    }

    function terminar() {
      try { enc.close(); } catch (e) {}
      recording = false;
      setExportBusy(false);
      if (fallo || !samples.length || !avcC) {
        toast('No se ha podido codificar el vídeo');
        return;
      }
      var blob = buildMp4(st.W, st.H, 90000, Math.round(90000 / FPS), samples, avcC);
      download(blob, 'jugada.mp4');
      toast('Vídeo MP4 listo · ' + Math.round(blob.size / 1024) + ' KB');
    }

    paso();
  }

  function exportJSON() {
    download(new Blob([JSON.stringify(doc)], { type: 'application/json' }), 'pizarra-tactica.json');
  }

  function importJSON(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (!d || !Array.isArray(d.frames) || !d.frames.length) throw 0;
        doc = saneaDoc(d); docSale = null; ui.frame = 0; ui.sel = null; ui.multi = [];
        syncViewButtons(); buildFrames(); hideInspector(); commit(); resize();
        toast('Pizarra importada');
      } catch (e) { toast('El archivo no es una pizarra válida'); }
    };
    fr.readAsText(file);
  }

  function savedBoards() {
    try { return JSON.parse(localStorage.getItem('pt-boards') || '{}'); } catch (e) { return {}; }
  }
  function writeBoards(o) {
    try { localStorage.setItem('pt-boards', JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  /* Guardar la pizarra, y de paso apuntarla como hecha.

     Son dos cosas distintas y por eso hay una casilla que las separa. Guardar
     mete el ejercicio en TU BIBLIOTECA. Apuntarlo como hecho lo mete en la
     SESIÓN DE HOY, con quién lo hizo.

     Casi siempre van juntas —acabas de dibujar el rondo que habéis hecho— y por
     eso la casilla viene marcada. Pero un domingo por la noche preparando el
     martes no: se desmarca, el ejercicio se guarda, y el martes se añade a la
     sesión desde Equipo · Sesiones. Antes esto no se podía decir, y ese domingo
     salía en las cuentas como si el equipo hubiera entrenado.

     Los participantes vienen ya marcados de la asistencia del día: lo normal es
     escribir el nombre y darle a Guardar, sin tocar nada más. La lista solo se
     abre si hace falta cambiarla —un ejercicio de porteros, uno que se lesionó
     a mitad—, y por eso empieza plegada detrás de un «cambiar». */
  var saveElegidos = null;          // ids marcados en el diálogo abierto

  /* «conDetalles» abre la hoja con la ficha ya desplegada: es por donde entra
     «Ficha del ejercicio», que antes era otro diálogo. */
  function saveBoard(conDetalles) {
    var dlg = $('#dlg-save');
    if (!dlg || !window.PTEquipo) { saveBoardSimple(); return; }

    // La ficha vive aquí dentro: se vuelca siempre, esté plegada o no.
    llenaCampos();
    var det = $('#save-detalles');
    if (det) det.open = !!conDetalles;
    var ses = $('#save-sesion');
    if (ses) ses.open = false;

    var campo = $('#save-nombre');
    // El nombre que propone es el de la ficha, si la hay: es el que el
    // entrenador ya ha escrito y por el que va a buscarla después.
    campo.value = (doc.card && doc.card.titulo || '').trim();
    /* Y si no hay ficha —que es lo normal, porque la ficha nunca es
       obligatoria—, se propone algo con lo que volver a encontrarlo. Antes se
       quedaba vacío y guardar pedía escribir un nombre a quien solo quería
       guardar: el camino rápido tiene que serlo también sin ficha. */
    // «martes 16 de septiembre» → «16 de septiembre»: el día de la semana no
    // ayuda a reconocerlo dentro de tres meses, la fecha sí.
    if (!campo.value) {
      campo.value = 'Ejercicio del ' + diaLargo(PTEquipo.hoyISO()).replace(/^\S+\s/, '');
    }

    /* Salvo que esto venga de un ejercicio de otro. Entonces lo que se está
       guardando es TU versión, y proponer el nombre de pila del original deja
       dos cosas distintas llamadas igual: la del catálogo y la tuya.

       Pero solo si el título sigue siendo el suyo. Si el entrenador ya le ha
       puesto nombre en la ficha, ese es el que quiere: pisárselo con «(mi
       versión)» sería corregirle algo que acaba de escribir a mano. */
    var nota = $('#save-sale');
    var sinTocarElTitulo = !!docSale &&
      campo.value.toLowerCase() === String(docSale.nombre || '').trim().toLowerCase();
    if (docSale) {
      if (sinTocarElTitulo || !campo.value) campo.value = comoLoLlamarias(docSale);
      nota.textContent = 'Sale de «' + docSale.nombre + '»' +
        (docSale.autor ? ', de ' + docSale.autor : docSale.de === 'catalogo' ? ', del catálogo' : '') +
        '. Lo que guardes es tu versión: el original se queda como está.';
      nota.hidden = false;
    } else {
      nota.textContent = '';
      nota.hidden = true;
    }

    $('#save-dia').value = PTEquipo.hoyISO();   // hoy de salida, que es lo normal
    saveElegidos = PTEquipo.presentesHoy();
    $('#save-part-plantilla').checked = false;
    $('#save-part-caja').hidden = true;
    $('#save-hoy').checked = true;
    $('#save-dia-fila').hidden = false;
    pintaDiaDeLaHoja();

    /* Sin plantilla montada no hay a quién apuntárselo: el plegable entero
       sobra. La ficha NO: esa vale con plantilla y sin ella. */
    var sinPlantilla = PTEquipo.jugadores().length === 0;
    $('#save-part').hidden = sinPlantilla;
    if (ses) ses.hidden = sinPlantilla;

    /* Publicar solo tiene sentido con cuenta, y viene desmarcado siempre:
       subir algo a la vista de todos no puede pasar por no mirar una casilla. */
    var pub = $('#save-publicar');
    if (pub) {
      pub.checked = false;
      $('#save-publicar-fila').hidden = !(hayNube && yo);
    }

    /* El nombre de arriba y el título de la ficha son el mismo nombre escrito
       dos veces. Si el entrenador abre los detalles y escribe el título ahí, el
       de arriba lo sigue —pero solo mientras nadie lo haya tocado a mano: en
       cuanto escribe arriba, manda lo de arriba y la ficha deja de pisárselo. */
    nombrePropuesto = campo.value;

    dlg.showModal();
    setTimeout(function () { campo.select(); }, 30);
  }

  var nombrePropuesto = '';

  /* «2026-09-14» → «lunes 14 de septiembre». Sin el año, que casi siempre es el
     de ahora y solo hace la frase más larga; se pone cuando no lo es. */
  var DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function diaLargo(iso, conAño) {
    var p = String(iso).split('-');
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return String(iso);
    var t = DIAS_SEM[d.getDay()] + ' ' + Number(p[2]) + ' de ' + MESES_ES[Number(p[1]) - 1];
    if (conAño || p[0] !== String(new Date().getFullYear())) t += ' de ' + p[0];
    return t;
  }
  function diaCorto(iso) {
    var p = String(iso).split('-');
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return String(iso);
    return mayus(DIAS_SEM[d.getDay()].slice(0, 3)) + ' ' + Number(p[2]);
  }
  // Solo la primera letra. El CSS «capitalize» las pone todas y deja cosas como
  // «Viernes 11 De Septiembre De 2026».
  function mayus(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  // Si por lo que sea no está el módulo del equipo, guardar sigue funcionando.
  function saveBoardSimple() {
    ask({ title: 'Guardar pizarra', input: (doc.card && doc.card.titulo || '').trim(),
          placeholder: 'Nombre del ejercicio', ok: 'Guardar' })
      .then(function (name) { if (name !== null) guardaConNombre(name, null); });
  }

  function guardaConNombre(name, meta) {
    if (!name) { toast('Hace falta un nombre para poder encontrarla luego'); return false; }
    var all = savedBoards();
    var nueva = !all[name];
    var entrada = { at: Date.now(), doc: doc };
    if (meta) entrada.meta = meta;
    /* De dónde salió. Si guardas con OTRO nombre distinto del que se proponía,
       sigue saliendo de ahí: lo que cuenta es de dónde viene el dibujo. */
    if (docSale) entrada.sale = docSale;
    all[name] = entrada;
    if (!writeBoards(all)) {
      toast('No cabe en el almacenamiento del navegador: borra alguna pizarra guardada');
      return false;
    }
    olvidaMini('mia:' + name);
    toast(nueva ? 'Guardada como «' + name + '»' : '«' + name + '» actualizada');
    return true;
  }

  /* El día al que se apunta lo que estás guardando. Casi siempre es hoy y por
     eso viene puesto, pero no siempre: se dibuja el domingo el ejercicio que se
     hizo el jueves, y se prepara en agosto el de septiembre. */
  function diaDeLaHoja() {
    var v = $('#save-dia').value;
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : PTEquipo.hoyISO();
  }

  function pintaDiaDeLaHoja() {
    var dia = diaDeLaHoja();
    var hoy = dia === PTEquipo.hoyISO();
    var futura = dia > PTEquipo.hoyISO();

    var t = $('#save-sesion-t');
    if (t) t.textContent = hoy ? 'Añadir a la sesión de hoy'
      : futura ? 'Añadir a la sesión del ' + diaLargo(dia, true) + ' (aún por llegar)'
               : 'Añadir a la sesión del ' + diaLargo(dia, true);

    /* Quién lo hizo no se puede contestar de un día que no ha llegado: nadie ha
       venido todavía. Se esconde en vez de pedirlo, y se dice por qué, que si
       no parece que falte algo. */
    $('#save-part-t').hidden = futura || !$('#save-hoy').checked;
    if (futura) $('#save-part-caja').hidden = true;
    var aviso = $('#save-dia-nota');
    if (aviso) {
      aviso.hidden = !futura;
      aviso.textContent = futura
        ? 'Es un día que aún no ha llegado: queda apuntado como plan y no cuenta ' +
          'como entrenado hasta que pase. Quién vino se apunta el día que sea.'
        : '';
    }
    // Los que vinieron ESE día, no los de hoy.
    if (!futura) saveElegidos = PTEquipo.presentesDe(dia);
    pintaParticipantes();
  }

  function pintaParticipantes() {
    var todos = $('#save-part-plantilla').checked;
    var deHoy = PTEquipo.presentesHoy();
    var lista = PTEquipo.jugadores().filter(function (j) {
      return todos || deHoy.indexOf(j.id) >= 0;
    });
    var ul = $('#save-part-lista');
    ul.textContent = '';
    lista.forEach(function (j) {
      ul.appendChild(filaJugador(j, saveElegidos.indexOf(j.id) >= 0, function (marcado) {
        var i = saveElegidos.indexOf(j.id);
        if (marcado && i < 0) saveElegidos.push(j.id);
        if (!marcado && i >= 0) saveElegidos.splice(i, 1);
        cuentaParticipantes();
      }));
    });
    cuentaParticipantes();
  }

  function cuentaParticipantes() {
    var n = saveElegidos.length;
    $('#save-part-cuenta').textContent =
      n === 0 ? 'Sin jugadores apuntados'
              : n + (n === 1 ? ' jugador' : ' jugadores') + ' en este ejercicio';
  }

  /* Una fila de jugador, la misma en «Mi equipo» y en «Guardar».
     Se construye con el DOM, nunca con innerHTML: aquí dentro va el nombre de
     una persona, escrito por el usuario. */
  function filaJugador(j, marcado, alCambiar, alQuitar) {
    var li = document.createElement('li');
    li.className = 'squad-fila' + (marcado ? '' : ' falta');
    li.dataset.id = j.id;

    var lab = document.createElement('label');
    lab.className = 'squad-marca';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!marcado;
    cb.setAttribute('aria-label', 'Ha venido ' + j.nombre);
    cb.addEventListener('change', function () {
      li.classList.toggle('falta', !cb.checked);
      alCambiar(cb.checked);
    });

    var dor = document.createElement('span');
    dor.className = 'squad-dorsal';
    dor.textContent = j.dorsal;

    var nom = document.createElement('span');
    nom.className = 'squad-nombre';
    nom.textContent = j.nombre;

    lab.appendChild(cb); lab.appendChild(dor); lab.appendChild(nom);

    if (j.posicion) {
      var pos = document.createElement('span');
      pos.className = 'squad-pos';
      pos.textContent = j.posicion;
      lab.appendChild(pos);
    }
    li.appendChild(lab);

    if (alQuitar) {
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'tbtn squad-quita';
      x.title = 'Quitar a ' + j.nombre;
      x.setAttribute('aria-label', x.title);
      x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                    'stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      x.addEventListener('click', function () { alQuitar(j); });
      li.appendChild(x);
    }
    return li;
  }
  function syncViewButtons() {
    $$('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === doc.view); });
    $$('[data-pitch]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.pitch === doc.pitch); });
    buildFormationLists();
  }

  function buildFormationLists() {
    var names = Object.keys(formationSet().pos);
    [['#form-home', 'local'], ['#form-away', 'visitante']].forEach(function (pair) {
      var sel = $(pair[0]);
      if (!sel) return;
      sel.innerHTML = '<option value="">Colocar equipo ' + pair[1] + '…</option>' +
        names.map(function (n) { return '<option>' + n + '</option>'; }).join('');
    });
  }

  // Las fichas y el material se reescalan al cambiar de modalidad, para que la
  // jugada siga teniendo sentido en el campo nuevo.
  function setPitch(kind) {
    if (kind === doc.pitch) return;
    var from = PITCHES[doc.pitch] || PITCHES.f11, to = PITCHES[kind];
    var fx = to.L / from.L, fy = to.W / from.W;
    doc.pitch = kind;
    doc.frames.forEach(function (f) {
      f.objects.forEach(function (o) {
        o.x *= fx; o.y *= fy;
        if (o.kind === 'goal') { o.w = to.goal; o.h = Math.max(1.4, to.goalD); }
      });
      f.strokes.forEach(function (st) {
        st.pts.forEach(function (pt) { pt.x *= fx; pt.y *= fy; });
      });
    });
    ui.sel = null; ui.multi = []; hideInspector();
    ui.zoom = 1; ui.panX = 0; ui.panY = 0;
    syncViewButtons(); commit(); resize();
    toast(to.label + ' · ' + to.L + ' × ' + to.W + ' m');
  }

  /* =========================================================================
     Cableado de la interfaz
     ====================================================================== */

  function wire() {
    $$('[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });
    $$('[data-place]').forEach(function (b) {
      b.addEventListener('click', function () {
        setTool('place', { kind: b.dataset.place, team: b.dataset.team, color: b.dataset.color });
      });
    });
    $$('[data-color]').forEach(function (b) {
      b.addEventListener('click', function () {
        ui.color = b.dataset.color;
        $$('[data-color]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      });
    });
    $$('[data-width]').forEach(function (b) {
      b.addEventListener('click', function () {
        ui.width = parseFloat(b.dataset.width);
        $$('[data-width]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      });
    });
    $$('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        doc.view = b.dataset.view;
        syncViewButtons(); commit(); resize();
      });
    });
    $$('[data-pitch]').forEach(function (b) {
      b.addEventListener('click', function () { setPitch(b.dataset.pitch); });
    });

    $('#snap').addEventListener('change', function () { ui.snap = this.checked; });
    $('#undo').addEventListener('click', undo);
    $('#redo').addEventListener('click', redo);

    $('#form-home').addEventListener('change', function () { if (this.value) { applyFormation(this.value, 'home'); this.value = ''; } });
    $('#form-away').addEventListener('change', function () { if (this.value) { applyFormation(this.value, 'away'); this.value = ''; } });

    $('#clear').addEventListener('click', function () {
      ask({ title: 'Vaciar el fotograma', message: 'Se quitan las fichas, el material y los trazos de este fotograma. Podrás deshacerlo.', ok: 'Vaciar', danger: true })
        .then(function (yes) {
          if (!yes) return;
          doc.frames[ui.frame] = emptyFrame();
          ui.sel = null; ui.multi = []; hideInspector(); commit(); draw();
        });
    });
    $('#reset').addEventListener('click', function () {
      ask({ title: 'Empezar de cero', message: 'Se borra la pizarra entera, incluidos todos los fotogramas. Lo que hayas guardado con nombre se conserva.', ok: 'Empezar de cero', danger: true })
        .then(function (yes) {
          if (!yes) return;
          doc = { pitch: prefs().pitch, view: doc.view, card: emptyCard(), frames: [emptyFrame()] };
          docSale = null;
          ui.frame = 0; ui.sel = null; ui.multi = []; hideInspector();
          commit(); buildFrames(); draw();
        });
    });

    $('#play').addEventListener('click', function () { ui.playing ? stop() : play(); });
    $('#delframe').addEventListener('click', delFrame);
    var loopBtn = $('#loop');
    loopBtn.addEventListener('click', function () {
      ui.loop = !ui.loop;
      loopBtn.setAttribute('aria-pressed', String(ui.loop));
      toast(ui.loop ? 'La animación se repetirá en bucle' : 'Bucle desactivado');
    });

    var SPEEDS = [0.5, 0.75, 1, 1.5, 2];
    var speedBtn = $('#speed');
    speedBtn.addEventListener('click', function () {
      var i = SPEEDS.indexOf(ui.speed);
      ui.speed = SPEEDS[(i + 1) % SPEEDS.length];
      speedBtn.textContent = ui.speed.toFixed(1).replace('.0', '.0') + '×';
    });

    var dlgExport = $('#dlg-export');
    function openExport() {
      var varios = doc.frames.length > 1;
      $('#ex-video').disabled = !varios;
      $('#ex-gif').disabled = !varios;
      $('#ex-video-fmt').textContent = varios
        ? 'MP4, el que reproduce cualquier móvil.'
        : 'Necesita al menos dos fotogramas.';
      dlgExport.showModal();
    }
    function exportar(fn) {
      return function () { dlgExport.close(); setTimeout(fn, 120); };
    }
    $('#export').addEventListener('click', function () { if (!recording) openExport(); });
    $('#ex-png').addEventListener('click', exportar(exportPNG));
    // La ficha siempre se abre para editarla: imprimir sin verla dejaba la ficha
    // ya rellenada sin manera de volver a tocarla desde aquí.
    $('#ex-sheet').addEventListener('click', exportar(printSheet));
    $('#ex-video').addEventListener('click', exportar(exportVideo));
    $('#ex-gif').addEventListener('click', exportar(exportGif));
    $('#ex-json').addEventListener('click', exportar(exportJSON));
    /* Sin envolver, el manejador le pasaría el evento como «conDetalles» y la
       ficha saldría desplegada: el camino rápido dejaría de serlo. */
    $('#save').addEventListener('click', function () { saveBoard(false); });
    // Sin envolver, el «click» llegaría como si fuera una fecha de sesión y la
    // biblioteca se abriría en modo elegir desde el botón de siempre.
    $('#open').addEventListener('click', function () { openLibrary(null); });
    /* Y con Escape o tocando fuera también se sale, sin pasar por el botón.
       Aquí NO se llama a «cierraBiblioteca»: el diálogo ya se está cerrando y
       volver a cerrarlo sería morderse la cola. Solo se olvida el para qué. */
    $('#dlg-lib').addEventListener('close', function () { libParaSesion = null; });

    // ---- Mi equipo, participantes y estadísticas ----
    // El interruptor de modo y los apartados de Equipo.
    /* ---- El cajón ----
       Sustituye al interruptor Pizarra/Equipo. Se abre, se elige, se cierra.
       Lo de cerca —las pestañas de abajo— sigue donde estaba: el cajón es para
       saltar lejos, no para moverse dentro de lo que ya estás haciendo. */
    $('#cajon-btn').addEventListener('click', function () {
      if ($('#cajon').classList.contains('open')) cierraCajon(); else abreCajon();
    });
    $('#cajon-scrim').addEventListener('click', cierraCajon);
    $('#pista-ver').addEventListener('click', abreCajon);
    $('#pista-no').addEventListener('click', cierraLaPista);
    $$('.cajon-ir').forEach(function (b) {
      b.addEventListener('click', function () {
        cierraCajon();
        vaDestino(b.dataset.ir);
      });
    });
    // Escape cierra lo de arriba, que es el cajón si está abierto.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#cajon').classList.contains('open')) {
        e.preventDefault();
        cierraCajon();
      }
    });
    $$('[data-eq]').forEach(function (b) {
      b.addEventListener('click', function () { vaApartado(b.dataset.eq); });
    });
    // Exportar no cabe en la barra del móvil; desde el panel hace lo mismo.
    $('#export-row').addEventListener('click', function () { sheetClose(); $('#export').click(); });
    $('#ficha-row').addEventListener('click', function () { sheetClose(); openCard(); });
    /* La biblioteca bajó a la hoja para dejarle sitio arriba a la cuenta. Sale
       ganando: aquí tiene su nombre escrito, y como icono suelto en una barra
       apretada no lo entendía nadie. */
    $('#open-row').addEventListener('click', function () { sheetClose(); openLibrary(null); });
    $('#squad-add').addEventListener('click', añadeJugador);
    $('#squad-nombre').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); añadeJugador(); }
    });
    $('#squad-dorsal').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 2);   // solo dos cifras
    });
    $('#squad-nueva').addEventListener('click', nuevaTemporada);
    $('#squad-temporada').addEventListener('change', function () {
      PTEquipo.cambiaTemporada(this.value);
      sueltaElDiaAbierto();
      pintaPlantilla();
    });
    /* Estos dos guardan como todo lo demás, pero eran los únicos que no
       miraban si el navegador había aceptado los datos. Con el almacén lleno la
       marca se deshacía sola al repintar y no se decía por qué: parecía que el
       botón no funcionaba. Todos los demás caminos de guardado ya avisaban. */
    function marcaTodos(ids) {
      if (!PTEquipo.ponAsistencia(ids)) {
        toast('No cabe en el almacenamiento del navegador');
      }
      pintaPlantilla();
    }
    $('#squad-todos').addEventListener('click', function () {
      marcaTodos(PTEquipo.jugadores().map(function (j) { return j.id; }));
    });
    $('#squad-ninguno').addEventListener('click', function () { marcaTodos([]); });

    $('#save-part-cambiar').addEventListener('click', function () {
      var caja = $('#save-part-caja');
      caja.hidden = !caja.hidden;
      this.textContent = caja.hidden ? 'cambiar' : 'listo';
    });
    $('#save-part-plantilla').addEventListener('change', pintaParticipantes);
    $('#save-dia').addEventListener('change', pintaDiaDeLaHoja);
    $('#save-part-todos').addEventListener('click', function () {
      var deHoy = $('#save-part-plantilla').checked
        ? PTEquipo.jugadores().map(function (j) { return j.id; })
        : PTEquipo.presentesHoy();
      saveElegidos = deHoy.slice();
      pintaParticipantes();
    });
    $('#save-part-ninguno').addEventListener('click', function () {
      saveElegidos = [];
      pintaParticipantes();
    });
    $('#save-hoy').addEventListener('change', function () {
      // Si no se apunta en ninguna sesión, ni el día ni a quién vienen a cuento.
      var pon = this.checked;
      $('#save-dia-fila').hidden = !pon;
      $('#save-part-t').hidden = !pon || diaDeLaHoja() > PTEquipo.hoyISO();
      if (!pon) { $('#save-part-caja').hidden = true; $('#save-part-cambiar').textContent = 'cambiar'; }
    });
    /* El único guardado que hay. Lo escrito en la ficha se compromete AQUÍ, no
       en un botón aparte: esté la ficha plegada o desplegada, lo que el
       entrenador haya escrito entra en el documento antes de guardarlo. */
    function guardaDesdeLaHoja() {
      var nombre = $('#save-nombre').value.trim();
      if (!nombre) { toast('Hace falta un nombre para poder encontrarla luego'); return false; }
      readCard();
      commit();
      var hayPlantilla = PTEquipo.jugadores().length > 0;
      if (!guardaConNombre(nombre, hayPlantilla ? PTEquipo.metaDeHoy() : null)) return false;

      if (hayPlantilla && $('#save-hoy').checked) {
        var card = doc.card || {};
        var dia = diaDeLaHoja();
        var r = PTEquipo.apuntaHecho(dia, {
          // El nombre que acaba de escribir, no el de la ficha. Si no coinciden
          // —y muchas veces no coinciden— ver en la sesión un título distinto
          // del que acabas de teclear no se entiende.
          titulo: nombre,
          momento: card.momento || '',
          duracion: card.duracion || '',
          ref: { de: 'guardado', nombre: nombre },
          // De un día por llegar no se apunta quién vino: todavía no ha venido
          // nadie, y «apuntaHecho» tomaría esa lista por la asistencia del día.
          quienes: dia > PTEquipo.hoyISO() ? [] : saveElegidos.slice()
        });
        if (!r.ok) {
          var cual = dia === PTEquipo.hoyISO() ? 'de hoy' : 'del ' + diaLargo(dia, true);
          toast(r.porque === 'tope'
            ? 'La sesión ' + cual + ' ya lleva ' + PTEquipo.TOPE_EJERCICIOS + ' ejercicios'
            : 'Guardada, pero no ha podido apuntarse en la sesión ' + cual);
        } else if (modo === 'equipo') {
          pintaSesiones();
        }
      }

      /* Y si ha marcado publicarlo, va detrás de guardarlo: primero es suyo en
         su dispositivo, y solo después sale a la vista de todos. Si la subida
         falla, lo guardado se queda guardado. */
      var pub = $('#save-publicar');
      if (pub && pub.checked && hayNube && yo) {
        var copia = clone(doc);
        if (!copia.card) copia.card = emptyCard();
        if (!copia.card.titulo) copia.card.titulo = nombre;
        nube.publica(copia, { publicado: true })
          .then(function () { toast('Guardado y publicado en la biblioteca común'); nubeMios = []; cargaNube(); })
          .catch(function (e) { toast('Guardado, pero no ha podido publicarse: ' + (e.message || 'error')); });
      }

      $('#dlg-save').close();
      return true;
    }

    $('#save-ok').addEventListener('click', guardaDesdeLaHoja);
    /* Imprimir la ficha era el otro botón del diálogo viejo. Guarda igual y
       manda a imprimir: si no se ha podido guardar, no se imprime nada. */
    $('#save-imprimir').addEventListener('click', function () {
      if (guardaDesdeLaHoja()) setTimeout(printCard, 120);
    });
    $('#save-nombre').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#save-ok').click(); }
    });
    // Escribir el título dentro de la ficha rellena el nombre de arriba,
    // mientras el de arriba siga siendo el que propuso la aplicación.
    fieldEl('titulo').addEventListener('input', function () {
      var campo = $('#save-nombre');
      if (campo.value !== nombrePropuesto) return;      // lo tocó él: manda él
      campo.value = this.value.trim();
      nombrePropuesto = campo.value;
    });

    $$('#stats-periodo [data-periodo]').forEach(function (b) {
      b.addEventListener('click', function () {
        statsPeriodo = b.dataset.periodo;
        pintaStats();
      });
    });
    $$('#stats-orden [data-orden]').forEach(function (b) {
      b.addEventListener('click', function () {
        statsOrden = b.dataset.orden;
        pintaStats();
      });
    });

    // ---- Sesiones ----
    // El desplegable de momentos se copia del de la ficha en vez de escribirlo
    // otra vez: una lista en dos sitios acaba siendo dos listas distintas.
    (function () {
      var origen = $('#f-momento'), destino = $('#ses-ej-momento');
      if (!origen || !destino) return;
      $$('option', origen).forEach(function (o) {
        var n = document.createElement('option');
        n.value = o.value;
        n.textContent = o.value === '' ? 'Momento del juego' : o.textContent;
        destino.appendChild(n);
      });
    })();
    $('#ses-hoy').addEventListener('click', function () { abreSesion(PTEquipo.hoyISO()); });
    /* Ir a un día cualquiera. El día de hoy sigue estando a un toque en su
       botón —es el caso de casi siempre—; esto es para el martes que viene y
       para el jueves pasado que no llegaste a apuntar. */
    $('#ses-dia').addEventListener('change', function () {
      var f = this.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
      abreSesion(f);
    });
    $('#ses-volver').addEventListener('click', vaAlDiario);
    /* Se guarda mientras se escribe, no al salir del campo.

       Con «change» a secas, escribías el nombre de la sesión, tocabas otra
       pestaña de la barra de abajo y se perdía: el evento no llega a tiempo, y
       al volver la pantalla se repinta con lo que hay guardado, que era nada.
       Con un respiro de medio segundo no se escribe en el almacén en cada
       tecla, y «change» se queda como red por si se sale muy rápido. */
    /* Y avisa si no cabe, pero UNA sola vez: esto se dispara mientras escribes,
       así que sin la marca soltaría un aviso cada medio segundo. Se rearma en
       cuanto vuelve a caber. */
    var avisadoNombre = false;
    function guardaElNombre(txt) {
      if (!sesFecha) return;
      if (PTEquipo.guardaSesion(sesFecha, { nombre: txt })) { avisadoNombre = false; return; }
      if (!avisadoNombre) {
        avisadoNombre = true;
        toast('El nombre no se ha guardado: no cabe en el almacenamiento del navegador');
      }
    }
    var guardaNombre = conRespiro(function () {
      guardaElNombre($('#ses-nombre').value);
    }, 500);
    $('#ses-nombre').addEventListener('input', guardaNombre);
    $('#ses-nombre').addEventListener('change', function () { guardaElNombre(this.value); });
    $('#ses-ej-add').addEventListener('click', añadeEjercicioAMano);
    $('#ses-ej-titulo').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); añadeEjercicioAMano(); }
    });
    $('#ses-ej-duracion').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); añadeEjercicioAMano(); }
    });
    $('#ses-proponer').addEventListener('click', abreGenerador);
    $('#ses-traer').addEventListener('click', function () { openLibrary(sesFecha); });
    $('#ses-imprimir').addEventListener('click', imprimeSesion);
    $('#ses-gen-volver').addEventListener('click', function () {
      genPropuesta = null; sesVista = 'detalle'; arriba(); pintaSesiones();
    });
    $('#gen-proponer').addEventListener('click', function () { proponSesion(false); });
    $('#gen-otra').addEventListener('click', function () { proponSesion(true); });
    $('#gen-usar').addEventListener('click', usaLaPropuesta);
    $('#ses-asis-volver').addEventListener('click', vuelveDeLaLista);
    $('#ses-asis-todos').addEventListener('click', function () {
      sesElegidos = PTEquipo.jugadores().map(function (j) { return j.id; });
      guardaAsistenciaDeSesion();
      pintaListaDeAsistencia();
    });
    $('#ses-asis-ninguno').addEventListener('click', function () {
      sesElegidos = [];
      guardaAsistenciaDeSesion();
      pintaListaDeAsistencia();
    });
    // ---- Partidos ----
    $('#par-nuevo').addEventListener('click', function () { abrePartido(null); });
    $('#par-volver').addEventListener('click', vaAPartidos);
    $('#par-guardar').addEventListener('click', guardaElPartido);
    $('#par-borrar').addEventListener('click', borraElPartido);
    $$('#par-donde [data-casa]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!parBorrador) return;
        parBorrador.casa = b.dataset.casa === '1';
        pintaDetallePartido();
      });
    });
    /* Cambiar la duración con gente ya marcada tiene que arrastrar a los que
       jugaron el partido entero: si no, pones «80» después de marcar a once y
       los once se quedan con los 90 de antes sin que nadie lo diga. Al que ya
       le habías tocado los minutos no se le tocan. */
    $('#par-duracion').addEventListener('change', function () {
      if (!parBorrador) return;
      var antes = parBorrador.duracion;
      leeCamposDelPartido();
      if (parBorrador.duracion === antes) return;
      parBorrador.convocados.forEach(function (c) {
        if (c.minutos === antes) c.minutos = parBorrador.duracion;
      });
      pintaJugadoresDelPartido();
    });
    $('#par-todos').addEventListener('click', function () {
      if (!parBorrador) return;
      PTEquipo.jugadores().forEach(function (j) { marcaDelPartido(j.id, true); });
      pintaJugadoresDelPartido();
    });
    $('#par-ninguno').addEventListener('click', function () {
      if (!parBorrador) return;
      parBorrador.convocados = [];
      pintaJugadoresDelPartido();
    });

    $('#import').addEventListener('change', function () {
      if (this.files[0]) { dlgExport.close(); importJSON(this.files[0]); }
      this.value = '';
    });
    // ---- Biblioteca ----
    var libTeclas;
    $('#lib-q').addEventListener('input', function () {
      libFiltros.q = this.value;
      clearTimeout(libTeclas);
      libTeclas = setTimeout(function () {   // sin repintar ni preguntar en cada tecla
        pintaBiblioteca(); cargaNube();
      }, 250);
    });
    $$('.lib-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        libFiltros.origen = b.dataset.origen;
        pintaBiblioteca();
        cargaNube();
      });
    });
    [['#lib-pitch', 'pitch'], ['#lib-momento', 'momento'], ['#lib-duracion', 'duracion'],
     ['#lib-cuantos', 'cuantos'], ['#lib-espacio', 'espacio']].forEach(function (par) {
      $(par[0]).addEventListener('change', function () {
        libFiltros[par[1]] = this.value;
        pintaBiblioteca();
        cargaNube();
      });
    });
    $('#lib-limpiar').addEventListener('click', function () {
      // vuelve a tu modalidad, no a todas mezcladas
      var origen = libFiltros.origen;
      libFiltros = filtrosPorDefecto();
      libFiltros.origen = origen;                 // la pestaña donde estás no se toca
      $('#lib-q').value = '';
      ['#lib-momento', '#lib-duracion', '#lib-cuantos', '#lib-espacio']
        .forEach(function (id) { $(id).value = ''; });
      $('#lib-pitch').value = libFiltros.pitch;
      pintaBiblioteca();
      cargaNube();
    });

    // ---- Cuenta y biblioteca común ----
    $('#enlace').addEventListener('pointerdown', function () { preparaEnlace(doc); });
    $('#enlace').addEventListener('click', function () { sheetClose(); enviaPorEnlace(); });
    $('#compartir').addEventListener('click', function () { sheetClose(); comparteActual(); });

    /* Sin servidor detrás no hay cuentas que valgan. Antes esto daba igual
       porque la cuenta vivía enterrada en Ajustes; ahora tiene un botón en la
       barra, y un botón que no lleva a ninguna parte es peor que no tenerlo.
       El archivo suelto —el que se manda por correo— es justo este caso. */
    if (!hayNube) {
      $('#cuenta-btn').closest('.group').hidden = true;
      $('#cfg-cuenta-bloque').hidden = true;
      // La del panel, por lo mismo: es la misma puerta, y sin servidor detrás
      // no da a ninguna parte. Es justo el caso del archivo suelto.
      $('#cuenta-row').hidden = true;
      // Y la del cajón. Un destino que no lleva a ninguna parte es peor que
      // no tenerlo, y el cajón es justo donde se mira para saber qué hay.
      var eCta = $('.cajon-ir[data-ir="cuenta"]');
      if (eCta) eCta.hidden = true;
    }

    if (hayNube) {
      /* Abrir la cuenta. Es un solo sitio al que se llega desde tres: el botón
         de la barra, la fila de Ajustes y el aviso de compartir. Al abrirlo se
         parte siempre de «Ya tengo cuenta», que es lo que hace casi todo el
         mundo casi siempre; crear una está a un toque al lado. */
      abreCuenta = function (comoCrear) {
        ponModo(comoCrear ? 'crear' : 'entrar');
        $('#cuenta-aviso').hidden = true;
        if ($('#dlg-cfg').open) $('#dlg-cfg').close();
        $('#dlg-cuenta').showModal();
        // Sin sesión, el cursor va al correo: se ha venido a escribirlo.
        if (!yo) setTimeout(function () { var e = $('#cuenta-email'); if (e) e.focus(); }, 120);
      };
      $('#cuenta-btn').addEventListener('click', function () { sheetClose(); abreCuenta(false); });
      $('#cuenta-row').addEventListener('click', function () { sheetClose(); abreCuenta(false); });
      $('#cfg-cuenta').addEventListener('click', function () { abreCuenta(false); });

      // Entrar y registrarse son dos cosas distintas y se piden por separado.
      var modo = 'entrar';
      function ponModo(m) {
        modo = m;
        $$('#cuenta-modo button').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.modo === m));
        });
        $$('.solo-crear').forEach(function (el) { el.hidden = m !== 'crear'; });
        $$('.solo-entrar').forEach(function (el) { el.hidden = m === 'crear'; });
        $('#cuenta-entrar').textContent = m === 'crear' ? 'Crear cuenta' : 'Entrar';
        $('#cuenta-clave').setAttribute('autocomplete',
          m === 'crear' ? 'new-password' : 'current-password');
        $('#cuenta-aviso').hidden = true;
      }
      $$('#cuenta-modo button').forEach(function (b) {
        b.addEventListener('click', function () { ponModo(b.dataset.modo); });
      });
      ponModo('entrar');

      $('#cuenta-entrar').addEventListener('click', function () {
        var correo = $('#cuenta-email').value.trim();
        var clave  = $('#cuenta-clave').value;
        var nombre = $('#cuenta-alta-nombre').value.trim();
        var club   = $('#cuenta-alta-club').value.trim();
        var aviso  = $('#cuenta-aviso');
        function di(t) { aviso.textContent = t; aviso.hidden = false; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { di('Escribe un correo válido.'); return; }
        if (clave.length < 6) { di('La contraseña tiene que tener al menos 6 caracteres.'); return; }
        /* Aceptar las condiciones solo se pide al crear la cuenta, que es
           cuando de verdad se acepta algo. A quien ya entró no se le vuelve a
           preguntar cada vez: lo que aceptó quedó anotado en el servidor. */
        if (modo === 'crear' && !$('#cuenta-acepto').checked) {
          di('Para crear la cuenta hay que leer y aceptar la privacidad y las condiciones.');
          $('#cuenta-acepto').focus();
          return;
        }

        var b = this, etiqueta = b.textContent;
        b.disabled = true; b.textContent = modo === 'crear' ? 'Creando…' : 'Entrando…';
        aviso.hidden = true;

        var tarea = modo === 'crear' ? nube.registra(correo, clave, nombre, true)
                                     : nube.entra(correo, clave);
        tarea.then(function () {
          /* Este es el único momento en el que la contraseña está a mano, y de
             ella sale la clave que abre los datos del equipo. Después ya no se
             puede: no se guarda en ningún sitio, y menos mal. */
          if (sincro) return sincro.alEntrar(clave).then(avisaDelCofre, function () {});
        }).then(function () {
          return refrescaCuenta().then(function () {
            if (modo === 'crear' && (nombre || club)) {
              return nube.perfil({ nombre: nombre || 'Entrenador', club: club })
                .then(refrescaCuenta).catch(function () {});
            }
          });
        }).then(function () {
          $('#cuenta-clave').value = '';
          toast(modo === 'crear' ? 'Cuenta creada. Ya puedes compartir' : 'Hola de nuevo');
        }).catch(function (e) {
          var m = e.message || 'No se ha podido';
          // El caso que más despista: la cuenta existe pero no tiene contraseña
          // porque se creó con el enlace del correo, que ya no usamos.
          if (modo === 'crear' && /ya tiene cuenta/.test(m)) {
            di('Ese correo ya tiene cuenta. Cambia arriba a «Ya tengo cuenta» y entra con su ' +
               'contraseña. Si nunca le pusiste una, usa otro correo.');
          } else if (modo === 'entrar' && /no coinciden/.test(m)) {
            di('Ese correo y esa contraseña no coinciden. Si la cuenta la creaste antes con un ' +
               'enlace por correo, no tiene contraseña: crea una cuenta con otro correo.');
          } else di(m);
        }).then(function () { b.disabled = false; b.textContent = etiqueta; });
      });

      // Sin esto, quien olvida su contraseña pierde su biblioteca de la nube
      // para siempre: no hay otra manera de volver a entrar.
      $('#cuenta-olvido').addEventListener('click', function () {
        var correo = $('#cuenta-email').value.trim();
        var aviso  = $('#cuenta-aviso');
        function di(t) { aviso.textContent = t; aviso.hidden = false; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
          di('Escribe arriba el correo de tu cuenta y vuelve a pulsar aquí.'); return;
        }
        var b = this, etiqueta = b.textContent;
        b.disabled = true; b.textContent = 'Enviando…'; aviso.hidden = true;
        nube.recupera(correo).then(function () {
          di('Te hemos mandado un correo a ' + correo + '. Ábrelo en este mismo dispositivo y ' +
             'te dejará escribir una contraseña nueva. Mira también en la carpeta de no deseado.');
        }).catch(function (e) {
          di(e.message || 'No se ha podido mandar el correo.');
        }).then(function () { b.disabled = false; b.textContent = etiqueta; });
      });

      // Con la sesión abierta, cambiarla es solo escribir la nueva.
      $('#cuenta-clave-nueva').addEventListener('click', function () {
        pideClaveNueva('Escribe la contraseña nueva, de seis caracteres o más.');
      });

      $('#cuenta-salir').addEventListener('click', function () {
        nube.sale().then(function () {
          yo = null; nubeMios = []; nubeLista = [];
          pintaCuenta(); toast('Sesión cerrada');
        });
      });

      /* Borrar la cuenta no se puede deshacer y se lleva por delante lo que
         hubiera compartido, así que no basta con un «¿seguro?»: hay que
         escribir la palabra. Un botón rojo se pulsa sin querer; una palabra
         escrita a mano, no. */
      $('#cuenta-borrar').addEventListener('click', function () {
        var b = this;
        ask({
          title: 'Borrar tu cuenta',
          message: 'Se borran la cuenta, tu perfil y todos los ejercicios que hayas subido, ' +
                   'incluidos los compartidos. No se puede deshacer. Escribe BORRAR para ' +
                   'confirmarlo.',
          input: '', placeholder: 'BORRAR', ok: 'Borrar mi cuenta', danger: true
        }).then(function (t) {
          if (t === null) return;
          if (String(t).toUpperCase() !== 'BORRAR') { toast('No se ha borrado nada'); return; }
          b.disabled = true;
          return nube.borraCuenta().then(function () {
            // Lo de este dispositivo no lo toca el servidor, y tampoco nosotros:
            // la plantilla y las sesiones son suyas y siguen donde estaban.
            yo = null; nubeMios = []; nubeLista = [];
            pintaCuenta(); pintaBiblioteca();
            toast('Tu cuenta se ha borrado');
          }).catch(function (e) {
            toast('No se ha podido borrar: ' + (e.message || 'error'));
          }).then(function () { b.disabled = false; });
        });
      });

      $('#cuenta-guardar').addEventListener('click', function () {
        var b = this; b.disabled = true;
        nube.perfil({ nombre: $('#cuenta-nombre').value.trim() || 'Entrenador',
                      club: $('#cuenta-club').value.trim() })
          .then(refrescaCuenta)
          .then(function () { toast('Guardado'); })
          .catch(function (e) { toast('No se ha podido: ' + (e.message || 'error')); })
          .then(function () { b.disabled = false; });
      });

      refrescaCuenta();
      nube.alCambiar(function () { refrescaCuenta(); });

      /* La sincronización entre dispositivos. Se arranca aquí, con la cuenta
         ya montada: si se hiciera antes, no sabría de quién es el cofre.

         No hay nada que encender. La plantilla va con la cuenta, igual que los
         ejercicios que subes: entras y está. Llegó a tener un interruptor y
         una pregunta la primera vez, y se quitaron: un interruptor para algo
         que va de suyo solo añade un sitio donde equivocarse y una pregunta
         que nadie sabe contestar la primera vez que la ve. */
      if (sincro) {
        sincro.alCambiar(function (e) {
          pistasDelCajon();
          pintaSincro();
          if (e.datosNuevos) repintaElEquipo();
          if (e.choques && e.choques.length) cuentaLosChoques(e.choques);
        });
        sincro.arranca();
      }

      /* Cuando se vuelve del enlace de un correo, la sesión llega en la
         dirección. La nube la recogía y guardaba, pero nadie miraba el
         resultado: el usuario aterrizaba en la pizarra sin que nada le dijera
         si había funcionado. Y en el caso de recuperar la contraseña hay que
         pedirle una nueva ahí mismo, porque ese enlace es su única llave y
         caduca. */
      var regreso = nube.vuelta();
      if (regreso) {
        if (regreso.error) {
          abreCuenta(false);
          var av = $('#cuenta-aviso'); av.textContent = regreso.error; av.hidden = false;
        } else if (regreso.recuperando) {
          refrescaCuenta().then(function () {
            pideClaveNueva('Tu cuenta está abierta. Escribe una contraseña nueva para no ' +
                           'volver a perderla; con ella entrarás a partir de ahora.');
          });
        } else if (regreso.entrado) {
          toast('Has entrado con tu cuenta');
        }
      }
    }

    pintaCuenta();
    pintaPrivacidad();

    // ---- Ficha ----
    llenaSelectorPlantillas();
    pintaSugerencias();

    // Si el apartado no tiene acción propia, su fila de rótulo sobra.
    $$('.paso > .form-group').forEach(function (g) {
      if (!g.querySelector('button')) g.classList.add('vacio');
    });

    // La ficha va por apartados: cada botón enseña el suyo.
    function verPaso(id) {
      $$('.paso').forEach(function (p) { p.hidden = p.id !== 'paso-' + id; });
      $$('.paso-btn').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.paso === id));
      });
      var cuerpo = $('#dlg-save .dbody');
      if (cuerpo) cuerpo.scrollTop = 0;
    }
    $$('.paso-btn').forEach(function (b) {
      b.addEventListener('click', function () { verPaso(b.dataset.paso); });
    });
    $('#f-plantilla').addEventListener('change', function () {
      var id = this.value, sel = this;
      sel.value = '';
      if (!id) return;
      if (!CARD_FIELDS.some(function (k) { var e = fieldEl(k); return e && e.value.trim() && k !== 'fecha'; })) {
        aplicaPlantilla(id); return;
      }
      ask({ title: 'Usar la plantilla', message: 'Se sustituye lo que hayas escrito en la ficha, menos la categoría, la fecha y la sesión.', ok: 'Sustituir' })
        .then(function (si) { if (si) aplicaPlantilla(id); });
    });
    // La ficha salió de la barra: ahora su única entrada propia es la fila del
    // panel, y su sitio de verdad es dentro de Guardar.
    $('#f-auto').addEventListener('click', autofillCard);
    // ---- Ajustes ----
    function pintaAjustes() {
      var p = prefs();
      $$('[data-cfg-pitch]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.cfgPitch === p.pitch));
      });
      $('#cfg-categoria').value = p.categoria;
    }
    function abreAjustes() { pintaAjustes(); $('#dlg-cfg').showModal(); }
    // El cajón también lleva a los ajustes, y vive fuera de este trozo.
    abreLosAjustes = abreAjustes;
    $('#cfg').addEventListener('click', abreAjustes);
    $('#cfg-row').addEventListener('click', function () { sheetClose(); abreAjustes(); });
    $$('[data-cfg-pitch]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = prefs(); p.pitch = b.dataset.cfgPitch; guardaPrefs(p);
        pintaAjustes();
        toast('La biblioteca y las pizarras nuevas empiezan en ' + PITCHES[p.pitch].label.toLowerCase());
      });
    });
    $('#cfg-categoria').addEventListener('change', function () {
      var p = prefs(); p.categoria = this.value.trim(); guardaPrefs(p);
    });

    $('#help').addEventListener('click', function () { sheetClose(); $('#dlg-help').showModal(); });
    $('#zoom').addEventListener('click', resetView);
    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });

    var aside = $('#aside'), scrim = $('#scrim');
    var current = null;

    // Cada pestaña abre lo suyo y nada más: la hoja enseña un solo grupo.
    var TITULOS = { dibujar: 'Dibujar', colocar: 'Colocar en el campo',
                    campo: 'El campo', mas: 'Más' };

    function sheetOpen(id) {
      current = id;
      var block = document.getElementById(id);
      var grupo = block ? block.dataset.grupo : '';
      aside.dataset.grupo = grupo;
      $('#sheet-tit').textContent = TITULOS[grupo] || '';
      aside.classList.add('open');
      scrim.classList.add('show');
      $$('.tab[data-section]').forEach(function (t) { t.setAttribute('aria-pressed', String(t.dataset.section === id)); });
      requestAnimationFrame(function () { aside.scrollTop = 0; });
    }
    cierraLaHoja = sheetClose;
    function sheetClose() {
      current = null;
      aside.classList.remove('open');
      scrim.classList.remove('show');
      $$('.tab[data-section]').forEach(function (t) { t.setAttribute('aria-pressed', 'false'); });
    }

    $$('.tab[data-section]').forEach(function (t) {
      t.addEventListener('click', function () {
        if (current === t.dataset.section) sheetClose();
        else sheetOpen(t.dataset.section);
      });
    });
    scrim.addEventListener('click', sheetClose);
    $('#sheet-grab').addEventListener('click', sheetClose);

    /* Arrastrar la hoja hacia abajo para cerrarla.

       El asa tiene forma de asa, así que la gente la arrastra. Y no pasaba
       nada: solo respondía al toque. Peor todavía, al tirar hacia abajo con la
       hoja ya arriba del todo, el navegador la hacía rebotar sobre sí misma y
       dejaba a la vista una franja vacía encima del asa. La hoja parecía rota
       sin estarlo.

       Se arrastra desde el asa siempre, y desde el cuerpo solo cuando ya está
       arriba del todo: si no, tirar hacia abajo para leer lo de arriba
       cerraría la hoja en vez de desplazarla. */
    (function hojaArrastrable() {
      var y0 = 0, dy = 0, activo = false, desdeAsa = false, t0 = 0;
      var CIERRA = 88;                 // lo que hay que bajarla para que se cierre

      function empieza(e) {
        if (!aside.classList.contains('open') || e.touches.length !== 1) return;
        desdeAsa = !!(e.target.closest && e.target.closest('.sheet-grab, .sheet-tit'));
        activo = desdeAsa || aside.scrollTop <= 0;
        y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
      }
      function mueve(e) {
        if (!activo) return;
        var d = e.touches[0].clientY - y0;
        // Hacia arriba no: se devuelve el gesto al desplazamiento normal.
        if (d <= 0) {
          if (!desdeAsa) { activo = false; suelta(); }
          return;
        }
        e.preventDefault();            // esto es lo que mata el rebote
        dy = d;
        aside.classList.add('arrastrando');
        aside.style.transform = 'translateY(' + d.toFixed(1) + 'px)';
        // El velo se va aclarando: el gesto se ve, no solo se nota al soltar.
        scrim.style.opacity = String(Math.max(0, 1 - d / 280));
      }
      function suelta() {
        aside.classList.remove('arrastrando');
        aside.style.transform = '';
        scrim.style.opacity = '';
        // Un golpe corto y rápido cierra aunque no haya bajado los 88 px: es
        // el gesto que hace todo el mundo, un manotazo hacia abajo.
        var rapido = (Date.now() - t0) < 320 && dy > 34;
        if (dy > CIERRA || rapido) sheetClose();
        activo = false; desdeAsa = false; dy = 0;
      }
      aside.addEventListener('touchstart', empieza, { passive: true });
      aside.addEventListener('touchmove', mueve, { passive: false });
      aside.addEventListener('touchend', function () { if (activo) suelta(); });
      aside.addEventListener('touchcancel', function () { if (activo) suelta(); });
    })();

    // Elegir una herramienta o un material cierra la hoja y deja el campo libre.
    aside.addEventListener('click', function (e) {
      if (window.innerWidth <= 900 && e.target.closest('[data-tool],[data-place],[data-view],[data-width],.sw')) {
        setTimeout(sheetClose, 130);
      }
    });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (k === 'escape') { ui.multi = []; setTool('select'); return; }
      if (k === '+' || k === '=') { setZoom(ui.zoom * 1.25); return; }
      if (k === '-') { setZoom(ui.zoom / 1.25); return; }
      if (k === '0') { resetView(); return; }
      if (k === ' ') { e.preventDefault(); ui.playing ? stop() : play(); return; }
      if (k === 'delete' || k === 'backspace') {
        e.preventDefault();
        if (ui.multi.length) { $('#g-del', insp) && $('#g-del', insp).click(); }
        else if (ui.sel) removeObject(byId(ui.sel));
        return;
      }
      if (k === 'r' && ui.sel) {
        var so = byId(ui.sel);
        if (so && KIND[so.kind].rot) {
          so.rot = ((so.rot || 0) + (e.shiftKey ? -15 : 15) + 360) % 360;
          commit(); draw();
        }
        return;
      }
      var map = { v: 'select', a: 'pass', s: 'run', d: 'dribble', f: 'free', z: 'zone', e: 'eraser', m: 'measure' };
      if (map[k]) { setTool(map[k]); }
    });

    window.addEventListener('resize', resize);
    // Al pasar de escritorio a móvil (o al girar el teléfono) los bloques del
    // panel tienen que volver a su sitio: plegados allí, abiertos aquí.
    window.addEventListener('resize', ajustaBloquesDelPanel);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 260); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentNode);

    // Nada de zoom por pellizco ni por doble toque: se dibuja con el dedo.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    // Y nada de menú contextual al mantener pulsado sobre el campo.
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* =========================================================================
     Instalación en el dispositivo
     ====================================================================== */

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.navigator.standalone === true ||
           (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  }

  function setupInstall() {
    var btn = $('#install'), deferred = null;

    // iOS no ofrece aviso de instalación: hay que explicar el camino de Safari.
    if (isIOS() && !isStandalone()) {
      btn.hidden = false;
      btn.lastChild.textContent = ' Instalar en el iPhone';
      btn.addEventListener('click', function () { $('#dlg-ios').showModal(); });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });
    btn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; btn.hidden = true; });
    });
    window.addEventListener('appinstalled', function () {
      btn.hidden = true;
      toast('Pizarra instalada. Ya puedes abrirla desde el icono.');
    });

    /* Guarda la aplicación para poder abrirla sin conexión.

       La condición era location.protocol === 'https:', que deja fuera
       localhost. El navegador sí lo permite ahí —lo considera sitio de
       confianza igual que https— y esa es justo la condición que él mismo usa:
       isSecureContext. Con la de antes, el modo sin conexión no se podía ni
       probar en local, así que nadie comprobaba nunca que funcionara. Si el
       registro no se puede hacer (por ejemplo abriendo el archivo suelto desde
       el disco), falla y no pasa nada: la pizarra funciona igual. */
    if ('serviceWorker' in navigator && window.isSecureContext) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  /* =========================================================================
     Arranque
     ====================================================================== */

  function seed() {
    // Una disposición inicial para que la pizarra no aparezca vacía, con la
    // primera alineación de la modalidad que toque.
    var set = formationSet(), nombre = Object.keys(set.pos)[0], P = PITCH();
    var f = frame();
    set.pos[nombre].forEach(function (p, i) {
      f.objects.push({ id: uid(), kind: 'player', team: 'home', x: p[0], y: p[1],
                       num: set.num[nombre][i], rot: 0 });
    });
    f.objects.push({ id: uid(), kind: 'ball', x: P.L * 0.27, y: P.W / 2, rot: 0 });
  }

  function ensurePitch() { if (!doc.pitch) doc.pitch = 'f11'; }

  /* -------------------------------------------------------------------------
     Los bloques plegables del panel.

     En el escritorio el panel enseñaba los siete bloques a la vez: treinta y
     nueve mandos en frío, que es de lo que se quejaba el encargo. Los cuatro
     secundarios se pliegan ahí. En el móvil NO: la hoja ya enseña un solo
     grupo por pestaña, y plegarlos costaría un toque de más en cada material.

     Lo que abras se recuerda en los ajustes. Un entrenador que use los conos
     todos los días los abre una vez, no una vez por sesión. */
  var BLOQUES_PLEGABLES = ['b-tools-mas', 'b-color', 'b-forms', 'b-mats', 'b-view', 'b-actions'];

  function esEscritorio() { return window.innerWidth > 900; }

  /* Poner «open» desde aquí dispara el evento «toggle», igual que si lo hubiera
     pulsado alguien. Sin esta bandera, abrir la aplicación en un escritorio
     dejaba escritos en los ajustes cuatro bloques «cerrados» que nadie había
     cerrado, y al abrirla luego en el móvil se leerían como una decisión. */
  var ajustandoBloques = false;

  function ajustaBloquesDelPanel() {
    var abiertos = prefs().panel || {};
    ajustandoBloques = true;
    BLOQUES_PLEGABLES.forEach(function (id) {
      var d = document.getElementById(id);
      if (!d || d.tagName !== 'DETAILS') return;
      d.open = !esEscritorio() || !!abiertos[id];
    });
    setTimeout(function () { ajustandoBloques = false; }, 0);
  }

  function recuerdaBloque(id, abierto) {
    if (ajustandoBloques) return;         // no lo ha tocado nadie
    if (!esEscritorio()) return;          // en el móvil van siempre abiertos
    var p = prefs();
    if (!p.panel) p.panel = {};
    p.panel[id] = !!abierto;
    guardaPrefs(p);
  }

  function start() {
    wire();
    ajustaBloquesDelPanel();
    BLOQUES_PLEGABLES.forEach(function (id) {
      var d = document.getElementById(id);
      if (d) d.addEventListener('toggle', function () { recuerdaBloque(id, d.open); });
    });
    cargaCatalogo();
    setupInstall();
    var saved = null;
    try { saved = localStorage.getItem('pt-autosave'); } catch (e) {}
    var recuperada = false;
    if (saved) {
      try {
        var d = JSON.parse(saved);
        if (d && Array.isArray(d.frames) && d.frames.length) { doc = saneaDoc(d); recuperada = true; }
      } catch (e) {}
    }
    if (!recuperada) doc.pitch = prefs().pitch;  // primera visita: tu modalidad
    ensurePitch();
    if (!doc.frames[0].objects.length && doc.frames.length === 1) seed();
    syncViewButtons();
    buildFrames();
    commit();
    hi = 0; hist = [JSON.stringify(doc)];
    refreshHistoryButtons();
    resize();
    setTool('select');
    setTimeout(function () {
      hint(window.innerWidth <= 900
        ? 'Arrastra las fichas. Con <b>+</b> añades un fotograma y la jugada se anima.'
        : 'Arrastra las fichas · pulsa <b>+</b> en la línea de tiempo y mueve la jugada para animarla');
    }, 700);
    setTimeout(function () { hint(''); }, 7000);

    // Lo último: si la dirección trae una jugada, se abre. Va al final para que
    // la pizarra ya esté montada y se pueda sustituir sin sobresaltos.
    abreLoQueTraeElEnlace();

    /* Y si llega un enlace con la aplicación YA abierta. Cambiar solo lo que va
       detrás del # no recarga la página —el navegador se limita a mover el
       ancla—, así que sin esto el enlace no hacía nada: te quedabas mirando tu
       pizarra de siempre preguntándote por qué no se abría la jugada. */
    window.addEventListener('hashchange', function () { abreLoQueTraeElEnlace(); });
  }

  /* Red de seguridad del arranque. Si algo se rompe montando la pizarra, lo
     más probable es que sea lo que había guardado; y como se vuelve a leer en
     cada recarga, la aplicación se quedaría en blanco para siempre sin manera
     de salir salvo borrando los datos del navegador a mano. Así que se tira lo
     guardado y se arranca limpio una vez. Si vuelve a fallar, ya no es eso: se
     deja pasar el error para que se vea en la consola. */
  /* -------------------------------------------------------------------------
     La copia de seguridad de antes de tocar nada.

     Lo que hay en este navegador es lo único que hay: no se sincroniza con
     ningún sitio a propósito. Si un cambio en el guardado sale mal, no hay
     servidor del que recuperar la biblioteca de un entrenador, ni su plantilla,
     ni un año de asistencia. Así que antes de que esta versión escriba nada, se
     guarda una foto de lo que había.

     Se hace UNA vez y no se vuelve a tocar. Es a propósito: una copia que se
     refresca sola acabaría copiando encima lo que se rompió, que es justo
     cuando hace falta la copia.

     Queda fuera «pt-autosave» —la pizarra a medias que tienes delante—: es lo
     más volátil, es lo que la red de seguridad de abajo borra cuando algo viene
     dañado, y ocupa tanto como el resto junto.

     Si no cabe, no pasa nada y nadie se entera: una copia de seguridad que
     impida arrancar es peor que no tenerla. */
  var LLAVE_COPIA = 'pt-backup-v1';
  var COPIA_DE = ['pt-boards', 'pt-squad', 'pt-asistencia', 'pt-sesiones', 'pt-prefs'];

  function copiaDeSeguridadUnaVez() {
    try {
      if (localStorage.getItem(LLAVE_COPIA)) return 'ya estaba';
      var claves = {}, hayAlgo = false;
      COPIA_DE.forEach(function (k) {
        var v = localStorage.getItem(k);
        if (v == null) return;
        claves[k] = v;
        hayAlgo = true;
      });
      // Un navegador estrenado no necesita copia de nada.
      if (!hayAlgo) return 'no hay nada que copiar';
      localStorage.setItem(LLAVE_COPIA, JSON.stringify({
        hecha: new Date().toISOString(),
        porque: 'antes de unificar el guardado',
        claves: claves
      }));
      return 'hecha';
    } catch (e) {
      // Con el almacén lleno, setItem lanza y puede dejar la llave a medias.
      try { localStorage.removeItem(LLAVE_COPIA); } catch (e2) {}
      return 'no cabe';
    }
  }

  function arranca() {
    copiaDeSeguridadUnaVez();
    try {
      start();
    } catch (e) {
      try { localStorage.removeItem('pt-autosave'); } catch (e2) {}
      start();
      setTimeout(function () {
        toast('La pizarra que tenías guardada estaba dañada y se ha empezado de cero');
      }, 900);
    }
    /* Después de arrancar, no antes: el cartel señala al menú, y el menú tiene
       que existir. Con un respiro para que lo primero que se vea sea el campo. */
    setTimeout(quizaEnseñaLaPista, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca);
  else arranca();
})();
