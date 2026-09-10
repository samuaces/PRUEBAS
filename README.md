# Pizarra Táctica ⚽

Pizarra táctica de fútbol en el navegador, con material de entrenamiento y animación de
la jugada por fotogramas. Más una portada breve que la presenta y lleva a ella.

Todo estático: HTML, CSS y JavaScript sin dependencias, sin build y sin servidor.

- **Portada:** `index.html`
- **Aplicación:** `app/index.html` + `app/board.css` + `app/board.js`

## Qué hace la pizarra

**Modalidades.** Fútbol 11 (105 × 68), fútbol 7 (65 × 45) y fútbol sala (40 × 20), cada
una con sus medidas de reglamento: áreas, arcos de penalti, córners, porterías y —en
sala— el área en doble cuarto de círculo trazado desde cada poste y pista en lugar de
césped. Al cambiar de modalidad, las fichas, el material y los trazos se reescalan al
campo nuevo. Cuatro encuadres por modalidad: campo completo, medio campo, zona de trabajo —los 32 × 22 m
centrales, que es donde se monta casi cualquier ejercicio— o superficie libre.

**En el móvil.** En vertical el campo se gira 90° para aprovechar el alto de la pantalla,
manteniendo los dorsales derechos. Se acerca con dos dedos y se desplaza arrastrando.
Nada de la interfaz hace scroll, y la aplicación se instala en la pantalla de inicio
(en iPhone, desde Compartir → Añadir a pantalla de inicio) y funciona sin conexión.

**Fichas.** Jugador local, visitante y comodín, con dorsal y nombre editables, más el
balón. Las fichas son símbolos, así que su tamaño se ajusta a la modalidad. Alineaciones
predefinidas para ambos equipos: 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2 y 4-1-4-1 en fútbol
11; 1-3-2-1, 1-2-3-1, 1-3-1-2 y 1-1-3-2 en fútbol 7; rombo, cuadrado, 1-3-0 y 3-1 en sala.

**Materiales.** Conos, platos marcadores, porterías reglamentarias, porterías pequeñas,
vallas de agilidad, escaleras de agilidad, picas, maniquíes, aros y banderines. Cada uno se
dibuja como lo que es: el plato, plano y con su hueco central, no como un cono pequeño; la
pica, un palo de metro y medio con sus franjas sobre una peana, no un punto de color; la
valla, una U invertida apoyada en dos pies; el maniquí, un torso con hombros sobre su base.
Los iconos del panel repiten el mismo dibujo, para que lo que eliges y lo que aparece en el
campo sean la misma pieza. Se
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

**Biblioteca.** Diez ejercicios vienen dentro de la aplicación —rondo, salida de balón,
finalización tras centro, transición 3 contra 2, juego de posición, circuito de conducción,
presión tras pérdida, córner, superioridad en fútbol 7 y ataque en 3-1 de sala—, cada uno con
su pizarra montada y su ficha rellena. La biblioteca los lista junto a las pizarras que hayas
guardado tú, con su miniatura.

**No mezcla disciplinas**: abre siempre en una sola modalidad, la que tengas puesta como
predeterminada —fútbol 11 mientras no cambies nada—, y para ver fútbol 7 o sala hay que
seleccionarlo. Dentro de esa modalidad se filtra por momento del juego, duración o buscando
texto en cualquier campo de la ficha; sin más filtros salen todos los de tu modalidad.

**Ajustes.** Un panel propio con dos cosas: la modalidad predeterminada —con la que abre la
biblioteca y con la que empieza cada pizarra nueva, sin tocar la que tengas abierta— y tu
categoría o equipo, que se rellena sola en cada ficha. Se guarda en el navegador, aparte del
documento: no es de una pizarra, es de quien la usa.

Los mismos diez sirven de **plantilla** desde la ficha: un selector rellena título, objetivo,
descripción, consignas, normas, variantes y todos los datos de organización, y deja intactas
la categoría, la fecha y la sesión, que son tuyas.

La biblioteca tiene **dos pestañas**: la general y las tuyas.

- **Biblioteca general.** Ya no vive escrita dentro de `board.js`, sino en
  `assets/biblioteca.json`, que la aplicación se descarga al arrancar. Añadir un ejercicio es
  editar ese archivo: aparece en la biblioteca y entre las plantillas **sin volver a publicar
  la aplicación**. Se guarda una copia en el navegador, así que sin conexión sigue estando, y
  las versiones de un solo archivo (`dist/` y el artifact) la llevan incrustada al construirse.
  El service worker la pide siempre a la red primero —es lo único que crece— y cae a la copia
  guardada si no hay.
- **Mías.** Las pizarras que hayas guardado tú, que no salen de tu navegador.

Y aquí el límite que conviene tener claro: **la biblioteca general la actualiza quien mantiene
el repositorio, no los propios entrenadores**. Para que un entrenador publique su ejercicio y
lo vean los demás hace falta un servidor que acepte escrituras, y con él identidad, moderación
y datos saliendo del dispositivo. Ver «Biblioteca compartida» más abajo.

**Un solo lenguaje en los menús.** Los diálogos compartían anatomía pero no piezas: había
cinco estilos de campo de formulario, dos clases distintas para el mismo rótulo de sección,
dos controles segmentados que hacían lo mismo, dos píldoras casi iguales y tres verbos para
cerrar («Cerrar», «Entendido», «Listo»). Ahora hay **un** estilo de campo para el panel, los
diálogos y los filtros; **un** rótulo de sección; **un** control segmentado, que usan igual la
vista del campo, la modalidad y los apartados de la ficha; **una** píldora, que sirve tanto
para las acciones pequeñas como para las sugerencias; y **cerrar se dice «Cerrar»** en todas
partes, con el botón principal reservado a lo que de verdad hace algo.

**El panel, por secciones.** En el móvil cada pestaña de abajo abre **su** sección y nada más
—herramientas, trazo, equipos, material, campo o pizarra—, con su título arriba, en vez de una
hoja con todo dentro que hay que recorrer. En pantalla ancha la barra lateral las sigue
enseñando todas, que ahí es lo cómodo.

**Ficha del ejercicio.** Un formulario dentro de la pizarra —título, categoría, momento del
juego, sesión, duración, series, descanso, jugadores, porteros, espacio, material, objetivo,
descripción, consignas, normas y variantes—, repartido en tres apartados que se abren de uno
en uno, con **sugerencias en cada campo** (duraciones, series, descansos, número de jugadores,
espacios, material, y consignas, normas y variantes habituales, que se suman como una línea
más). Se imprime en una página A4 maquetada por
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
├── index.html                     Portada: qué hace, cómo funciona y el enlace a la pizarra
├── app/
│   ├── index.html                 Interfaz de la pizarra
│   ├── board.css                  Tema e interfaz
│   └── board.js                   Motor: campo, objetos, trazos, animación, E/S
├── 404.html                       Página de error
├── robots.txt · sitemap.xml · llms.txt · site.webmanifest · .nojekyll
├── assets/
│   ├── biblioteca.json            El catálogo de ejercicios, editable sin tocar código
│   ├── fonts/                     Outfit e Inter autoalojadas (OFL) + licencia
│   ├── img/                       favicon, iconos PWA e imagen Open Graph 1200×630
│   └── js/site.js                 JS de la portada (tema, menú, aparición progresiva)
├── dist/pizarra-tactica.html      La pizarra entera en un archivo (node tools/build-single.mjs)
├── tools/                         build-single.mjs (archivo único) y build-icons.mjs (marca e iconos)
├── docs/TRAFICO-Y-SEO.md          Qué está hecho y qué falta para tener visitas
├── tests/                         Batería de pruebas de la pizarra en el navegador
└── .github/workflows/deploy-pages.yml
```

## Biblioteca compartida: qué faltaría

Hoy el sitio es estático: GitHub Pages sirve archivos y no ejecuta nada. Eso basta para que la
biblioteca general **crezca** (editando `assets/biblioteca.json`), pero no para que **cualquiera
la haga crecer**. Para eso hay dos caminos, de menos a más:

1. **Por pull request.** Un entrenador exporta su ejercicio en JSON desde la propia pizarra y
   lo manda; se añade al archivo y en el siguiente despliegue lo tiene todo el mundo. Coste:
   cero euros y un rato de revisión por ejercicio. Es lo que ya se puede hacer hoy.
2. **Con servidor.** Una base de datos y una API con un botón de «publicar» en la aplicación.
   Hace falta identidad (aunque sea anónima, para poder borrar o bloquear), una cola de
   revisión —todo lo que se sube lo ve todo el mundo— y un cambio en la promesa de privacidad
   de la aplicación, que hoy es que nada sale del dispositivo. Supabase o Cloudflare tienen
   plan gratuito de sobra para empezar. Semanas de trabajo, no horas.

El cliente ya está preparado para lo segundo: la biblioteca se pinta a partir de una lista de
ejercicios que llega de fuera, así que cambiar el archivo por una API es sustituir una URL.

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
`woff2` (subconjunto latino, ~80 KB) y precargadas. Cero peticiones a terceros. La portada
tiene tema claro y oscuro con conmutador; la pizarra es siempre oscura.

## Trabajar en local

No hace falta build:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Pruebas

`tests/pizarra.test.html` es una batería de 127 comprobaciones de punta a punta sobre la
pizarra: colocación y giro de las once piezas, arrastre, las herramientas de trazo, la
regla, la animación por fotogramas, la grabación de vídeo, el zoom a dos dedos, las tres
modalidades de campo, la selección múltiple, la hoja de sesión, la hoja de exportación,
la ficha del ejercicio y su impresión, la biblioteca con sus filtros y sus plantillas, los ajustes, los apartados de la ficha y sus sugerencias, el panel por secciones, la consistencia entre menús, que cada material se dibuje como lo que es, la generación del GIF y su decodificación por el
navegador, la escritura del contenedor MP4 caja por caja, que el MP4 resultante se abra y tenga imagen, deshacer y rehacer,
formaciones y la exportación. Sirve el repositorio y abre ese archivo en el navegador; se ejecuta solo.
Ver [`tests/README.md`](tests/README.md) para la variante sin interfaz.

## Privacidad y rendimiento

- La portada se pinta con una sola petición: CSS embebido y JS diferido.
- Sin JavaScript, la portada se ve y se navega igual.
- Sin cookies, sin analítica y sin llamadas externas. Lo que guardas en la pizarra vive en
  el `localStorage` de tu navegador y no viaja a ningún sitio.

## Tráfico

Ver [`docs/TRAFICO-Y-SEO.md`](docs/TRAFICO-Y-SEO.md).
