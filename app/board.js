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

  var PITCH = { L: 105, W: 68 };           // metros reglamentarios

  var VIEWS = {
    full:  { x0: -5,  y0: -5, x1: 110,  y1: 73, lines: true },
    half:  { x0: -5,  y0: -5, x1: 57.5, y1: 73, lines: true },
    blank: { x0: -5,  y0: -5, x1: 110,  y1: 73, lines: false }
  };

  var TEAM = { home: '#E03B2F', away: '#2E86DE', neutral: '#F1C40F' };

  // Geometría de cada tipo de objeto, en metros.
  // Como en cualquier pizarra táctica, las piezas se dibujan algo más grandes que
  // en la realidad: si no, un cono junto a una ficha de jugador sería invisible.
  var KIND = {
    player:   { r: 1.45,               rot: false, label: 'Jugador' },
    ball:     { r: 0.85,               rot: false, label: 'Balón' },
    cone:     { r: 0.95,               rot: false, label: 'Cono' },
    disc:     { r: 1.00,               rot: false, label: 'Plato' },
    goal:     { w: 7.32, h: 2.0,       rot: true,  label: 'Portería' },
    minigoal: { w: 4.5,  h: 1.8,       rot: true,  label: 'Portería pequeña' },
    hurdle:   { w: 2.2,  h: 1.1,       rot: true,  label: 'Valla' },
    ladder:   { w: 7.0,  h: 1.6,       rot: true,  label: 'Escalera' },
    pole:     { r: 0.75,               rot: false, label: 'Pica' },
    dummy:    { w: 1.4,  h: 2.1,       rot: true,  label: 'Maniquí' },
    ring:     { r: 1.2,                rot: false, label: 'Aro' },
    flag:     { r: 1.00,               rot: false, label: 'Banderín' },
    text:     { r: 1.2,                rot: false, label: 'Texto' }
  };

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

  var doc = { view: 'full', frames: [emptyFrame()] };

  var ui = {
    frame: 0,
    tool: 'select',          // select | pass | run | dribble | free | zone | eraser | place
    place: null,             // { kind, team }
    color: '#FFFFFF',
    width: 0.32,             // grosor del trazo en metros
    snap: false,
    sel: null,               // id del objeto seleccionado
    playing: false,
    speed: 1,
    loop: false
  };

  var hist = [], hi = -1;

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
    ui.sel = null;
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

  var autosaveTimer;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      try { localStorage.setItem('pt-autosave', JSON.stringify(doc)); } catch (e) {}
    }, 400);
  }

  /* =========================================================================
     3. Vista y transformación
     ====================================================================== */

  var canvas = $('#board'), ctx = canvas.getContext('2d');
  var T = { s: 1, ox: 0, oy: 0 };   // metros -> píxeles CSS
  var CW = 0, CH = 0;

  function transformFor(w, h, view) {
    var vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    var s = Math.min(w / vw, h / vh);
    return { s: s, ox: (w - vw * s) / 2 - view.x0 * s, oy: (h - vh * s) / 2 - view.y0 * s };
  }
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
    var r = canvas.parentNode.getBoundingClientRect();
    var pad = 10;
    CW = Math.max(240, r.width - pad * 2);
    CH = Math.max(200, r.height - pad * 2);
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';
    canvas.width = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // En pantallas verticales giramos el campo 90°: aprovecha mucho mejor el móvil.
    var view = VIEWS[doc.view];
    var rot = CW < CH && (view.x1 - view.x0) > (view.y1 - view.y0);
    T = rot ? transformFor(CH, CW, view) : transformFor(CW, CH, view);
    T.rot = rot;
    draw();
  }

  /* =========================================================================
     4. Campo
     ====================================================================== */

  function drawPitch(c, t, view) {
    var u = t.s;
    // fondo exterior
    c.fillStyle = '#0A3D24';
    c.fillRect(t.ox + view.x0 * u, t.oy + view.y0 * u, (view.x1 - view.x0) * u, (view.y1 - view.y0) * u);

    // césped con franjas de siega
    var bands = 12, bw = PITCH.L / bands;
    for (var i = 0; i < bands; i++) {
      c.fillStyle = i % 2 ? '#127A46' : '#0F6E3F';
      c.fillRect(t.ox + i * bw * u, t.oy, bw * u + 1, PITCH.W * u);
    }
    // viñeta suave
    var g = c.createRadialGradient(
      t.ox + PITCH.L / 2 * u, t.oy + PITCH.W / 2 * u, PITCH.W * 0.25 * u,
      t.ox + PITCH.L / 2 * u, t.oy + PITCH.W / 2 * u, PITCH.L * 0.72 * u);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.26)');
    c.fillStyle = g;
    c.fillRect(t.ox + view.x0 * u, t.oy + view.y0 * u, (view.x1 - view.x0) * u, (view.y1 - view.y0) * u);

    if (!view.lines) return;

    c.save();
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = Math.max(1.2, 0.14 * u);
    c.lineJoin = 'round';

    function rect(x, y, w, h) { c.strokeRect(t.ox + x * u, t.oy + y * u, w * u, h * u); }
    function line(x1, y1, x2, y2) {
      c.beginPath(); c.moveTo(t.ox + x1 * u, t.oy + y1 * u); c.lineTo(t.ox + x2 * u, t.oy + y2 * u); c.stroke();
    }
    function arc(cx, cy, r, a1, a2) {
      c.beginPath(); c.arc(t.ox + cx * u, t.oy + cy * u, r * u, a1, a2); c.stroke();
    }
    function dot(cx, cy, r) {
      c.beginPath(); c.arc(t.ox + cx * u, t.oy + cy * u, r * u, 0, 7); c.fillStyle = 'rgba(255,255,255,.9)'; c.fill();
    }

    rect(0, 0, PITCH.L, PITCH.W);
    line(52.5, 0, 52.5, PITCH.W);
    arc(52.5, 34, 9.15, 0, Math.PI * 2);
    dot(52.5, 34, 0.16);

    // áreas y arcos de penalti
    [0, 1].forEach(function (side) {
      var sx = side ? PITCH.L : 0, dir = side ? -1 : 1;
      rect(side ? PITCH.L - 16.5 : 0, 13.84, 16.5, 40.32);
      rect(side ? PITCH.L - 5.5 : 0, 24.84, 5.5, 18.32);
      dot(sx + dir * 11, 34, 0.16);
      // arco de penalti: solo el tramo que queda fuera del área
      var a = Math.acos(5.5 / 9.15);
      arc(sx + dir * 11, 34, 9.15,
          side ? Math.PI - a : -a,
          side ? Math.PI + a : a);
      // porterías
      c.save();
      c.lineWidth = Math.max(1.6, 0.2 * u);
      c.strokeStyle = 'rgba(255,255,255,.95)';
      c.strokeRect(t.ox + (side ? PITCH.L : -2) * u, t.oy + 30.34 * u, 2 * u, 7.32 * u);
      c.restore();
    });

    // córners
    arc(0, 0, 1, 0, Math.PI / 2);
    arc(PITCH.L, 0, 1, Math.PI / 2, Math.PI);
    arc(PITCH.L, PITCH.W, 1, Math.PI, Math.PI * 1.5);
    arc(0, PITCH.W, 1, Math.PI * 1.5, Math.PI * 2);

    c.restore();
  }

  /* =========================================================================
     5. Objetos y materiales
     ====================================================================== */

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
      case 'ball':     drawBall(c, u); break;
      case 'cone':     drawCone(c, u, o); break;
      case 'disc':     drawDisc(c, u, o); break;
      case 'goal':     drawGoal(c, u, KIND.goal.w, KIND.goal.h); break;
      case 'minigoal': drawGoal(c, u, KIND.minigoal.w, KIND.minigoal.h); break;
      case 'hurdle':   drawHurdle(c, u, o); break;
      case 'ladder':   drawLadder(c, u, o); break;
      case 'pole':     drawPole(c, u, o); break;
      case 'dummy':    drawDummy(c, u); break;
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
    var u = t.s, r = KIND.player.r * u, col = objColor(o);
    shadow(c, u, KIND.player.r * 0.95, 0.75, 0.35);
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

  function drawBall(c, u) {
    var r = KIND.ball.r * u;
    shadow(c, u, KIND.ball.r, 0.4, 0.4);
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
    c.beginPath();
    c.moveTo(-s * 0.55, s * 0.12); c.quadraticCurveTo(-s * 0.2, -s * 1.35, 0, -s * 1.5);
    c.quadraticCurveTo(s * 0.2, -s * 1.35, s * 0.55, s * 0.12);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.fillRect(-s * 0.36, -s * 0.72, s * 0.72, s * 0.2);
  }

  function drawDisc(c, u, o) {
    var r = KIND.disc.r * u, col = o.color || '#F1C40F';
    c.fillStyle = shade(col, -0.15);
    c.beginPath(); c.ellipse(0, 0, r, r * 0.42, 0, 0, 7); c.fill();
    c.fillStyle = shade(col, 0.25);
    c.beginPath(); c.ellipse(0, -r * 0.06, r * 0.62, r * 0.26, 0, 0, 7); c.fill();
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

  function drawHurdle(c, u, o) {
    var w = KIND.hurdle.w * u, h = KIND.hurdle.h * u, col = o.color || '#F1C40F';
    shadow(c, u, KIND.hurdle.w * 0.5, 0.4, 0.32);
    c.fillStyle = '#243244';
    c.fillRect(-w / 2, -h / 2, w * 0.12, h);
    c.fillRect(w / 2 - w * 0.12, -h / 2, w * 0.12, h);
    c.fillStyle = col;
    roundRect(c, -w / 2, -h * 0.19, w, h * 0.38, h * 0.16); c.fill();
    c.fillStyle = 'rgba(0,0,0,.35)';
    for (var i = 0; i < 4; i++) c.fillRect(-w / 2 + w * (0.14 + i * 0.2), -h * 0.19, w * 0.07, h * 0.38);
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

  function drawPole(c, u, o) {
    var r = KIND.pole.r * u, col = o.color || '#E03B2F';
    shadow(c, u, KIND.pole.r * 1.1, 0.3, 0.35);
    c.fillStyle = '#26364A';
    c.beginPath(); c.arc(0, 0, r * 1.35, 0, 7); c.fill();
    c.fillStyle = col;
    c.beginPath(); c.arc(0, 0, r * 0.8, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.beginPath(); c.arc(-r * 0.22, -r * 0.22, r * 0.24, 0, 7); c.fill();
  }

  function drawDummy(c, u) {
    var w = KIND.dummy.w * u, h = KIND.dummy.h * u;
    shadow(c, u, KIND.dummy.w * 0.8, 0.5, 0.36);
    c.fillStyle = '#2C3E56';
    roundRect(c, -w / 2, -h / 2, w, h, w * 0.45); c.fill();
    c.fillStyle = '#4A6482';
    c.beginPath(); c.arc(0, -h * 0.26, w * 0.34, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.lineWidth = Math.max(1, u * 0.05);
    c.beginPath(); c.moveTo(-w * 0.3, h * 0.06); c.lineTo(w * 0.3, h * 0.06); c.stroke();
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
    var u = t.s, fs = Math.max(11, 1.5 * u);
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

  /* =========================================================================
     7. Render
     ====================================================================== */

  var anim = null;   // estado de reproducción

  function draw() {
    var view = VIEWS[doc.view];
    ctx.clearRect(0, 0, CW, CH);
    ctx.save();
    if (T.rot) { ctx.translate(CW, 0); ctx.rotate(Math.PI / 2); }
    drawPitch(ctx, T, view);

    if (anim) { drawAnimated(); ctx.restore(); return; }

    var f = frame();
    f.strokes.forEach(function (s) { if (s.tool === 'zone') drawStroke(ctx, T, s); });
    f.objects.forEach(function (o) { if (o.kind !== 'player' && o.kind !== 'ball' && o.kind !== 'text') drawObject(ctx, T, o); });
    f.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStroke(ctx, T, s); });
    f.objects.forEach(function (o) { if (o.kind === 'player' || o.kind === 'ball' || o.kind === 'text') drawObject(ctx, T, o); });

    if (drawing) drawStroke(ctx, T, drawing);
    if (ui.sel) drawSelection(ctx, T, byId(ui.sel));
    ctx.restore();
  }

  function drawSelection(c, t, o) {
    if (!o) return;
    var k = KIND[o.kind], u = t.s;
    var X = o.x * u + t.ox, Y = o.y * u + t.oy;
    c.save();
    c.translate(X, Y);
    c.strokeStyle = '#00E27E';
    c.lineWidth = 2;
    c.setLineDash([5, 4]);
    if (k.r) {
      c.beginPath(); c.arc(0, 0, k.r * u + 6, 0, 7); c.stroke();
    } else {
      c.rotate((o.rot || 0) * Math.PI / 180);
      c.strokeRect(-k.w * u / 2 - 5, -k.h * u / 2 - 5, k.w * u + 10, k.h * u + 10);
      c.setLineDash([]);
      // tirador de rotación
      c.beginPath(); c.moveTo(0, -k.h * u / 2 - 5); c.lineTo(0, -k.h * u / 2 - 24); c.stroke();
      c.fillStyle = '#00E27E';
      c.beginPath(); c.arc(0, -k.h * u / 2 - 28, 6, 0, 7); c.fill();
    }
    c.restore();
  }

  function rotateHandlePos(o) {
    var k = KIND[o.kind];
    if (!k || k.r) return null;
    var a = (o.rot || 0) * Math.PI / 180;
    var d = (k.h * T.s / 2 + 28) / T.s;   // en metros, para reutilizar toScreen
    return toScreen(o.x + Math.sin(a) * d, o.y - Math.cos(a) * d);
  }

  /* =========================================================================
     8. Interacción con el puntero
     ====================================================================== */

  var drawing = null, drag = null;

  function byId(id) {
    var a = frame().objects;
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  function hitObject(m) {
    var a = frame().objects;
    for (var i = a.length - 1; i >= 0; i--) {
      var o = a[i], k = KIND[o.kind];
      if (k.r) {
        if (Math.hypot(m.x - o.x, m.y - o.y) <= k.r + 0.35) return o;
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
          if (Math.hypot(e.clientX - r.left - h.x, e.clientY - r.top - h.y) < 16) {
            drag = { mode: 'rotate', o: sel };
            return;
          }
        }
      }
      var hit = hitObject(m);
      if (hit) {
        ui.sel = hit.id;
        drag = { mode: 'move', o: hit, dx: hit.x - m.x, dy: hit.y - m.y, moved: false };
        showInspector(hit);
      } else {
        ui.sel = null;
        hideInspector();
      }
      draw();
      return;
    }

    // herramientas de dibujo
    drawing = { id: uid(), tool: ui.tool, color: ui.color, width: ui.width, pts: [{ x: m.x, y: m.y }] };
    if (ui.tool === 'zone') drawing.pts.push({ x: m.x, y: m.y });
    draw();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (ui.playing) return;
    var m = pointer(e);

    if (drag) {
      if (drag.mode === 'move') {
        drag.o.x = clamp(snap(m.x + drag.dx), -6, PITCH.L + 6);
        drag.o.y = clamp(snap(m.y + drag.dy), -6, PITCH.W + 6);
        drag.moved = true;
        moveInspector(drag.o);
      } else {
        var a = Math.atan2(m.x - drag.o.x, -(m.y - drag.o.y)) * 180 / Math.PI;
        drag.o.rot = ui.snap ? Math.round(a / 15) * 15 : Math.round(a);
        drag.moved = true;
      }
      draw();
      return;
    }

    if (drawing) {
      if (drawing.tool === 'zone') {
        drawing.pts[1] = { x: m.x, y: m.y };
      } else {
        var last = drawing.pts[drawing.pts.length - 1];
        if (Math.hypot(m.x - last.x, m.y - last.y) > 0.35) drawing.pts.push({ x: m.x, y: m.y });
      }
      draw();
    }
  });

  function endPointer() {
    if (drag) {
      if (drag.moved) commit();
      drag = null;
    }
    if (drawing) {
      var ok = drawing.tool === 'zone'
        ? Math.abs(drawing.pts[1].x - drawing.pts[0].x) > 1 && Math.abs(drawing.pts[1].y - drawing.pts[0].y) > 1
        : drawing.pts.length > 1;
      if (ok) { frame().strokes.push(drawing); commit(); }
      drawing = null;
      draw();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('dblclick', function (e) {
    var o = hitObject(pointer(e));
    if (o && o.kind === 'text') {
      var t = prompt('Texto:', o.text || '');
      if (t !== null) { o.text = t; commit(); draw(); }
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
      var t = prompt('Texto a colocar:', 'Presión alta');
      if (t === null) return;
      o.text = t;
      o.color = ui.color;
    } else if (spec.kind !== 'ball' && spec.kind !== 'goal' && spec.kind !== 'minigoal' && spec.kind !== 'dummy') {
      o.color = spec.color || null;
    }
    if (spec.kind === 'goal' || spec.kind === 'minigoal') o.rot = 0;
    frame().objects.push(o);
    ui.sel = o.id;
    showInspector(o);
    commit();
    draw();
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
    if (ui.sel === o.id) { ui.sel = null; hideInspector(); }
    commit(); draw();
  }

  /* --- inspector flotante --- */
  var insp = $('#inspector');

  function showInspector(o) {
    var k = KIND[o.kind];
    var html = '<span class="name">' + k.label + '</span><span class="div"></span>';

    if (o.kind === 'player') {
      html += '<input type="text" class="num" id="i-num" value="' + (o.num == null ? '' : o.num) + '" aria-label="Dorsal" maxlength="2">';
      html += '<input type="text" id="i-name" value="' + (o.name || '').replace(/"/g, '&quot;') + '" placeholder="Nombre" aria-label="Nombre">';
      html += '<span class="div"></span><span class="mini-sw">';
      ['home', 'away', 'neutral'].forEach(function (t) {
        html += '<button data-team="' + t + '" style="background:' + TEAM[t] + '" aria-label="Equipo ' + t + '" aria-pressed="' + (o.team === t) + '"></button>';
      });
      html += '</span>';
    } else if (o.kind === 'text') {
      html += '<input type="text" id="i-text" value="' + (o.text || '').replace(/"/g, '&quot;') + '" aria-label="Texto">';
    }

    if (k.rot) {
      html += '<span class="div"></span>' +
        '<button class="ibtn" data-rot="-15" aria-label="Girar a la izquierda">' + icon('rotL') + '</button>' +
        '<button class="ibtn" data-rot="15" aria-label="Girar a la derecha">' + icon('rotR') + '</button>' +
        '<button class="ibtn" data-rot="90" aria-label="Girar 90 grados">90°</button>';
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
        o.rot = ((o.rot || 0) + parseInt(b.dataset.rot, 10) + 360) % 360;
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
    if (tool !== 'select') { ui.sel = null; hideInspector(); }
    $$('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === tool && !place); });
    $$('[data-place]').forEach(function (b) {
      b.setAttribute('aria-pressed', !!(place && b.dataset.place === place.kind && (!place.team || b.dataset.team === place.team)));
    });
    canvas.className = tool === 'select' ? 'is-select' : '';
    if (place) hint('Toca el campo para colocar <b>' + (KIND[place.kind].label) + '</b> · Esc para salir');
    else if (tool !== 'select') hint('Arrastra sobre el campo para dibujar');
    else hint('');
    draw();
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
    var pos = FORMATIONS[name], nums = NUMBERS[name];
    if (!pos) return;
    var f = frame();
    f.objects = f.objects.filter(function (o) { return !(o.kind === 'player' && o.team === team); });
    pos.forEach(function (p, i) {
      f.objects.push({
        id: uid(), kind: 'player', team: team,
        x: team === 'home' ? p[0] : PITCH.L - p[0],
        y: team === 'home' ? p[1] : PITCH.W - p[1],
        num: nums[i], rot: 0
      });
    });
    ui.sel = null; hideInspector();
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
    ui.sel = null; hideInspector();
    buildFrames(); draw();
  }
  function addFrame() {
    stop();
    doc.frames.splice(ui.frame + 1, 0, clone(frame()));
    ui.frame++;
    ui.sel = null; hideInspector();
    commit(); buildFrames(); draw();
    toast('Fotograma ' + (ui.frame + 1) + ' añadido — mueve las fichas y pulsa reproducir');
  }
  function delFrame() {
    if (doc.frames.length < 2) return;
    stop();
    doc.frames.splice(ui.frame, 1);
    ui.frame = clamp(ui.frame, 0, doc.frames.length - 1);
    ui.sel = null; hideInspector();
    commit(); buildFrames(); draw();
  }

  function play() {
    if (doc.frames.length < 2) return;
    ui.playing = true;
    ui.sel = null; hideInspector();
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
    var t = (now - anim.t0) / d;
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
    var A = doc.frames[anim.seg], B = doc.frames[anim.seg + 1] || A;
    var e = ease(clamp(anim.t || 0, 0, 1));

    // zonas y trazos: fundido cruzado
    A.strokes.forEach(function (s) { if (s.tool === 'zone') drawStroke(ctx, T, s, 1 - e); });
    B.strokes.forEach(function (s) { if (s.tool === 'zone') drawStroke(ctx, T, s, e); });

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
    ctx.save();
    ctx.lineCap = 'round';
    list.forEach(function (it) {
      if (!it.from || it.o.kind !== 'player' && it.o.kind !== 'ball') return;
      if (Math.hypot(it.o.x - it.from.x, it.o.y - it.from.y) < 0.6) return;
      ctx.strokeStyle = it.o.kind === 'ball' ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.22)';
      ctx.lineWidth = Math.max(2, T.s * 0.22);
      ctx.beginPath();
      ctx.moveTo(it.from.x * T.s + T.ox, it.from.y * T.s + T.oy);
      ctx.lineTo(it.o.x * T.s + T.ox, it.o.y * T.s + T.oy);
      ctx.stroke();
    });
    ctx.restore();

    list.forEach(function (it) { if (it.o.kind !== 'player' && it.o.kind !== 'ball' && it.o.kind !== 'text') drawObject(ctx, T, it.o, it.alpha); });
    A.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStroke(ctx, T, s, 1 - e); });
    B.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStroke(ctx, T, s, e); });
    list.forEach(function (it) { if (it.o.kind === 'player' || it.o.kind === 'ball' || it.o.kind === 'text') drawObject(ctx, T, it.o, it.alpha); });
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

  function exportPNG() {
    var view = VIEWS[doc.view];
    var vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    var W = 2400, H = Math.round(W * vh / vw);
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var t = transformFor(W, H, view);
    var keepAnim = anim; anim = null;
    drawPitch(c, t, view);
    var f = frame();
    f.strokes.forEach(function (s) { if (s.tool === 'zone') drawStrokeOn(c, t, s); });
    f.objects.forEach(function (o) { if (o.kind !== 'player' && o.kind !== 'ball' && o.kind !== 'text') drawObjectOn(c, t, o); });
    f.strokes.forEach(function (s) { if (s.tool !== 'zone') drawStrokeOn(c, t, s); });
    f.objects.forEach(function (o) { if (o.kind === 'player' || o.kind === 'ball' || o.kind === 'text') drawObjectOn(c, t, o); });
    anim = keepAnim;
    cv.toBlob(function (b) { download(b, 'pizarra-tactica-' + (ui.frame + 1) + '.png'); });
  }

  // Variantes que aceptan una transformación distinta a la de pantalla.
  function drawObjectOn(c, t, o) {
    var saveT = T; T = t; drawObject(c, t, o); T = saveT;
  }
  function drawStrokeOn(c, t, s) { drawStroke(c, t, s); }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportJSON() {
    download(new Blob([JSON.stringify(doc)], { type: 'application/json' }), 'pizarra-tactica.json');
  }

  function importJSON(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (!d.frames || !d.frames.length) throw 0;
        doc = d; ui.frame = 0; ui.sel = null;
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
    var name = prompt('Nombre de la pizarra:', 'Salida de balón');
    if (!name) return;
    var all = savedBoards();
    all[name] = { at: Date.now(), doc: doc };
    if (writeBoards(all)) toast('Guardada como «' + name + '»');
    else toast('No se ha podido guardar (almacenamiento lleno)');
  }
  function openDialog() {
    var all = savedBoards(), box = $('#saved-list');
    var names = Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; });
    if (!names.length) {
      box.innerHTML = '<p class="empty">Todavía no has guardado ninguna pizarra.</p>';
    } else {
      box.innerHTML = '';
      names.forEach(function (n) {
        var row = document.createElement('div');
        row.className = 'saved-item';
        var d = new Date(all[n].at);
        row.innerHTML = '<span>' + n + '<br><small>' + d.toLocaleDateString('es-ES') + ' · ' +
          all[n].doc.frames.length + ' fotograma(s)</small></span>';
        var load = document.createElement('button');
        load.className = 'tbtn'; load.textContent = 'Abrir';
        load.addEventListener('click', function () {
          doc = clone(all[n].doc); ui.frame = 0; ui.sel = null;
          syncViewButtons(); buildFrames(); hideInspector(); commit(); resize();
          $('#dlg-open').close(); toast('«' + n + '» abierta');
        });
        var del = document.createElement('button');
        del.className = 'tbtn'; del.textContent = 'Borrar';
        del.addEventListener('click', function () {
          var a = savedBoards(); delete a[n]; writeBoards(a); openDialog();
        });
        row.appendChild(load); row.appendChild(del);
        box.appendChild(row);
      });
    }
    $('#dlg-open').showModal();
  }

  function syncViewButtons() {
    $$('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === doc.view); });
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

    $('#snap').addEventListener('change', function () { ui.snap = this.checked; });
    $('#undo').addEventListener('click', undo);
    $('#redo').addEventListener('click', redo);

    $('#form-home').addEventListener('change', function () { if (this.value) { applyFormation(this.value, 'home'); this.value = ''; } });
    $('#form-away').addEventListener('change', function () { if (this.value) { applyFormation(this.value, 'away'); this.value = ''; } });

    $('#clear').addEventListener('click', function () {
      if (!confirm('¿Vaciar este fotograma? Se quitan las fichas y los trazos.')) return;
      doc.frames[ui.frame] = emptyFrame();
      ui.sel = null; hideInspector(); commit(); draw();
    });
    $('#reset').addEventListener('click', function () {
      if (!confirm('¿Empezar una pizarra nueva? Se pierde lo que no hayas guardado.')) return;
      doc = { view: doc.view, frames: [emptyFrame()] };
      ui.frame = 0; ui.sel = null; hideInspector();
      commit(); buildFrames(); draw();
    });

    $('#play').addEventListener('click', function () { ui.playing ? stop() : play(); });
    $('#addframe').addEventListener('click', addFrame);
    $('#delframe').addEventListener('click', delFrame);
    $('#loop').addEventListener('change', function () { ui.loop = this.checked; });
    $('#speed').addEventListener('input', function () {
      ui.speed = parseFloat(this.value);
      $('#speed-val').textContent = ui.speed.toFixed(1) + '×';
    });

    $('#png').addEventListener('click', exportPNG);
    $('#save').addEventListener('click', saveBoard);
    $('#open').addEventListener('click', openDialog);
    $('#json').addEventListener('click', exportJSON);
    $('#import').addEventListener('change', function () { if (this.files[0]) importJSON(this.files[0]); this.value = ''; });
    $('#help').addEventListener('click', function () { $('#dlg-help').showModal(); });
    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });

    var aside = $('#aside'), scrim = $('#scrim');
    $('#menu').addEventListener('click', function () {
      var open = aside.classList.toggle('open');
      scrim.classList.toggle('show', open);
      this.setAttribute('aria-expanded', String(open));
    });
    scrim.addEventListener('click', function () {
      aside.classList.remove('open'); scrim.classList.remove('show');
      $('#menu').setAttribute('aria-expanded', 'false');
    });
    // en móvil, elegir herramienta cierra el panel
    aside.addEventListener('click', function (e) {
      if (window.innerWidth <= 900 && e.target.closest('[data-tool],[data-place]')) {
        aside.classList.remove('open'); scrim.classList.remove('show');
      }
    });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (k === 'escape') { setTool('select'); return; }
      if (k === ' ') { e.preventDefault(); ui.playing ? stop() : play(); return; }
      if (k === 'delete' || k === 'backspace') {
        if (ui.sel) { e.preventDefault(); removeObject(byId(ui.sel)); }
        return;
      }
      var map = { v: 'select', a: 'pass', s: 'run', d: 'dribble', f: 'free', z: 'zone', e: 'eraser' };
      if (map[k]) { setTool(map[k]); }
    });

    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentNode);
  }

  /* =========================================================================
     Arranque
     ====================================================================== */

  function seed() {
    // Una disposición inicial para que la pizarra no aparezca vacía.
    var f = frame();
    FORMATIONS['4-3-3'].forEach(function (p, i) {
      f.objects.push({ id: uid(), kind: 'player', team: 'home', x: p[0], y: p[1], num: NUMBERS['4-3-3'][i], rot: 0 });
    });
    f.objects.push({ id: uid(), kind: 'ball', x: 28, y: 34, rot: 0 });
  }

  function start() {
    wire();
    var saved = null;
    try { saved = localStorage.getItem('pt-autosave'); } catch (e) {}
    if (saved) {
      try {
        var d = JSON.parse(saved);
        if (d && d.frames && d.frames.length) doc = d;
      } catch (e) {}
    }
    if (!doc.frames[0].objects.length && doc.frames.length === 1) seed();
    syncViewButtons();
    buildFrames();
    commit();
    hi = 0; hist = [JSON.stringify(doc)];
    refreshHistoryButtons();
    resize();
    setTool('select');
    setTimeout(function () { hint('Arrastra las fichas · pulsa <b>+</b> en la línea de tiempo y mueve la jugada para animarla'); }, 700);
    setTimeout(function () { hint(''); }, 7000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
