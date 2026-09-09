# Pizarra Táctica ⚽

Pizarra táctica de fútbol en el navegador, con material de entrenamiento y animación de
la jugada por fotogramas. Más una landing page optimizada para buscadores.

Todo estático: HTML, CSS y JavaScript sin dependencias, sin build y sin servidor.

- **Landing:** `index.html`
- **Aplicación:** `app/index.html` + `app/board.css` + `app/board.js`

## Qué hace la pizarra

**Modalidades.** Fútbol 11 (105 × 68), fútbol 7 (65 × 45) y fútbol sala (40 × 20), cada
una con sus medidas de reglamento: áreas, arcos de penalti, córners, porterías y —en
sala— el área en doble cuarto de círculo trazado desde cada poste y pista en lugar de
césped. Al cambiar de modalidad, las fichas, el material y los trazos se reescalan al
campo nuevo. Tres vistas por modalidad: completo, medio campo o superficie libre.

**En el móvil.** En vertical el campo se gira 90° para aprovechar el alto de la pantalla,
manteniendo los dorsales derechos. Se acerca con dos dedos y se desplaza arrastrando.
Nada de la interfaz hace scroll, y la aplicación se instala en la pantalla de inicio
(en iPhone, desde Compartir → Añadir a pantalla de inicio) y funciona sin conexión.

**Fichas.** Jugador local, visitante y comodín, con dorsal y nombre editables, más el
balón. Las fichas son símbolos, así que su tamaño se ajusta a la modalidad. Alineaciones
predefinidas para ambos equipos: 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2 y 4-1-4-1 en fútbol
11; 1-3-2-1, 1-2-3-1, 1-3-1-2 y 1-1-3-2 en fútbol 7; rombo, cuadrado, 1-3-0 y 3-1 en sala.

**Materiales.** Conos, platos marcadores, porterías reglamentarias, porterías pequeñas,
vallas de agilidad, escaleras de agilidad, picas, maniquíes, aros y banderines. Se
colocan tocando el campo tantas veces como haga falta, y los alargados se giran con el
tirador de la selección o con los botones de 15° y 90°.

**Dibujo.** Flecha de pase (sólida), de carrera (discontinua) y de conducción (ondulada),
línea libre, zona sombreada, textos y una regla que mide distancias reales en metros. Ocho colores y tres grosores. Todos los trazos se
hacen arrastrando por el recorrido real, no punto a punto.

**Animación.** Cada fotograma es una posición del tablero. Se guarda la inicial, se mueven
las fichas, se añade otro fotograma y al reproducir la pizarra interpola el movimiento con
suavizado, dibuja la estela de cada jugador y permite ajustar velocidad y bucle.

**Selección múltiple.** Arrastrando sobre una zona vacía se dibuja un recuadro que
selecciona todas las piezas de dentro; a partir de ahí se mueven, duplican o borran en
bloque. Es lo que permite recolocar una línea entera de un arrastre.

**Ficha del ejercicio.** Un formulario dentro de la pizarra —título, categoría, momento del
juego, sesión, duración, series, descanso, jugadores, porteros, espacio, material, objetivo,
descripción, consignas, normas y variantes— que se imprime en una página A4 maquetada por
bloques: cabecera con etiquetas, el esquema del ejercicio en su marco, los datos en celdas,
el objetivo destacado, el desarrollo, y consignas, normas y progresiones numeradas a tres
columnas. Si la jugada tiene varios fotogramas, añade la secuencia en miniatura, y al pie
queda un cuadro rayado de observaciones que se estira hasta llenar el folio.

Antes de imprimir, la hoja **se mide a sí misma** y elige entre tres maquetas: la normal;
la **ancha**, con el esquema a todo el ancho y los datos debajo, cuando iba a sobrar más de
un palmo de papel; y la **apretada**, que estrecha el esquema y recorta el aire cuando la
ficha viene muy llena. Lo que no se toca en ningún caso son los márgenes: 14 mm por los
cuatro lados. Cabe en un folio en los tres casos, comprobado imprimiendo a PDF con
Chromium. El botón **Rellenar desde la pizarra** lee el campo y pone solo los
jugadores (`11 vs 11`), los porteros, el material (`4 conos, 2 porterías pequeñas`) y el
espacio, sin pisar nada de lo que ya hayas escrito. La ficha viaja dentro del documento: se
guarda, se exporta en JSON y entra en deshacer y rehacer.

**Hoja de sesión.** Saca todos los fotogramas de la jugada en una página imprimible, con
título, modalidad, fecha y un recuadro para anotaciones.

**Exportar.** Un solo botón abre una hoja con todo lo que se puede sacar: imagen PNG del
fotograma, ficha del ejercicio, hoja de sesión imprimible, vídeo de la jugada, GIF animado y
el archivo de la pizarra. Nada sale del dispositivo.

**Vídeo.** Siempre sale **MP4**, sin marca de agua y sin pasar por ningún servidor. Hay dos
caminos: si el navegador sabe grabar MP4 (Safari, Chrome reciente) se usa `MediaRecorder`;
si no, se codifica H.264 cuadro a cuadro con **WebCodecs** y el contenedor MP4 lo escribe
la propia aplicación —un empaquetador ISO BMFF propio, sin bibliotecas—. Y si el navegador
no puede ninguna de las dos cosas, lo dice y ofrece el GIF en vez de colar un WebM que el
móvil no abre.

**GIF.** Codificador propio: corte mediano para la paleta, LZW y codificación sólo del
rectángulo que cambia entre fotogramas, lo que lo deja en torno a 300 KB en vez de un mega.

**Gestión.** Deshacer y rehacer, guardado con nombre en el dispositivo, autoguardado al
recargar, exportación del fotograma a PNG (2400 px) y exportación e importación de la
pizarra completa en JSON. Ajuste opcional a una rejilla de 0,5 m.

### Atajos

`V` mover · `A` pase · `S` carrera · `D` conducción · `F` línea · `Z` zona · `E` borrar ·
`Supr` eliminar la selección · `Espacio` reproducir o pausar · `Esc` volver a mover ·
`M` regla · arrastrar en vacío para seleccionar varias · `R` girar la pieza seleccionada · `+` / `-` / `0` zoom ·
`Ctrl+Z` / `Ctrl+Mayús+Z` deshacer y rehacer.

## Estructura

```
.
├── index.html                     Landing page (CSS crítico embebido, JSON-LD, OG)
├── app/
│   ├── index.html                 Interfaz de la pizarra
│   ├── board.css                  Tema e interfaz
│   └── board.js                   Motor: campo, objetos, trazos, animación, E/S
├── 404.html                       Página de error
├── robots.txt · sitemap.xml · llms.txt · site.webmanifest · .nojekyll
├── assets/
│   ├── fonts/                     Outfit e Inter autoalojadas (OFL) + licencia
│   ├── img/                       favicon, iconos PWA e imagen Open Graph 1200×630
│   └── js/site.js                 JS de la landing (tema, menú, aparición progresiva)
├── dist/pizarra-tactica.html      La pizarra entera en un archivo (node tools/build-single.mjs)
├── tools/                         build-single.mjs (archivo único) y build-icons.mjs (marca e iconos)
├── docs/TRAFICO-Y-SEO.md          Qué está hecho y qué falta para tener visitas
├── tests/                         Batería de pruebas de la pizarra en el navegador
└── .github/workflows/deploy-pages.yml
```

## Cómo funciona por dentro

Todo se pinta en un único `<canvas>` con un bucle de render, en lugar de con nodos del
DOM: es lo que permite arrastrar veinte fichas y animar la jugada sin tirones.

- **Coordenadas en metros.** El documento guarda posiciones en metros del campo real; la
  transformación `{escala, desplazamiento, rotación}` las convierte a píxeles. Cambiar de
  vista o de modalidad, redimensionar la ventana, girar el campo o acercar con dos dedos
  solo recalcula esa transformación.
- **Modalidades como datos.** `PITCHES` define las medidas de cada una y el dibujo del
  campo se deriva de ahí, así que añadir una nueva es cuestión de una entrada más.
- **Documento y fotogramas.** `doc = { view, card, frames: [{ objects, strokes }] }`. Editar
  siempre actúa sobre el fotograma actual, y la ficha del ejercicio vive en el mismo
  documento, así que se guarda, se exporta y se deshace con todo lo demás.
- **Historial.** Instantáneas JSON del documento completo (hasta 80), lo que hace que
  deshacer y rehacer sean triviales y no puedan desincronizarse.
- **Animación.** Entre dos fotogramas se emparejan los objetos por identificador y se
  interpola posición y ángulo con una curva `easeInOutCubic`; los que solo existen en uno
  de los dos entran o salen con un fundido, y los trazos se cruzan con otro fundido.
- **El campo se pinta una vez.** Césped, franjas, viñeta y líneas van a un lienzo aparte
  que sólo se recalcula si cambia la vista, el zoom o el tamaño de la ventana; arrastrar
  una ficha no vuelve a dibujar el campo.
- **Un redibujado por cuadro.** Los eventos de arrastre llegan mucho más rápido de lo que
  la pantalla pinta, así que se agrupan en un único `requestAnimationFrame`.

## Publicar en GitHub Pages

1. **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.
2. Fusiona esta rama en la rama principal (o lanza el workflow a mano desde Actions).
   El sitio queda en `https://samuaces.github.io/PRUEBAS/`.

## Cambiar el dominio

Las URLs absolutas (canonical, Open Graph, sitemap, JSON-LD) apuntan a
`https://samuaces.github.io/PRUEBAS`. Si usas un dominio propio, sustitúyelo en
`index.html`, `app/index.html`, `404.html`, `sitemap.xml`, `robots.txt` y `llms.txt`,
y crea un archivo `CNAME` en la raíz con tu dominio. Los enlaces internos son relativos.

## Diseño

Tema propio **"Stadium Night"**, con la marca en rojo carmesí:

| Rol | Oscuro | Claro |
|---|---|---|
| Fondo | `#070A0F` | `#FFFFFF` |
| Superficie | `#101823` | `#FFFFFF` |
| Texto | `#E8EEF6` | `#0B1420` |
| Marca (rellenos) | `#E11A41` | `#C2072F` |
| Marca (texto sobre oscuro) | `#FF5C7A` | `#8A0524` |
| Degradado de la marca | `#E7204A` → `#AE0325` | igual |

El fondo se queda en un gris casi negro **neutro**, no teñido de rojo: es sobre lo
que se juzga el color del césped y de las fichas, y una base cálida las falsearía.
El rojo va donde tiene que llamar —marca, botón principal, estado activo, selección
sobre el campo— y el césped sigue siendo verde, porque es la superficie de juego y
no un color corporativo. En el lienzo, la selección y el tirador de giro pasaron de
verde a rojo (`#FF2E55`): sobre hierba se ven bastante mejor.

La marca es un campo visto en vertical con una flecha de progresión. Hay dos
versiones del mismo dibujo: la completa (con mosaico y barras) para los iconos
grandes, y la simple (campo y flecha) para la pestaña y las cabeceras, que es lo
único que sobrevive a 16 píxeles. Ambas se generan con `node tools/build-icons.mjs`.

Tipografías **Outfit** (titulares) e **Inter** (texto), autoalojadas en formato variable
`woff2` (subconjunto latino, ~80 KB) y precargadas. Cero peticiones a terceros. La landing
tiene tema claro y oscuro con conmutador; la pizarra es siempre oscura.

## Trabajar en local

No hace falta build:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Pruebas

`tests/pizarra.test.html` es una batería de 84 comprobaciones de punta a punta sobre la
pizarra: colocación y giro de las once piezas, arrastre, las herramientas de trazo, la
regla, la animación por fotogramas, la grabación de vídeo, el zoom a dos dedos, las tres
modalidades de campo, la selección múltiple, la hoja de sesión, la hoja de exportación,
la ficha del ejercicio y su impresión, la generación del GIF y su decodificación por el
navegador, la escritura del contenedor MP4 caja por caja, que el MP4 resultante se abra y tenga imagen, deshacer y rehacer,
formaciones y la exportación. Sirve el repositorio y abre ese archivo en el navegador; se ejecuta solo.
Ver [`tests/README.md`](tests/README.md) para la variante sin interfaz.

## Privacidad y rendimiento

- La landing se pinta con una sola petición: CSS embebido y JS diferido.
- Sin JavaScript, la landing se ve y se navega igual.
- Sin cookies, sin analítica y sin llamadas externas. Lo que guardas en la pizarra vive en
  el `localStorage` de tu navegador y no viaja a ningún sitio.

## Tráfico

Ver [`docs/TRAFICO-Y-SEO.md`](docs/TRAFICO-Y-SEO.md).
