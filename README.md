# Pizarra Táctica ⚽

Pizarra táctica de fútbol en el navegador, con material de entrenamiento y animación de
la jugada por fotogramas. Más una landing page optimizada para buscadores.

Todo estático: HTML, CSS y JavaScript sin dependencias, sin build y sin servidor.

- **Landing:** `index.html`
- **Aplicación:** `app/index.html` + `app/board.css` + `app/board.js`

## Qué hace la pizarra

**Campo.** 105 × 68 m a escala, con áreas, arcos de penalti y córners correctos. Tres
vistas: campo completo, medio campo o superficie libre. En pantallas verticales el campo
se gira 90° automáticamente para aprovechar el alto del móvil, manteniendo los dorsales
derechos.

**Fichas.** Jugador local, visitante y comodín, con dorsal y nombre editables, más el
balón. Formaciones predefinidas para cualquiera de los dos equipos: 4-4-2, 4-3-3,
4-2-3-1, 3-5-2, 5-3-2 y 4-1-4-1.

**Materiales.** Conos, platos marcadores, porterías reglamentarias, porterías pequeñas,
vallas de agilidad, escaleras de agilidad, picas, maniquíes, aros y banderines. Se
colocan tocando el campo tantas veces como haga falta, y los alargados se giran con el
tirador de la selección o con los botones de 15° y 90°.

**Dibujo.** Flecha de pase (sólida), de carrera (discontinua) y de conducción (ondulada),
línea libre, zona sombreada y textos. Ocho colores y tres grosores. Todos los trazos se
hacen arrastrando por el recorrido real, no punto a punto.

**Animación.** Cada fotograma es una posición del tablero. Se guarda la inicial, se mueven
las fichas, se añade otro fotograma y al reproducir la pizarra interpola el movimiento con
suavizado, dibuja la estela de cada jugador y permite ajustar velocidad y bucle.

**Gestión.** Deshacer y rehacer, guardado con nombre en el navegador, autoguardado al
recargar, exportación del fotograma a PNG (2400 px) y exportación e importación de la
pizarra completa en JSON. Ajuste opcional a una rejilla de 0,5 m.

### Atajos

`V` mover · `A` pase · `S` carrera · `D` conducción · `F` línea · `Z` zona · `E` borrar ·
`Supr` eliminar la selección · `Espacio` reproducir o pausar · `Esc` volver a mover ·
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
├── docs/TRAFICO-Y-SEO.md          Qué está hecho y qué falta para tener visitas
├── tests/                         Batería de pruebas de la pizarra en el navegador
└── .github/workflows/deploy-pages.yml
```

## Cómo funciona por dentro

Todo se pinta en un único `<canvas>` con un bucle de render, en lugar de con nodos del
DOM: es lo que permite arrastrar veinte fichas y animar la jugada sin tirones.

- **Coordenadas en metros.** El documento guarda posiciones en metros del campo real; la
  transformación `{escala, desplazamiento, rotación}` las convierte a píxeles. Cambiar de
  vista, redimensionar la ventana o girar el campo solo recalcula esa transformación.
- **Documento y fotogramas.** `doc = { view, frames: [{ objects, strokes }] }`. Editar
  siempre actúa sobre el fotograma actual.
- **Historial.** Instantáneas JSON del documento completo (hasta 80), lo que hace que
  deshacer y rehacer sean triviales y no puedan desincronizarse.
- **Animación.** Entre dos fotogramas se emparejan los objetos por identificador y se
  interpola posición y ángulo con una curva `easeInOutCubic`; los que solo existen en uno
  de los dos entran o salen con un fundido, y los trazos se cruzan con otro fundido.

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

Tema propio **"Stadium Night"**:

| Rol | Oscuro | Claro |
|---|---|---|
| Fondo | `#070A0F` | `#FFFFFF` |
| Superficie | `#101823` | `#FFFFFF` |
| Texto | `#E8EEF6` | `#0B1420` |
| Acento (césped) | `#00E27E` | `#00A85B` |
| Acento secundario | `#4CC2FF` | `#0A6FCB` |

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

`tests/pizarra.test.html` es una batería de 26 comprobaciones de punta a punta sobre la
pizarra: colocación de los once elementos, arrastre, las cuatro herramientas de trazo,
la animación por fotogramas, deshacer y rehacer, formaciones, las tres vistas del campo y
la exportación. Sirve el repositorio y abre ese archivo en el navegador; se ejecuta solo.
Ver [`tests/README.md`](tests/README.md) para la variante sin interfaz.

## Privacidad y rendimiento

- La landing se pinta con una sola petición: CSS embebido y JS diferido.
- Sin JavaScript, la landing se ve y se navega igual.
- Sin cookies, sin analítica y sin llamadas externas. Lo que guardas en la pizarra vive en
  el `localStorage` de tu navegador y no viaja a ningún sitio.

## Tráfico

Ver [`docs/TRAFICO-Y-SEO.md`](docs/TRAFICO-Y-SEO.md).
