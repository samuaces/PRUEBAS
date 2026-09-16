/* ============================================================================
   Pizarra Táctica · los dos codificadores
   ----------------------------------------------------------------------------
   GIF y MP4, escritos a mano y sin una sola dependencia. Vivían dentro de
   board.js, entre la lógica de fútbol, y no pintaban nada ahí: son 280 líneas
   de manejo de bits que no saben qué es un jugador ni tocan el estado de la
   aplicación. Sacarlos deja board.js más corto y deja esto donde se puede leer
   entero sin pasar por encima de nada más.

   Lo que se saca es SOLO lo puro. «exportGif» y el exportador de vídeo se
   quedan en board.js, porque esos sí leen la pizarra, pintan fotogramas y
   avisan al usuario.

   Superficie pública, cinco nombres:
     medianCut(muestras, maxColores)   la paleta, por corte mediano
     quantize(datos, paleta, caché)    de píxeles a índices de paleta
     GifWriter(w, h, paleta, centis)   el escritor de GIF89a
     buildMp4(w, h, escala, dur, ...)  el contenedor ISO BMFF
     pickAvc(ancho, alto, fps)         qué perfil de H.264 admite el navegador
   ========================================================================= */
(function () {
  'use strict';
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

  window.PTCodecs = {
    medianCut: medianCut,
    quantize: quantize,
    GifWriter: GifWriter,
    buildMp4: buildMp4,
    pickAvc: pickAvc
  };
})();
