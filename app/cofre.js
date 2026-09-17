/* =============================================================================
   El cofre · cifrado de extremo a extremo

   Lo que hay aquí es lo que permite que tu plantilla esté en el móvil y en el
   ordenador sin que ni este proyecto ni Supabase puedan leerla. Se cifra EN EL
   DISPOSITIVO, antes de salir; el servidor guarda un bloque que no significa
   nada sin tu contraseña.

   No es una precaución exagerada ni un alarde: es que la lista de tu equipo es
   tuya y no hay ninguna razón para que la pueda leer nadie más, ni siquiera
   quien opera el servidor. Cifrarla cuesta unas líneas y quita el problema de
   encima para siempre.

   ---------------------------------------------------------------------------
   POR QUÉ DOS CLAVES Y NO UNA

   Lo evidente sería sacar una clave de la contraseña y cifrar con ella. Se hace
   una vez y funciona… hasta que alguien cambia la contraseña: entonces habría
   que descifrar y volver a cifrar TODO, y si eso se corta a la mitad —se cae la
   red, se cierra la pestaña— la temporada se queda ilegible.

   Así que hay dos:

     LA CLAVE MAESTRA (MK) es aleatoria, se crea una sola vez y es la que cifra
     los datos de verdad. No sale nunca en claro de este archivo.

     LA CLAVE DE LA CONTRASEÑA (KEK) sale de la contraseña con PBKDF2 y solo
     sirve para envolver a la maestra.

   Cambiar la contraseña es volver a envolver la maestra: unos bytes. Los datos
   ni se tocan. Y es lo que hace posible lo del párrafo siguiente.

   ---------------------------------------------------------------------------
   QUÉ PASA SI SE OLVIDA LA CONTRASEÑA

   Sin rodeos: recuperar la contraseña por correo NO recupera los datos. Eso
   cambia la credencial de entrada, pero la clave que abre el cofre salía de la
   contraseña vieja. Quien diga lo contrario está diciendo que el servidor puede
   leer tus datos.

   Lo que sí se puede, y es lo que hace esta aplicación: cada dispositivo donde
   ya has entrado guarda la clave maestra. Si olvidas la contraseña y pones una
   nueva, cualquiera de esos dispositivos ve que el cofre está cerrado con la
   llave vieja, lo vuelve a envolver con la nueva y sigues. Solo se pierde si
   olvidas la contraseña Y no te queda ningún dispositivo abierto.

   Eso hay que decirlo en la pantalla, no aquí.

   ---------------------------------------------------------------------------
   LAS DECISIONES DE CRIPTOGRAFÍA, Y POR QUÉ

   PBKDF2-HMAC-SHA256 con 310.000 vueltas. No es lo más moderno —Argon2id lo
   es—, pero Argon2 no viene en el navegador y meter una librería rompería la
   regla de no tener dependencias y engordaría lo que hay que descargar sin red.
   310.000 es lo que recomienda OWASP para PBKDF2-SHA256.

   AES-GCM de 256 bits. Cifra y autentica a la vez: si alguien toca un byte del
   bloque en el servidor, al abrirlo falla en vez de devolver basura.

   El vector de inicialización (IV) es de 12 bytes y ALEATORIO EN CADA CIFRADO.
   Repetir un IV con la misma clave en GCM no es un descuido menor: rompe el
   cifrado de verdad. Por eso se genera dentro de «cierra» y nadie lo pasa
   desde fuera.

   La sal no es secreta y se guarda junto al bloque. Su oficio es que dos
   personas con la misma contraseña no tengan la misma clave.

   Hay pruebas en tests/cofre.mjs. Si esto se rompe, se rompe en silencio y con
   los datos de alguien dentro.
   ========================================================================== */
(function () {
  'use strict';

  var VUELTAS = 310000;        // OWASP, para PBKDF2-HMAC-SHA256
  var SAL_BYTES = 16;
  var IV_BYTES = 12;           // lo que pide AES-GCM

  // En el navegador es window.crypto; en Node, globalThis.crypto desde la 19.
  var cripto = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  var subtle = cripto && cripto.subtle;

  function hay() { return !!(subtle && cripto.getRandomValues); }

  /* ---- de bytes a texto y al revés ------------------------------------

     Se pasa por base64 porque lo que viaja es JSON y una columna de texto.
     «btoa» no existe en Node y Buffer no existe en el navegador, así que se
     hace a mano una vez y funciona en los dos. */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function aBase64(bytes) {
    var b = new Uint8Array(bytes), s = '', i;
    for (i = 0; i + 2 < b.length; i += 3) {
      s += B64[b[i] >> 2] + B64[((b[i] & 3) << 4) | (b[i + 1] >> 4)] +
           B64[((b[i + 1] & 15) << 2) | (b[i + 2] >> 6)] + B64[b[i + 2] & 63];
    }
    if (i < b.length) {
      s += B64[b[i] >> 2];
      if (i + 1 === b.length) s += B64[(b[i] & 3) << 4] + '==';
      else s += B64[((b[i] & 3) << 4) | (b[i + 1] >> 4)] + B64[(b[i + 1] & 15) << 2] + '=';
    }
    return s;
  }

  function deBase64(s) {
    var limpio = String(s).replace(/[^A-Za-z0-9+/]/g, '');
    var n = limpio.length, bytes = new Uint8Array((n * 3) >> 2), p = 0, i, a, b, c, d;
    for (i = 0; i + 3 < n; i += 4) {
      a = B64.indexOf(limpio[i]); b = B64.indexOf(limpio[i + 1]);
      c = B64.indexOf(limpio[i + 2]); d = B64.indexOf(limpio[i + 3]);
      bytes[p++] = (a << 2) | (b >> 4);
      bytes[p++] = ((b & 15) << 4) | (c >> 2);
      bytes[p++] = ((c & 3) << 6) | d;
    }
    if (i + 1 < n) {
      a = B64.indexOf(limpio[i]); b = B64.indexOf(limpio[i + 1]);
      bytes[p++] = (a << 2) | (b >> 4);
      if (i + 2 < n) {
        c = B64.indexOf(limpio[i + 2]);
        bytes[p++] = ((b & 15) << 4) | (c >> 2);
      }
    }
    return bytes.subarray(0, p);
  }

  var UTF8 = {
    aBytes: function (s) { return new TextEncoder().encode(s); },
    aTexto: function (b) { return new TextDecoder().decode(b); }
  };

  function alAzar(n) { return cripto.getRandomValues(new Uint8Array(n)); }

  /* ---- las claves ------------------------------------------------------ */

  function salNueva() { return aBase64(alAzar(SAL_BYTES)); }

  /* La clave que sale de la contraseña. Solo sirve para envolver a la maestra,
     nunca para cifrar datos: así cambiar la contraseña no toca los datos. */
  function claveDeContraseña(contraseña, salB64) {
    return subtle.importKey('raw', UTF8.aBytes(String(contraseña)),
                            { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (base) {
        return subtle.deriveKey(
          { name: 'PBKDF2', salt: deBase64(salB64), iterations: VUELTAS, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  /* La clave maestra. «extractable» a propósito: hay que poder sacarla para
     guardarla en este dispositivo y para volver a envolverla al cambiar la
     contraseña. Sale de aquí solo hacia el almacén local, nunca a la red. */
  function maestraNueva() {
    return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true,
                              ['encrypt', 'decrypt']);
  }

  function maestraATexto(mk) {
    return subtle.exportKey('raw', mk).then(aBase64);
  }
  function maestraDeTexto(b64) {
    return subtle.importKey('raw', deBase64(b64), { name: 'AES-GCM' }, true,
                            ['encrypt', 'decrypt']);
  }

  /* ---- cerrar y abrir --------------------------------------------------

     El bloque es IV + cifrado, todo junto en base64. El IV va delante porque
     hace falta para abrir y no es secreto. */

  function cierra(clave, obj) {
    var iv = alAzar(IV_BYTES);
    var claro = UTF8.aBytes(JSON.stringify(obj));
    return subtle.encrypt({ name: 'AES-GCM', iv: iv }, clave, claro)
      .then(function (cifrado) {
        var c = new Uint8Array(cifrado);
        var todo = new Uint8Array(iv.length + c.length);
        todo.set(iv, 0);
        todo.set(c, iv.length);
        return aBase64(todo);
      });
  }

  /* Devuelve null si no abre, en vez de reventar: no abrir es una respuesta
     normal —contraseña cambiada, bloque de otra cuenta— y quien llama tiene que
     poder distinguirla de un error de programa. */
  function abre(clave, bloque) {
    var todo;
    try { todo = deBase64(bloque); } catch (e) { return Promise.resolve(null); }
    /* Esta guarda no es la que protege: «decrypt» rechaza igual un bloque más
       corto que la etiqueta, comprobado. Está para decir en voz alta qué es un
       bloque válido, y para no dar el viaje si ya se sabe que no. */
    if (todo.length <= IV_BYTES) return Promise.resolve(null);
    var iv = todo.subarray(0, IV_BYTES);
    var cifrado = todo.subarray(IV_BYTES);
    return subtle.decrypt({ name: 'AES-GCM', iv: iv }, clave, cifrado)
      .then(function (claro) {
        try { return JSON.parse(UTF8.aTexto(new Uint8Array(claro))); }
        catch (e) { return null; }
      })
      .catch(function () { return null; });
  }

  /* ---- lo que usa la aplicación ---------------------------------------- */

  /* Estrenar cofre: sal nueva, maestra nueva y la maestra envuelta con la
     contraseña. Lo que se sube al servidor es «sal» y «maestra»; la maestra
     en claro se queda en este dispositivo. */
  function estrena(contraseña) {
    var sal = salNueva(), mk;
    return maestraNueva()
      .then(function (k) { mk = k; return claveDeContraseña(contraseña, sal); })
      .then(function (kek) { return maestraATexto(mk).then(function (crudo) {
        return cierra(kek, { mk: crudo });
      }); })
      .then(function (envuelta) {
        return { sal: sal, maestra: envuelta, clave: mk };
      });
  }

  /* Abrir el cofre con la contraseña. Devuelve null si no es la buena, que es
     exactamente lo que pasa cuando alguien la ha cambiado en otro sitio. */
  function abreConContraseña(contraseña, sal, maestraEnvuelta) {
    return claveDeContraseña(contraseña, sal)
      .then(function (kek) { return abre(kek, maestraEnvuelta); })
      .then(function (dentro) {
        if (!dentro || !dentro.mk) return null;
        return maestraDeTexto(dentro.mk);
      })
      .catch(function () { return null; });
  }

  /* Volver a envolver la maestra con otra contraseña. Esto es lo que salva la
     temporada cuando alguien ha reseteado la contraseña por correo y este
     dispositivo todavía tiene la clave. Los datos no se tocan. */
  function reenvuelve(clave, contraseñaNueva) {
    var sal = salNueva();
    return claveDeContraseña(contraseñaNueva, sal)
      .then(function (kek) { return maestraATexto(clave).then(function (crudo) {
        return cierra(kek, { mk: crudo });
      }); })
      .then(function (envuelta) { return { sal: sal, maestra: envuelta }; });
  }

  /* Su casa es «window», como la de los demás módulos. Pero este es el único
     que se puede probar entero sin navegador —WebCrypto está en Node desde la
     19— y las pruebas de criptografía tienen que poder correr en cada tanda,
     no solo cuando alguien abra Chromium. Así que se cuelga de donde haya. */
  var casa = typeof window !== 'undefined' ? window : globalThis;

  casa.PTCofre = {
    hay: hay,
    estrena: estrena,
    abreConContraseña: abreConContraseña,
    reenvuelve: reenvuelve,
    cierra: cierra,
    abre: abre,
    maestraATexto: maestraATexto,
    maestraDeTexto: maestraDeTexto,
    VUELTAS: VUELTAS
  };
})();
