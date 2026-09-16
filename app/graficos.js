/* ============================================================================
   Pizarra Táctica · los dibujos de la pantalla de Datos
   ----------------------------------------------------------------------------
   El radar de equilibrio y las barras. Son 270 líneas de dibujo —SVG a mano y
   divs— que no saben nada de la aplicación: se les da una caja y unos números
   y pintan. Vivían dentro de board.js sin ninguna razón para estar ahí.

   El radar leía dos cosas del cierre de board.js: «statsPeriodo», para rotular
   la leyenda, y «toast», para decir los minutos al tocar un eje. Ahora se le
   pasan: «periodo» y «avisa». Un dibujo no tiene por qué saber que la
   aplicación tiene avisos flotantes ni qué periodo se está mirando; se lo dice
   quien lo llama.

   Superficie pública:
     pintaRadar(caja, eq, { periodo, avisa })
     pintaBarras(caja, filas, { total, asistencia, destaca, nombrePct })
   ========================================================================= */
(function () {
  'use strict';
  /* =========================================================================
     El radar de equilibrio (Kiviat)

     Un radar no sirve para leer valores —para eso están las barras de abajo,
     con sus minutos exactos—. Sirve para ver de un golpe la FORMA del reparto:
     si el hexágono está lleno por todos lados o si tiene un pico y tres huecos.

     Dos figuras: lo que llevas en el periodo, en el color de la marca, y la
     temporada entera en gris de fondo, para comparar contra tu propia costumbre.
     Y un hexágono fino en el 16,7 %, que es el reparto exactamente igualado.

     Todo SVG a mano: ni lienzo, ni librería, ni una dependencia más.
     ====================================================================== */
  var NS = 'http://www.w3.org/2000/svg';
  var RADAR_ACENTO = '#E11A41';       // la marca: el periodo que se está mirando
  var RADAR_FONDO  = '#7C8DA3';       // el gris de contexto: la temporada

  function svgEl(nombre, atrs) {
    var e = document.createElementNS(NS, nombre);
    for (var k in atrs) if (Object.prototype.hasOwnProperty.call(atrs, k)) {
      e.setAttribute(k, atrs[k]);
    }
    return e;
  }

  function pintaRadar(caja, eq, op) {
    op = op || {};
    var periodo = op.periodo || 'micro';
    // Tocar un eje dice sus minutos en voz alta. Quien llama pone el cómo:
    // aquí no se sabe que la aplicación tiene avisos flotantes.
    var avisa = op.avisa || function () {};
    caja.textContent = '';
    // Sin minutos de fase no hay figura que dibujar, y un hexágono vacío no
    // dice «equilibrado»: dice «todavía no has apuntado nada». Mejor decirlo.
    if (!eq.total) {
      var p = document.createElement('p');
      p.className = 'block-note';
      p.textContent = 'Cuando guardes ejercicios con su fase de juego —ataque, ' +
                      'defensa, transiciones, finalización o balón parado— aquí verás ' +
                      'si los repartes por igual.';
      caja.appendChild(p);
      return;
    }

    /* El lienzo es más ancho que alto a propósito: los nombres de los ejes van
       FUERA del anillo, y los de los lados son los largos («Balón parado · 0»).
       Si el lienzo fuera cuadrado, esos dos se saldrían por los lados y el
       diálogo se los comería. Aquí se les hace sitio dentro. */
    var ANCHO = 376, ALTO = 246, CX = ANCHO / 2, CY = 118, R = 88, SEPARA = 16;
    var ejes = eq.ejes, n = ejes.length;

    // La escala: el anillo exterior es el mayor valor, con un mínimo del 40 %
    // para que un reparto normal no salga pegado al borde.
    var tope = Math.max(40, eq.igualado);
    ejes.forEach(function (e) {
      if (e.pct > tope) tope = e.pct;
      if (e.refPct > tope) tope = e.refPct;
    });
    tope = Math.ceil(tope / 10) * 10;

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + ANCHO + ' ' + ALTO, class: 'radar',
      role: 'img',
      'aria-label': 'Equilibrio por fase de juego. ' + ejes.map(function (e) {
        return e.nombre + ', ' + Math.round(e.pct) + ' por ciento';
      }).join('. ')
    });

    // El ángulo: el primer eje arriba, y de ahí en el sentido del reloj.
    function punto(i, valor) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      var r = R * Math.min(valor / tope, 1);
      return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    }
    function poligono(valores) {
      return valores.map(function (v, i) { return punto(i, v).join(','); }).join(' ');
    }

    /* Rejilla: solo el anillo de fuera. Los anillos intermedios caían casi
       encima del hexágono del reparto igualado —16,7 % y 20 % están pegados— y
       lo dejaban invisible justo a él, que es la única referencia que importa
       aquí. Dos anillos con dos significados se leen; cuatro, no. */
    svg.appendChild(svgEl('polygon', {
      points: poligono(ejes.map(function () { return tope; })), class: 'radar-anillo'
    }));
    ejes.forEach(function (e, i) {
      var f = punto(i, tope);
      svg.appendChild(svgEl('line', { x1: CX, y1: CY, x2: f[0], y2: f[1], class: 'radar-radio' }));
    });

    // --- el reparto igualado: la figura contra la que se compara todo ---
    svg.appendChild(svgEl('polygon', {
      points: poligono(ejes.map(function () { return eq.igualado; })), class: 'radar-igualado'
    }));

    // --- la temporada, de fondo ---
    if (eq.totalRef) {
      svg.appendChild(svgEl('polygon', {
        points: poligono(ejes.map(function (e) { return e.refPct; })), class: 'radar-ref'
      }));
    }

    // --- el periodo que se está mirando ---
    svg.appendChild(svgEl('polygon', {
      points: poligono(ejes.map(function (e) { return e.pct; })), class: 'radar-ahora'
    }));

    /* Los vértices son además la zona sensible: el círculo que se ve es
       pequeño, pero encima lleva otro invisible y ancho, que es lo que se toca
       con el dedo. */
    ejes.forEach(function (e, i) {
      var v = punto(i, e.pct);
      svg.appendChild(svgEl('circle', { cx: v[0], cy: v[1], r: 3.4, class: 'radar-punto' }));
      var diana = svgEl('circle', { cx: v[0], cy: v[1], r: 16, class: 'radar-diana',
                                    tabindex: '0', role: 'button' });
      var dice = e.nombre + ': ' + e.minutos + ' min · ' + Math.round(e.pct) + '%' +
                 (eq.totalRef ? ' · temporada ' + Math.round(e.refPct) + '%' : '');
      diana.appendChild(svgEl('title', {})).textContent = dice;
      diana.addEventListener('click', function () { avisa(dice); });
      diana.addEventListener('focus', function () { avisa(dice); });
      svg.appendChild(diana);
    });

    // --- los nombres de los ejes, fuera del anillo ---
    ejes.forEach(function (e, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      var x = CX + (R + SEPARA) * Math.cos(a), y = CY + (R + SEPARA) * Math.sin(a);
      var t = svgEl('text', {
        x: x, y: y, class: 'radar-eje' + (e.minutos === 0 ? ' vacio' : ''),
        'text-anchor': Math.abs(Math.cos(a)) < 0.25 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end'),
        'dominant-baseline': 'middle'
      });
      /* Una fase sin tocar se marca escribiéndolo, no pintándolo de otro color:
         el texto lleva tinta de texto y el color queda para la figura. Además,
         un «0» lo lee cualquiera, también quien no distingue el rojo. */
      t.textContent = e.minutos === 0 ? e.corto + ' · 0' : e.corto;
      svg.appendChild(t);
    });

    caja.appendChild(svg);

    // Dos series: la leyenda va siempre, y con su cifra al lado.
    var pie = document.createElement('p');
    pie.className = 'radar-pie';
    function marca(clase, texto) {
      var s = document.createElement('span');
      s.className = 'radar-clave ' + clase;
      s.appendChild(document.createTextNode(texto));
      pie.appendChild(s);
    }
    marca('es-ahora', periodo === 'temporada' ? 'Temporada'
                    : periodo === 'mes' ? 'Este mes' : 'Este microciclo');
    if (eq.totalRef && periodo !== 'temporada') marca('es-ref', 'Toda la temporada');
    marca('es-igual', 'Reparto igualado');
    caja.appendChild(pie);

    var nota = document.createElement('p');
    nota.className = 'block-note';
    nota.textContent = eq.sinTocar
      ? (eq.sinTocar === 1 ? 'Hay una fase sin tocar en este periodo.'
                           : 'Hay ' + eq.sinTocar + ' fases sin tocar en este periodo.') +
        ' El anillo de fuera es el ' + tope + '%.'
      : 'Las seis fases tienen minutos. El anillo de fuera es el ' + tope + '%.';
    caja.appendChild(nota);
  }

  /* Barras con div y CSS. El porcentaje se mide contra el total de minutos del
     periodo; el ancho, contra el mayor de la lista, que es lo que se compara de
     un vistazo. Si midiera el ancho contra el total, con diez filas todas serían
     rayitas y no se distinguiría nada.

     Cada cifra va en una columna de ancho fijo y con su nombre escrito en una
     cabecera. Antes la asistencia salía como un «4/5» en gris entre el nombre y
     los minutos, sin que en ninguna parte pusiera de qué era: una cifra suelta
     que nadie podía leer. Ahora la columna se llama «asistencia» y punto.

     opciones: { total, asistencia, destaca }
       total       minutos contra los que se saca el porcentaje
       nombrePct   cómo se llama esa columna («del total» si no se dice)
       asistencia  true en la lista de jugadores: cambia el % por «vino/de»
       destaca     pinta la primera fila con el color de la marca             */
  var POCO = 0.5;                 // venir a menos de la mitad es lo que se avisa

  function pintaBarras(caja, filas, op) {
    op = op || {};
    caja.textContent = '';
    var mayor = 0;
    filas.forEach(function (f) { if (f.minutos > mayor) mayor = f.minutos; });
    if (filas.length) caja.appendChild(cabeceraBarras(op.asistencia, op.nombrePct));

    filas.forEach(function (f, i) {
      var row = document.createElement('div');
      row.className = 'barra' + (op.destaca && i === 0 && f.minutos > 0 ? ' top' : '') +
                                (op.asistencia ? ' conses' : '');

      var pista = document.createElement('div');
      pista.className = 'barra-pista';
      var rell = document.createElement('div');
      rell.className = 'barra-relleno';
      rell.style.width = (mayor > 0 ? Math.round(f.minutos / mayor * 100) : 0) + '%';
      pista.appendChild(rell);
      row.appendChild(pista);

      if (f.dorsal !== undefined) {
        var dor = document.createElement('span');
        dor.className = 'barra-dorsal';
        dor.textContent = f.dorsal || '';
        row.appendChild(dor);
      }

      var nom = document.createElement('span');
      nom.className = 'barra-nombre';
      nom.textContent = f.nombre + (f.fuera ? ' (ya no está)' : '');
      row.appendChild(nom);

      var cif = document.createElement('span');
      cif.className = 'barra-cifra';
      cif.textContent = String(f.minutos);
      row.appendChild(cif);

      if (op.asistencia) {
        var poco = f.deSesiones > 0 && f.sesiones < f.deSesiones * POCO;
        var asis = document.createElement('span');
        asis.className = 'barra-asis' + (poco ? ' poco' : '');
        asis.textContent = f.deSesiones ? f.sesiones + '/' + f.deSesiones : '—';
        asis.title = f.deSesiones
          ? 'Ha venido a ' + f.sesiones + ' de ' + f.deSesiones + ' entrenamientos'
          : 'En este periodo no has apuntado ningún entrenamiento';
        row.appendChild(asis);

        // El aviso no puede ser solo el color: quien no lo distingue se queda
        // sin el dato. La marca ocupa su hueco en todas las filas, tenga o no
        // aviso, para que las columnas no bailen de una fila a otra.
        var al = document.createElement('span');
        al.className = 'barra-alerta';
        al.textContent = poco ? '⚠' : '';
        if (poco) al.title = 'Ha venido a menos de la mitad';
        row.appendChild(al);
      } else {
        var pct = document.createElement('span');
        pct.className = 'barra-pct';
        pct.textContent = op.total > 0 ? Math.round(f.minutos / op.total * 100) + '%' : '—';
        row.appendChild(pct);
      }

      caja.appendChild(row);
    });
  }

  function cabeceraBarras(conAsistencia, nombrePct) {
    var h = document.createElement('div');
    h.className = 'barra-cab' + (conAsistencia ? ' conses' : '');
    var hueco = document.createElement('span');
    hueco.className = 'barra-nombre';
    h.appendChild(hueco);

    var min = document.createElement('span');
    min.className = 'barra-cifra';
    min.textContent = 'minutos';
    h.appendChild(min);

    var otra = document.createElement('span');
    otra.className = conAsistencia ? 'barra-asis' : 'barra-pct';
    // «del total» sería mentira en el reparto por momentos: ahí el porcentaje
    // se saca contra los minutos etiquetados, no contra todo lo entrenado.
    otra.textContent = conAsistencia ? 'asistencia' : (nombrePct || 'del total');
    h.appendChild(otra);

    if (conAsistencia) {
      var al = document.createElement('span');
      al.className = 'barra-alerta';
      h.appendChild(al);
    }
    return h;
  }


  window.PTGraficos = {
    pintaRadar: pintaRadar,
    pintaBarras: pintaBarras,
    /* «Venir a menos de la mitad» no lo usa solo la barra para pintar su aviso:
       board.js cuenta con ello para escribir a cuánta gente avisa el símbolo.
       Es el mismo umbral, así que se comparte en vez de escribirlo dos veces y
       arriesgarse a que un día digan cosas distintas. */
    POCO: POCO
  };
})();
