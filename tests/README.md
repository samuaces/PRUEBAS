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
