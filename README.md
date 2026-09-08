# Pizarra Táctica ⚽

Landing page + aplicación web para dibujar jugadas de fútbol. Todo estático: HTML, CSS y
JavaScript sin dependencias, sin build y sin servidor.

- **Landing:** `index.html` — página de presentación optimizada para buscadores.
- **Aplicación:** `app/index.html` — la pizarra táctica en sí.

## Estructura

```
.
├── index.html                     Landing page (CSS crítico embebido, JSON-LD, OG)
├── app/index.html                 La pizarra táctica
├── 404.html                       Página de error
├── robots.txt                     Rastreo permitido, incluidos bots de IA
├── sitemap.xml                    Mapa del sitio para Search Console
├── llms.txt                       Resumen del proyecto para modelos de lenguaje
├── site.webmanifest               Instalable como aplicación
├── .nojekyll                      GitHub Pages sirve los archivos tal cual
├── assets/
│   ├── fonts/                     Outfit e Inter autoalojadas (OFL) + licencia
│   ├── img/                       favicon, iconos PWA e imagen Open Graph 1200×630
│   └── js/site.js                 Tema, menú, aparición progresiva (mejora progresiva)
├── docs/TRAFICO-Y-SEO.md          Qué está hecho y qué queda por hacer para tener visitas
└── .github/workflows/deploy-pages.yml
```

## Publicar en GitHub Pages

1. **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.
2. Fusiona esta rama en la rama principal (o lanza el workflow a mano desde la pestaña
   Actions). El sitio queda en `https://samuaces.github.io/PRUEBAS/`.

## Cambiar el dominio

Las URLs absolutas (canonical, Open Graph, sitemap, JSON-LD) apuntan a
`https://samuaces.github.io/PRUEBAS`. Si usas un dominio propio, sustitúyelo en
`index.html`, `app/index.html`, `404.html`, `sitemap.xml`, `robots.txt` y `llms.txt`,
y crea un archivo `CNAME` en la raíz con tu dominio. Los enlaces internos son relativos,
así que esos no hay que tocarlos.

## Diseño

Tema propio **"Stadium Night"**, derivado de la paleta de la propia aplicación:

| Rol | Oscuro | Claro |
|---|---|---|
| Fondo | `#070A0F` | `#FFFFFF` |
| Superficie | `#101823` | `#FFFFFF` |
| Texto | `#E8EEF6` | `#0B1420` |
| Acento (césped) | `#00E27E` | `#00A85B` |
| Acento secundario | `#4CC2FF` | `#0A6FCB` |

Tipografías: **Outfit** para titulares e **Inter** para el texto, autoalojadas en formato
variable `woff2` (subconjunto latino, ~80 KB en total) y precargadas. Cero peticiones a
terceros. Hay tema claro y oscuro, con conmutador y respeto por `prefers-color-scheme`.

## Cómo trabajar en local

No hace falta build. Basta con servir la carpeta:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Rendimiento y accesibilidad

- Una única petición para pintar la página: el CSS va embebido y el JS es `defer`.
- Sin JavaScript, la página se ve y se navega igual (las animaciones simplemente no ocurren).
- Contraste AA, navegación por teclado, enlace de salto al contenido, foco visible y
  `prefers-reduced-motion`.
- Sin cookies, sin analítica y sin llamadas externas.

## Tráfico

Ver [`docs/TRAFICO-Y-SEO.md`](docs/TRAFICO-Y-SEO.md): qué trae visitas de verdad, qué está
ya implementado aquí y qué prácticas hay que evitar para no acabar penalizado.
