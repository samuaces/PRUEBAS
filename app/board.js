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
    var P = PITCH(), m = Math.max(2.5, P.L * 0.05);
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
  var KIND = {
    player:   { r: 1.45,               rot: false, label: 'Jugador' },
    ball:     { r: 0.85,               rot: false, label: 'Balón' },
    cone:     { r: 0.95,               rot: true,  label: 'Cono' },
    disc:     { r: 1.00,               rot: true,  label: 'Chino' },
    goal:     { w: 7.32, h: 2.0,       rot: true,  label: 'Portería' },
    minigoal: { w: 4.5,  h: 1.8,       rot: true,  label: 'Portería pequeña' },
    hurdle:   { w: 2.2,  h: 1.1,       rot: true,  label: 'Valla' },
    ladder:   { w: 7.0,  h: 1.6,       rot: true,  label: 'Escalera' },
    pole:     { r: 0.75,               rot: true,  label: 'Pica' },
    dummy:    { w: 1.4,  h: 2.1,       rot: true,  label: 'Maniquí' },
    ring:     { r: 1.2,                rot: true,  label: 'Aro' },
    flag:     { r: 1.00,               rot: true,  label: 'Banderín' },
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
        if (d.card[k] != null && typeof d.card[k] !== 'object') out.card[k] = String(d.card[k]);
      });
    }
    (Array.isArray(d.frames) ? d.frames : []).forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      out.frames.push({
        objects: (Array.isArray(f.objects) ? f.objects : []).map(saneaObjeto).filter(Boolean),
        strokes: (Array.isArray(f.strokes) ? f.strokes : []).map(saneaTrazo).filter(Boolean)
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
    var pad = 8;
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

  function hitObject(m) {
    var a = frame().objects;
    for (var i = a.length - 1; i >= 0; i--) {
      var o = a[i], k = dims(o);
      if (k.r != null) {
        if (Math.hypot(m.x - o.x, m.y - o.y) <= k.r + (DE_PIE[o.kind] ? 0.75 : 0.35)) return o;
      } else {
        var ang = -(o.rot || 0) * Math.PI / 180;
        var dx = m.x - o.x, dy = m.y - o.y;
        var lx = dx * Math.cos(ang) - dy * Math.sin(ang);
        var ly = dx * Math.sin(ang) + dy * Math.cos(ang);
        if (Math.abs(lx) <= k.w / 2 + 0.3 && Math.abs(ly) <= k.h / 2 + 0.3) return o;
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
    $('#play').disabled = doc.frames.length < 2;
    $('#delframe').disabled = doc.frames.length < 2;
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

  var dlgCard;

  function fieldEl(k) { return document.getElementById('f-' + k); }

  function openCard() {
    var c = card();
    CARD_FIELDS.forEach(function (k) {
      var el = fieldEl(k);
      if (el) el.value = c[k] || '';
    });
    if (!c.fecha) fieldEl('fecha').value = new Date().toLocaleDateString('es-ES');
    if (!c.categoria) fieldEl('categoria').value = prefs().categoria;
    if (!dlgCard) dlgCard = $('#dlg-card');
    var primero = $('.paso-btn');
    if (primero) primero.click();          // se abre siempre por el primer apartado
    dlgCard.showModal();
  }

  function readCard() {
    var c = card();
    CARD_FIELDS.forEach(function (k) {
      var el = fieldEl(k);
      if (el) c[k] = el.value.trim();
    });
    return c;
  }

  // Guardar la ficha guarda el ejercicio entero. Antes solo se quedaba dentro
  // del documento abierto: rellenabas la ficha, le dabas a Guardar, y al ir a
  // la biblioteca no había nada. Si la ficha tiene título, ese es el nombre, y
  // volver a guardar actualiza la misma entrada en vez de llenarlo de copias.
  function saveCard() {
    readCard();
    commit();
    var titulo = (doc.card && doc.card.titulo || '').trim();
    if (!titulo) { toast('Ficha guardada · ponle un título para tenerla en la biblioteca'); return; }
    var todas = savedBoards();
    var nueva = !todas[titulo];
    todas[titulo] = { at: Date.now(), doc: doc };
    if (!writeBoards(todas)) { toast('Ficha guardada, pero no cabe en el almacenamiento del navegador'); return; }
    olvidaMini('mia:' + titulo);
    toast(nueva ? '«' + titulo + '» guardado en tu biblioteca'
                : '«' + titulo + '» actualizado en tu biblioteca');
  }

  function autofillCard() {
    var st = boardStats(), P = PITCH(), puesto = 0;
    function set(k, v) {
      var el = fieldEl(k);
      if (!el || !v) return;
      if (el.value.trim()) return;   // no se pisa lo que ya has escrito
      el.value = v; puesto++;
    }
    set('jugadores', statsPlayers(st));
    set('porteros', st.gk ? String(st.gk) : '');
    set('material', statsMaterial(st));
    set('espacio', doc.view === 'full' ? P.L + ' × ' + P.W + ' m' : statsSpace(st));
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
      '<footer><span>Pizarra Táctica</span><span>' + esc(fecha) + '</span></footer>' +
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
          .then(function () { toast('Contraseña cambiada. Ya puedes entrar con ella'); return true; })
          .catch(function (e) { toast('No se ha podido: ' + (e.message || 'error')); return false; });
      });
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
        'a propósito y, si entras, tu correo para reconocerte. Tu correo no lo ve nadie más.';
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
          abreAjustes();
          setTimeout(function () { var e = $('#cuenta-email'); if (e) e.focus(); }, 300);
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
                     doc: d, at: mias[n].at });
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
      if (q && sinAcentos(textoItem(it)).indexOf(q) < 0) return false;
      return true;
    });
  }

  // Los filtros arrancan en la modalidad predeterminada: mezclar fútbol 11,
  // fútbol 7 y sala en la misma lista no le sirve a nadie.
  function filtrosPorDefecto() {
    return { q: '', origen: 'catalogo', pitch: prefs().pitch, momento: '', duracion: '' };
  }
  var libFiltros = filtrosPorDefecto();

  // La línea que explica de dónde sale lo que estás viendo.
  function notaBiblioteca() {
    if (libFiltros.origen === 'mia') {
      if (!hayNube) return 'Lo que guardas se queda en este dispositivo';
      if (!yo) return 'Lo guardado se queda en este dispositivo · entra con tu correo ' +
                      'en Ajustes para tener los tuyos en cualquier sitio';
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
    $('#lib-limpiar').hidden = !(libFiltros.q || libFiltros.momento ||
                                 libFiltros.duracion || libFiltros.pitch !== porDefecto.pitch);
    $$('.lib-tab').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.origen === libFiltros.origen));
    });
    $('#lib-nota').textContent = notaBiblioteca();

    grid.innerHTML = '';
    preparaMiniObs(grid);      // observador nuevo en cada repintado, sin dejar el viejo suelto
    if (!vistos.length) {
      var hayFiltros = libFiltros.q || libFiltros.momento || libFiltros.duracion;
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

      var pie = document.createElement('div');
      pie.className = 'lib-pie';
      var marca = document.createElement('span');
      marca.className = 'lib-origen';
      marca.textContent = firmaItem(it);
      if (it.fuente === 'nube' && !it.publicado) marca.classList.add('privado');
      pie.appendChild(marca);

      var abrir = document.createElement('button');
      abrir.className = 'tbtn primary'; abrir.textContent = 'Abrir';
      abrir.addEventListener('click', function () { abreItem(it); });
      pie.appendChild(abrir);

      botonesDeItem(it).forEach(function (b) { pie.appendChild(b); });
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
  function preparaMiniObs(grid) {
    if (miniObs) { miniObs.disconnect(); miniObs = null; }
    if (typeof IntersectionObserver !== 'function') return;   // navegador viejo: como antes
    miniObs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) { if (e.isIntersecting) pintaMini(e.target); });
    }, { root: grid.closest('.dbody') || null, rootMargin: '500px 0px' });
  }
  /* El observador avisa cuando el navegador quiere, y en el primer pintado —con
     el diálogo recién abierto— a veces no ha avisado todavía. Lo que ya cae
     dentro de la pantalla no espera a nadie: se dibuja aquí mismo. */
  function pintaLoQueSeVe(grid) {
    var cont = grid.closest('.dbody') || document.documentElement;
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
    if (it.fuente === 'local') return 'Tuya, en este dispositivo';
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
    ui.frame = 0; ui.sel = null; ui.multi = [];
    syncViewButtons(); buildFrames(); hideInspector(); commit(); resize();
    $('#dlg-lib').close();
    toast('«' + (it.nombre || 'Ejercicio') + '» abierto');
  }

  function openLibrary() {
    // La modalidad vuelve a la tuya cada vez que se abre; lo demás también.
    libFiltros = filtrosPorDefecto();
    $('#lib-q').value = '';
    $('#lib-momento').value = ''; $('#lib-duracion').value = '';
    $('#lib-pitch').value = libFiltros.pitch;
    pintaBiblioteca();
    $('#dlg-lib').showModal();
    cargaNube();
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

  // ---- Hoja de sesión: todos los fotogramas en una página para llevar al campo ----
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
          '<title>' + (title || 'Hoja de sesión') + '</title><style>' +
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
          '<header><h1>' + (title || 'Hoja de sesión') + '</h1>' +
          '<span>' + PITCHES[doc.pitch].label + ' · ' + P.L + ' × ' + P.W + ' m · ' +
          new Date().toLocaleDateString('es-ES') + '</span></header>' +
          '<div class="grid' + (doc.frames.length === 1 ? ' one' : '') + '">' + imgs + '</div>' +
          '<div class="notes"></div>' +
          '<footer>Pizarra Táctica</footer>' +
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

  /* =========================================================================
     Codificador GIF (sin dependencias)
     Un GIF lo abre cualquier cosa: Fotos del iPhone, WhatsApp, Telegram, correo.
     Paleta global por corte mediano y compresión LZW, como manda GIF89a.
     ====================================================================== */

  // Reduce los colores de la jugada a una paleta de como mucho `maxColors`.
  function medianCut(samples, maxColors) {
    function stats(list) {
      var lo = [255, 255, 255], hi = [0, 0, 0];
      for (var i = 0; i < list.length; i += 3) {
        for (var c = 0; c < 3; c++) {
          var v = list[i + c];
          if (v < lo[c]) lo[c] = v;
          if (v > hi[c]) hi[c] = v;
        }
      }
      return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    }

    var boxes = [{ list: samples, range: stats(samples) }];

    while (boxes.length < maxColors) {
      var bi = -1, best = 0;
      for (var i = 0; i < boxes.length; i++) {
        var r = Math.max(boxes[i].range[0], boxes[i].range[1], boxes[i].range[2]);
        if (r > best && boxes[i].list.length > 3) { best = r; bi = i; }
      }
      if (bi < 0) break;

      var box = boxes[bi];
      var ch = box.range.indexOf(Math.max(box.range[0], box.range[1], box.range[2]));
      var triples = [];
      for (var j = 0; j < box.list.length; j += 3) {
        triples.push([box.list[j], box.list[j + 1], box.list[j + 2]]);
      }
      triples.sort(function (a, b) { return a[ch] - b[ch]; });

      var mid = triples.length >> 1, a1 = [], a2 = [];
      for (var k = 0; k < triples.length; k++) {
        var t = triples[k], dst = k < mid ? a1 : a2;
        dst.push(t[0], t[1], t[2]);
      }
      if (!a1.length || !a2.length) break;
      boxes.splice(bi, 1, { list: a1, range: stats(a1) }, { list: a2, range: stats(a2) });
    }

    return boxes.map(function (b) {
      var n = b.list.length / 3, r = 0, g = 0, bl = 0;
      for (var i = 0; i < b.list.length; i += 3) {
        r += b.list[i]; g += b.list[i + 1]; bl += b.list[i + 2];
      }
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });
  }

  function GifWriter(w, h, palette, delayCs) {
    var out = [];
    var bits = Math.max(1, Math.ceil(Math.log(palette.length) / Math.LN2));
    var size = 1 << bits;

    function byte(b) { out.push(b & 255); }
    function word(v) { byte(v); byte(v >> 8); }
    function text(t) { for (var i = 0; i < t.length; i++) byte(t.charCodeAt(i)); }

    text('GIF89a');
    word(w); word(h);
    byte(0xF0 | (bits - 1));            // hay tabla global de color
    byte(0); byte(0);
    for (var i = 0; i < size; i++) {
      var c = palette[i] || [0, 0, 0];
      byte(c[0]); byte(c[1]); byte(c[2]);
    }
    byte(0x21); byte(0xFF); byte(11); text('NETSCAPE2.0');   // repetir siempre
    byte(3); byte(1); word(0); byte(0);

    // x,y,fw,fh delimitan la zona que cambia respecto al fotograma anterior.
    // Con disposal 1 ("dejar tal cual") el resto de la imagen se conserva, que es
    // lo que permite que un GIF de una jugada pese una fracción de lo normal.
    this.addFrame = function (indices, x, y, fw, fh) {
      byte(0x21); byte(0xF9); byte(4); byte(0x04);
      word(delayCs); byte(0); byte(0);
      byte(0x2C); word(x || 0); word(y || 0); word(fw || w); word(fh || h); byte(0);
      lzw(indices, bits);
    };

    this.finish = function () {
      byte(0x3B);
      return new Uint8Array(out);
    };

    function lzw(px, minBits) {
      var codeSize = Math.max(2, minBits);
      byte(codeSize);

      var clear = 1 << codeSize, eoi = clear + 1;
      var dict, next, cur;
      var block = [], acc = 0, accBits = 0;

      function flush() {
        if (!block.length) return;
        byte(block.length);
        for (var i = 0; i < block.length; i++) byte(block[i]);
        block = [];
      }
      function emit(code, len) {
        acc |= code << accBits;
        accBits += len;
        while (accBits >= 8) {
          block.push(acc & 255);
          acc >>= 8;
          accBits -= 8;
          if (block.length === 255) flush();
        }
      }
      function reset() { dict = new Map(); next = eoi + 1; cur = codeSize + 1; }

      reset();
      emit(clear, cur);

      var prev = px[0];
      for (var i = 1; i < px.length; i++) {
        var k = px[i], key = prev * 4096 + k;
        var hit = dict.get(key);
        if (hit !== undefined) { prev = hit; continue; }
        emit(prev, cur);
        dict.set(key, next++);
        if (next >= (1 << cur)) {
          if (cur < 12) cur++;
          else { emit(clear, cur); reset(); }
        }
        prev = k;
      }
      emit(prev, cur);
      emit(eoi, cur);
      if (accBits > 0) { block.push(acc & 255); if (block.length === 255) flush(); }
      flush();
      byte(0);
    }
  }

  // Convierte una imagen RGBA al índice de paleta más cercano, con caché.
  function quantize(data, palette, cache) {
    var n = data.length / 4, idx = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      var key = (r << 16) | (g << 8) | b;
      var hit = cache.get(key);
      if (hit === undefined) {
        var bestD = Infinity, bestI = 0;
        for (var p = 0; p < palette.length; p++) {
          var c = palette[p];
          var dr = r - c[0], dg = g - c[1], db = b - c[2];
          var d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; bestI = p; }
        }
        hit = bestI;
        cache.set(key, hit);
      }
      idx[i] = hit;
    }
    return idx;
  }

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
     Empaquetador MP4 (ISO BMFF) para vídeo H.264
     Cuando el navegador no sabe grabar MP4 por sí solo, se codifica con
     WebCodecs y se arma aquí el contenedor. Sin bibliotecas externas.
     ====================================================================== */

  function mp4Bytes(str) {
    var a = [];
    for (var i = 0; i < str.length; i++) a.push(str.charCodeAt(i) & 255);
    return a;
  }
  function u32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
  function u16(v) { return [(v >>> 8) & 255, v & 255]; }

  function mp4Box(type, parts) {
    var payload = [];
    for (var i = 0; i < parts.length; i++) payload = payload.concat(parts[i]);
    return u32(payload.length + 8).concat(mp4Bytes(type), payload);
  }
  function mp4Full(type, version, flags, parts) {
    return mp4Box(type, [[version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]].concat(parts));
  }

  var MP4_MATRIX = u32(0x00010000).concat(u32(0), u32(0),
                                          u32(0), u32(0x00010000), u32(0),
                                          u32(0), u32(0), u32(0x40000000));

  // samples: [{ data: Uint8Array, key: boolean }] · todos con la misma duración
  function buildMp4(width, height, timescale, delta, samples, avcC) {
    var count = samples.length, duration = count * delta;
    var sizes = [], keys = [], dataLen = 0;
    samples.forEach(function (s2, i) {
      sizes = sizes.concat(u32(s2.data.length));
      dataLen += s2.data.length;
      if (s2.key) keys = keys.concat(u32(i + 1));
    });

    var ftyp = mp4Box('ftyp', [mp4Bytes('isom'), u32(512),
                               mp4Bytes('isom'), mp4Bytes('iso2'), mp4Bytes('avc1'), mp4Bytes('mp41')]);
    var mdatOffset = ftyp.length + 8;   // los datos empiezan tras la cabecera de mdat

    var avc1 = mp4Box('avc1', [
      [0, 0, 0, 0, 0, 0], u16(1),
      u16(0), u16(0), u32(0), u32(0), u32(0),
      u16(width), u16(height),
      u32(0x00480000), u32(0x00480000),
      u32(0), u16(1),
      new Array(32).fill(0),
      u16(0x0018), [0xFF, 0xFF],
      mp4Box('avcC', [Array.prototype.slice.call(avcC)])
    ]);

    var stbl = mp4Box('stbl', [
      mp4Full('stsd', 0, 0, [u32(1), avc1]),
      mp4Full('stts', 0, 0, [u32(1), u32(count), u32(delta)]),
      mp4Full('stss', 0, 0, [u32(keys.length / 4), keys]),
      mp4Full('stsc', 0, 0, [u32(1), u32(1), u32(count), u32(1)]),
      mp4Full('stsz', 0, 0, [u32(0), u32(count), sizes]),
      mp4Full('stco', 0, 0, [u32(1), u32(mdatOffset)])
    ]);

    var minf = mp4Box('minf', [
      mp4Full('vmhd', 0, 1, [u16(0), u16(0), u16(0), u16(0)]),
      mp4Box('dinf', [mp4Full('dref', 0, 0, [u32(1), mp4Full('url ', 0, 1, [])])]),
      stbl
    ]);

    var mdia = mp4Box('mdia', [
      mp4Full('mdhd', 0, 0, [u32(0), u32(0), u32(timescale), u32(duration), u16(0x55C4), u16(0)]),
      mp4Full('hdlr', 0, 0, [u32(0), mp4Bytes('vide'), u32(0), u32(0), u32(0), mp4Bytes('VideoHandler'), [0]]),
      minf
    ]);

    var trak = mp4Box('trak', [
      mp4Full('tkhd', 0, 3, [u32(0), u32(0), u32(1), u32(0), u32(duration),
                             u32(0), u32(0), u16(0), u16(0), u16(0), u16(0),
                             MP4_MATRIX, u32(width * 65536), u32(height * 65536)]),
      mdia
    ]);

    var moov = mp4Box('moov', [
      mp4Full('mvhd', 0, 0, [u32(0), u32(0), u32(timescale), u32(duration),
                             u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
                             MP4_MATRIX, u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(2)]),
      trak
    ]);

    var out = new Uint8Array(ftyp.length + 8 + dataLen + moov.length);
    var at = 0;
    out.set(ftyp, at); at += ftyp.length;
    out.set(u32(dataLen + 8), at); at += 4;
    out.set(mp4Bytes('mdat'), at); at += 4;
    samples.forEach(function (s2) { out.set(s2.data, at); at += s2.data.length; });
    out.set(moov, at);
    return new Blob([out], { type: 'video/mp4' });
  }

  // ¿Puede este navegador codificar H.264 con WebCodecs?
  function pickAvc(width, height, fps) {
    if (typeof VideoEncoder === 'undefined') return Promise.resolve(null);
    var perfiles = ['avc1.42001f', 'avc1.42E01E', 'avc1.4D401F', 'avc1.640028'];
    var i = 0;
    function siguiente() {
      if (i >= perfiles.length) return Promise.resolve(null);
      var codec = perfiles[i++];
      return VideoEncoder.isConfigSupported({
        codec: codec, width: width, height: height, bitrate: 5000000, framerate: fps
      }).then(function (r) {
        return (r && r.supported) ? codec : siguiente();
      }, function () { return siguiente(); });
    }
    return siguiente();
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
        doc = saneaDoc(d); ui.frame = 0; ui.sel = null; ui.multi = [];
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
  function saveBoard() {
    // El nombre que propone es el de la ficha, si la hay: es el que el
    // entrenador ya ha escrito y por el que va a buscarla después.
    ask({ title: 'Guardar pizarra', input: (doc.card && doc.card.titulo || '').trim(),
          placeholder: 'Nombre del ejercicio', ok: 'Guardar' })
      .then(function (name) {
        if (name === null) return;                       // ha cancelado
        if (!name) { toast('Hace falta un nombre para poder encontrarla luego'); return; }
        var all = savedBoards();
        var nueva = !all[name];
        all[name] = { at: Date.now(), doc: doc };
        if (!writeBoards(all)) {
          toast('No cabe en el almacenamiento del navegador: borra alguna pizarra guardada');
          return;
        }
        olvidaMini('mia:' + name);
        toast(nueva ? 'Guardada como «' + name + '»' : '«' + name + '» actualizada');
      });
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
    $('#save').addEventListener('click', saveBoard);
    $('#open').addEventListener('click', openLibrary);
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
    [['#lib-pitch', 'pitch'],
     ['#lib-momento', 'momento'], ['#lib-duracion', 'duracion']].forEach(function (par) {
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
      ['#lib-momento', '#lib-duracion'].forEach(function (id) { $(id).value = ''; });
      $('#lib-pitch').value = libFiltros.pitch;
      pintaBiblioteca();
      cargaNube();
    });

    // ---- Cuenta y biblioteca común ----
    $('#compartir').addEventListener('click', function () { sheetClose(); comparteActual(); });

    if (hayNube) {
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

        var b = this, etiqueta = b.textContent;
        b.disabled = true; b.textContent = modo === 'crear' ? 'Creando…' : 'Entrando…';
        aviso.hidden = true;

        var tarea = modo === 'crear' ? nube.registra(correo, clave, nombre)
                                     : nube.entra(correo, clave);
        tarea.then(function () {
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

      /* Cuando se vuelve del enlace de un correo, la sesión llega en la
         dirección. La nube la recogía y guardaba, pero nadie miraba el
         resultado: el usuario aterrizaba en la pizarra sin que nada le dijera
         si había funcionado. Y en el caso de recuperar la contraseña hay que
         pedirle una nueva ahí mismo, porque ese enlace es su única llave y
         caduca. */
      var regreso = nube.vuelta();
      if (regreso) {
        if (regreso.error) {
          $('#cfg').click();
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
      var cuerpo = $('#dlg-card .dbody');
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
    $('#card-edit').addEventListener('click', function () { sheetClose(); openCard(); });
    $('#f-auto').addEventListener('click', autofillCard);
    $('#f-guardar').addEventListener('click', function () { saveCard(); $('#dlg-card').close(); });
    $('#f-imprimir').addEventListener('click', function () {
      saveCard();
      $('#dlg-card').close();
      setTimeout(printCard, 120);
    });
    // ---- Ajustes ----
    function pintaAjustes() {
      var p = prefs();
      $$('[data-cfg-pitch]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.cfgPitch === p.pitch));
      });
      $('#cfg-categoria').value = p.categoria;
    }
    function abreAjustes() { pintaAjustes(); $('#dlg-cfg').showModal(); }
    $('#cfg').addEventListener('click', abreAjustes);
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
    var TITULOS = { tools: 'Herramientas', trazo: 'Trazo', equipos: 'Equipos y formaciones',
                    material: 'Material', campo: 'Campo', pizarra: 'Pizarra' };

    function sheetOpen(id) {
      current = id;
      var block = document.getElementById(id);
      var grupo = block ? block.dataset.grupo : '';
      aside.dataset.grupo = grupo;
      $('#sheet-tit').textContent = TITULOS[grupo] || '';
      aside.classList.add('open');
      scrim.classList.add('show');
      $$('.tab').forEach(function (t) { t.setAttribute('aria-pressed', String(t.dataset.section === id)); });
      requestAnimationFrame(function () { aside.scrollTop = 0; });
    }
    function sheetClose() {
      current = null;
      aside.classList.remove('open');
      scrim.classList.remove('show');
      $$('.tab').forEach(function (t) { t.setAttribute('aria-pressed', 'false'); });
    }

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        if (current === t.dataset.section) sheetClose();
        else sheetOpen(t.dataset.section);
      });
    });
    scrim.addEventListener('click', sheetClose);
    $('#sheet-grab').addEventListener('click', sheetClose);

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

  function start() {
    wire();
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
  }

  /* Red de seguridad del arranque. Si algo se rompe montando la pizarra, lo
     más probable es que sea lo que había guardado; y como se vuelve a leer en
     cada recarga, la aplicación se quedaría en blanco para siempre sin manera
     de salir salvo borrando los datos del navegador a mano. Así que se tira lo
     guardado y se arranca limpio una vez. Si vuelve a fallar, ya no es eso: se
     deja pasar el error para que se vea en la consola. */
  function arranca() {
    try {
      start();
    } catch (e) {
      try { localStorage.removeItem('pt-autosave'); } catch (e2) {}
      start();
      setTimeout(function () {
        toast('La pizarra que tenías guardada estaba dañada y se ha empezado de cero');
      }, 900);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca);
  else arranca();
})();
