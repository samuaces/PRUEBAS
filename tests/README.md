# Pruebas

`pizarra.test.html` comprueba de punta a punta la pizarra (`/app/`): que el campo se
dibuja, que los once elementos colocables aparecen al tocar el campo, que se arrastra y
se selecciona, que las cuatro herramientas de trazo y la zona pintan, que la animación
por fotogramas arranca, avanza y termina, que deshacer y rehacer funcionan, que las
formaciones colocan a los once, que las tres vistas del campo se redibujan, que la
exportación a PNG y a JSON no falla y que no hay errores de JavaScript.

## A mano

```bash
python3 -m http.server 8899
# abre http://localhost:8899/tests/pizarra.test.html
```

Se ejecuta solo y muestra el informe en pantalla.

## Sin interfaz

```bash
python3 -m http.server 8899 &
npm i puppeteer-core
node tests/run-headless.mjs
```

Necesita un Chromium local; ajusta `executablePath` en `run-headless.mjs`.

## El catálogo

`catalogo.mjs` revisa los ejercicios que trae la aplicación (`assets/biblioteca.json`):
que cada uno se pueda dibujar de verdad —modalidad y encuadre que existan, piezas que el
motor sepa pintar, nada fuera del campo ni fuera del encuadre con el que se abre, fichas
sin encimarse— y que la ficha esté completa y su momento sea uno de los que ofrece el
filtro de la biblioteca. Colocando un ejercicio a ojo sobre la pantalla es fácil dejarse
una pieza fuera del medio campo o dos fichas superpuestas, y eso no se nota hasta que
alguien lo abre.

```bash
node tests/catalogo.mjs
```

No necesita navegador ni servidor.

## El cofre

`cofre.mjs` prueba el cifrado de extremo a extremo (`app/cofre.js`): que un bloque no
lleve los nombres dentro, que dos cifrados del mismo dato salgan distintos, que un bloque
tocado no se abra, que una contraseña mala devuelva `null` en vez de reventar, que cambiar
la contraseña siga abriendo los datos viejos, y que el base64 escrito a mano sea el mismo
que el de todo el mundo.

```bash
node tests/cofre.mjs
```

No necesita navegador ni servidor: WebCrypto está en Node desde la 19, y es la misma API.

## La fusión

`fusion.mjs` prueba cómo se juntan los datos de dos dispositivos (`app/fusion.js`).
Además de los casos concretos —que lo apuntado el martes en el ordenador y lo del
miércoles en el móvil convivan, que un borrado no resucite, que un choque se anote en
vez de callarse— comprueba con datos al azar las dos propiedades sin las cuales dos
dispositivos no vuelven a juntarse nunca: que dé igual el orden en que se fusione, y que
fusionar lo ya fusionado no mueva nada.

```bash
node tests/fusion.mjs
```

No necesita navegador ni servidor.
