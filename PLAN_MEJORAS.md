# AnalyticsFutbol Elite v5.1 — Plan de mejoras

## Contexto del proyecto

App de análisis de fútbol para móvil/tablet. Archivo único: `index.html` (~2390 líneas).
Stack: HTML5 + CSS3 + ES6 vanilla. Sin framework ni build tools.
Integración con Supabase JS v2 para sincronización en tiempo real.
7 secciones: Marcador, Táctico, Plantillas, Físico, Clips, Eventos, Informe.
Funciones principales: cronómetro, tagging de eventos, simulador IA, exportación PDF/CSV, análisis de vídeo con canvas.

## Estado actual (v5.2 implementada)

Las siguientes mejoras YA están implementadas y commiteadas en la rama `claude/review-mobile-app-t4gOH`:

- Iconos SVG inline en las 7 pestañas de navegación
- Inputs de nombre de equipo (Local/Visitante) con actualización dinámica del marcador y el PDF
- Botones de evento rediseñados: código corto coloreado + etiqueta secundaria
- Código de color en el log de eventos por tipo de acción
- Animación sutil en el marcador al anotar un gol (`@keyframes goalScore`)
- Pill online/offline animado en el header
- Mayor contraste en el campo táctico (verde más saturado, líneas más visibles)
- Estados hover/active en todos los tipos de botón
- Zebra striping y hover por fila en la tabla de Físico
- Focus ring verde en todos los inputs y botones
- Tokens CSS de transición y focus ring en `:root`
- Botones: Tarjeta Amarilla, Tarjeta Roja, Sustitución (nuevos eventos)
- Selector de posición (POR/DEF/CEN/MED/DEL) en Plantillas
- Capa de dibujo libre (`tactical-draw-canvas`) sobre el campo táctico

---

## Funciones que aún faltan

### Críticas

| # | Función | Descripción |
|---|---|---|
| 1 | **Metadatos del partido** | Sin campo de fecha, estadio, jornada o competición. El PDF no tiene cabecera contextual |
| 2 | **Vincular evento a jugador** | Al registrar TIRO, FALTA, GOL no se puede especificar qué jugador lo hizo |

### Importantes

| # | Función | Descripción |
|---|---|---|
| 3 | **Selector de formación** | No hay presets (4-4-2, 4-3-3, 3-5-2…) para mostrar sobre el campo táctico |
| 4 | **Comparativa 1ª vs 2ª parte** | Los stats son acumulativos. No hay desglose por período ni separación en el PDF |
| 5 | **Color y grosor del lápiz (Clips)** | El lápiz táctico en vídeo tiene un solo color (#cc0000) y grosor. Sin selector |

### Complementarias

| # | Función | Descripción |
|---|---|---|
| 6 | **Mapa de disparos (Shot map)** | No hay visualización de dónde se realizaron los tiros sobre la portería |
| 7 | **Estadísticas por jugador** | No hay stats acumuladas por jugador desde los eventos manuales |
| 8 | **Deshacer/Rehacer en eventos** | Solo "Deshacer último" (elimina el más reciente). Sin redo ni eliminación limpia de intermedios |
| 9 | **Nota libre / observaciones** | Sin sección de notas de texto libre para el entrenador (útil para el PDF) |
| 10 | **Historial multi-partido** | No se puede consultar partidos anteriores. Solo el más reciente de Supabase |
| 11 | **PWA / Instalación offline** | Sin Service Worker ni manifest.json. No instalable como app nativa |

---

## Estructura del código (referencias clave)

### CSS (líneas 14–806)
- Tokens en `:root` (línea 18): colores, tipografía, radio, sombras, transición, focus ring
- `.af-btn-event` (línea 636): botones de tagging con `.evt-code` y `.evt-label`
- `.af-log-item` (línea 681): filas del log de eventos con `border-left` coloreado
- `@keyframes goalScore` (línea 353): animación del marcador
- `#net-pill` / `.net-online` / `.net-offline` (líneas 123–142): indicador de conexión

### HTML (líneas 808–1219)
- Header con `#net-pill` (línea 815)
- Nav tabs con SVG (líneas 829–880)
- Inputs de nombre de equipo `#input-team-local` / `#input-team-visit` (líneas 907–913)
- Marcador con `#ui-score-local`, `#ui-label-local` (líneas 915–925)
- Campo táctico con `#tactical-canvas-overlay` y `#tactical-draw-canvas` (líneas 989–990)
- Selector de posición `#roster-pos-sel` (línea 1029)
- Grid de eventos con 11 botones incluyendo T.AM, T.RJ, SUS (líneas 1122–1167)

### JavaScript — objeto `App` (líneas 1222–2387)
- `getEventColor(rawType)` (línea 1264): mapa de colores por tipo de evento
- `updateTeamNames()` (línea 1283): sincroniza nombres en marcador e informe
- `initialize()` (línea 1296): arranque, Supabase, pill de conexión
- `triggerEvent(type)` (línea 1405): registra evento, actualiza marcador, dispara animación de gol
- `refreshEventLogUI()` (línea 1570): renderiza el log con color-coding y tinte de equipo
- `toggleTacticalDraw()` (línea 2037): activa/desactiva dibujo libre en campo táctico
- `assignPlayerName()` (línea 2256): guarda dorsal, nombre y posición
- `resetMatchSystem()` (línea 2292): resetea todo el estado para nuevo partido
- `exportProfessionalPDF()` (línea 2157): genera PDF en ventana nueva con nombres de equipo
