# Cómo conseguir que esta página reciba visitas

Antes de nada, lo importante: **ningún sistema hace que una web reciba visitas "solo por
existir"**. Google indexa páginas, no las promociona; y las técnicas que prometen tráfico
automático (granjas de enlaces, contenido generado en masa, páginas puerta, cloaking,
relleno de palabras clave, compra de enlaces) son exactamente las que provocan una
penalización manual o la desindexación completa del dominio. Nada de eso está en este
repositorio y no debería estarlo.

Lo que sí existe es un trabajo técnico que hace que, **cuando alguien busque lo que tú
ofreces, tu página sea la que aparezca y la que se elija**. Eso es lo que ya viene hecho
aquí, más el trabajo manual que solo puedes hacer tú.

---

## 1. Lo que ya está implementado en el repositorio

| Elemento | Dónde | Para qué sirve |
|---|---|---|
| `<title>` y `meta description` únicos | `index.html`, `app/index.html` | Son el titular y el texto que Google enseña en los resultados. Determinan el porcentaje de clic. |
| `link rel="canonical"` | ambas páginas | Evita que el mismo contenido se indexe con varias URLs y se canibalice a sí mismo. |
| Datos estructurados JSON-LD | `index.html` | `SoftwareApplication`, `WebSite` y `WebPage`. El `FAQPage` se retiró al quitar la FAQ visible: el marcado sin contenido visible es motivo de penalización. |
| Open Graph + Twitter Card + imagen 1200×630 | `index.html`, `assets/img/og-image.png` | Cada vez que alguien pega el enlace en WhatsApp, X o LinkedIn se ve una tarjeta con imagen. Multiplica el clic frente a un enlace pelado. |
| `sitemap.xml` | raíz | Lista de URLs para enviar a Search Console y acelerar la indexación. |
| `robots.txt` | raíz | Permite el rastreo, incluidos los bots de IA (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `OAI-SearchBot`). |
| `llms.txt` | raíz | Resumen legible por modelos de lenguaje: mejora cómo te describen los asistentes de IA. |
| HTML semántico y accesible | `index.html` | Encabezados jerárquicos, `main`/`section`/`footer`, enlace de salto, foco visible, `prefers-reduced-motion`. Google usa la experiencia de página como señal. |
| Fuentes autoalojadas + CSS crítico embebido | `assets/fonts/`, `<style>` en línea | La página se pinta con **una sola petición HTML**: sin CSS externo, sin CDN, sin bloqueo de renderizado. Es lo que mueve el LCP de los Core Web Vitals. |
| Cero dependencias y cero rastreo | todo el proyecto | Nada de jQuery, de fuentes de Google en caliente ni de scripts de terceros: menos peso, menos latencia y ningún banner de cookies. |
| Sin valoraciones ni testimonios inventados | `index.html` | Marcar `AggregateRating` falso es motivo de acción manual por *spam de datos estructurados*. Por eso aquí no hay ninguno. |
| El marcado solo describe lo que se ve | `index.html` | Google exige que los datos estructurados reflejen contenido visible; por eso no hay `FAQPage` mientras la portada no tenga preguntas. |
| Página 404 útil | `404.html` | Recupera al visitante perdido en lugar de expulsarlo. |
| `site.webmanifest` + iconos | raíz, `assets/img/` | Instalable en el móvil y con icono propio en la pestaña. |

---

## 2. Lo que tienes que hacer tú (esto es lo que realmente trae visitas)

### Paso 1 — Publicar
Activa GitHub Pages: **Settings → Pages → Source: GitHub Actions**. El workflow
`.github/workflows/deploy-pages.yml` despliega en cada push a la rama principal.

### Paso 2 — Un dominio propio (muy recomendable)
En `usuario.github.io/PRUEBAS/` estás construyendo autoridad para *GitHub*, no para ti,
y el `robots.txt` de un subdirectorio **no lo lee nadie** (los rastreadores solo miran el
de la raíz del dominio). Con un dominio propio, todo lo de este repositorio funciona tal
cual. Para cambiarlo hay que sustituir `https://klym.xyz` por tu dominio
en: `index.html`, `app/index.html`, `404.html`, `sitemap.xml`, `robots.txt` y `llms.txt`,
y añadir un archivo `CNAME` en la raíz con tu dominio.

### Paso 3 — Search Console y Bing Webmaster Tools
Da de alta la propiedad, verifica, envía `sitemap.xml` y usa "Inspección de URL →
Solicitar indexación". Sin esto puedes tardar semanas en aparecer; con esto, horas o días.
Bing importa la configuración de Google en dos clics, y Bing es quien alimenta a ChatGPT.

### Paso 4 — Decidir por qué búsqueda quieres competir
La portada apunta a *"pizarra táctica de fútbol online"*: intención clara y competencia
asumible. Comprueba en Search Console qué consultas te traen impresiones y reescribe los
`<h2>` y los párrafos hacia las que tengan impresiones pero pocos clics: ahí está el
crecimiento fácil.

> **Aviso desde el rediseño de la portada.** La portada es ahora una presentación breve
> —qué hace y cómo funciona—, no un texto largo de captación. Se quitaron la FAQ, los casos
> de uso, la hoja de ruta y la guía extensa, que eran el grueso del texto indexable, y con
> ellos el marcado `FAQPage`. Lo técnico (title, description, canonical, Open Graph,
> sitemap, `SoftwareApplication`, rendimiento) sigue intacto, pero **con menos texto se
> compite por menos búsquedas**. Si algún día quieres tráfico de buscadores en serio, el
> camino no es volver a alargar la portada: es el paso 5, páginas propias por tema.

### Paso 5 — Más páginas, no más trucos
Una sola URL compite por un puñado de búsquedas. Diez páginas útiles compiten por cientos.
Ideas que encajan con este proyecto y que además dan motivos para enlazarte:
"cómo dibujar una jugada de estrategia a balón parado", "el 4-3-3 explicado en la pizarra",
"20 ejercicios de rondo con conos", "qué significa cada flecha en un esquema táctico",
"circuitos de agilidad con vallas y escalera". Cada artículo, con su propio `title`, su
`description` y un enlace a la pizarra.

Y hay algo que ninguna palabra clave sustituye: **la herramienta hace algo que las demás
pizarras gratuitas no hacen** —animar la jugada por fotogramas con el material real del
entrenamiento—. Eso es lo que hace que alguien la comparta, y compartir es lo que trae
enlaces, que es lo que trae posiciones.

### Paso 6 — Distribución, que es lo que enciende la mecha
El SEO tarda semanas; la gente, no. Ahí está el tráfico de las primeras semanas:
foros y grupos de entrenadores de fútbol base, Reddit (r/futbol, r/BocaJuniors… donde
encaje de verdad), grupos de Facebook de fútbol formativo, X, TikTok grabando la pantalla
mientras dibujas una jugada real de la última jornada. Un directorio de herramientas
gratuitas también aporta los primeros enlaces entrantes.

### Paso 7 — Medir sin traicionar la promesa de privacidad
La landing presume de no rastrear. Si quieres datos, usa una analítica sin cookies
(Plausible, Umami autoalojado, GoatCounter) o quédate solo con Search Console, que ya te
dice consultas, posiciones y clics sin poner un solo script en la página.

---

## 3. Lo que NO hay que hacer nunca

- Comprar enlaces o participar en intercambios masivos.
- Generar cientos de páginas casi idénticas cambiando la ciudad o la palabra clave.
- Repetir la palabra clave hasta que el texto deje de sonar humano.
- Mostrar a Google algo distinto de lo que ve el usuario (*cloaking*).
- Inventar valoraciones, reseñas o testimonios, y marcarlos con `AggregateRating`.
- Meter texto oculto del color del fondo.

Todo esto funcionó hace quince años. Hoy es la forma más rápida de que un dominio deje de
existir para el buscador, y recuperarse cuesta meses.

---

## 4. Comprobaciones antes de dar por bueno un cambio

- **PageSpeed Insights** (`pagespeed.web.dev`): objetivo, verde en las tres métricas.
- **Prueba de resultados enriquecidos** de Google: debe detectar `SoftwareApplication`.
- **Validador de Schema.org** (`validator.schema.org`): cero errores.
- **Depurador de tarjetas** de Facebook / X: comprueba que la imagen OG carga.
- **Lighthouse** en el navegador: apartados de accesibilidad y SEO al 100.
