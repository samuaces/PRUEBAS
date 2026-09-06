# Cookie Play

**Tu IPTV personal.** Metes tus listas (M3U o Xtream Codes) y la app las organiza
sola en **películas**, **series** y **canales de TV**, con favoritos, buscador y
una lista de recomendados basada en las valoraciones.

Todo corre en tu servidor o en tu equipo. No hay servicios externos ni cuentas:
las listas, los favoritos y el historial se guardan en `iptv/data/`, fuera del
control de versiones.

---

## La vía fácil: la app en el móvil, coste 0 y sin cuentas

**Doble clic en «Compartir Cookie Play»** (`.command` en macOS, `.bat` en
Windows, `compartir-cookie-play.sh` en Linux). La ventana te enseña esto:

```
┌────────────────────────────────────────────────────┐
│  Enlace para el móvil (funciona desde cualquier red)
│  https://algo-aleatorio.trycloudflare.com
│  Contraseña: 481902
└────────────────────────────────────────────────────┘
```

Le pasas **ese enlace y esa contraseña** a quien quieras. Esa persona lo abre en
el navegador del móvil, escribe la contraseña y ya está dentro; si además le da a
**Compartir → Añadir a pantalla de inicio** (iPhone) o **⋮ → Instalar aplicación**
(Android), le queda con el icono de la galleta y a pantalla completa, como
cualquier app.

Qué hay detrás: la app sigue corriendo en tu ordenador y Cloudflare le pone una
dirección `https` pública por delante. **No hay que registrarse en ningún sitio,
no se paga nada y no se sube ninguna lista a ningún servicio.** La primera vez se
descarga el conector oficial de Cloudflare (unos 40 MB) y queda guardado en
`data/bin/` para las siguientes.

Dos cosas que conviene saber:

- **El ordenador tiene que estar encendido** con esa ventana abierta. Si la
  cierras, el enlace deja de funcionar (la app y los datos siguen intactos).
- **El enlace cambia cada vez que lo abres.** La contraseña no: se guarda en
  `data/acceso.json` y es siempre la misma. Si quieres una dirección fija y
  gratis, la vía es [Tailscale Funnel](https://tailscale.com/kb/1223/funnel):
  cuenta gratuita en *tu* equipo, y te da algo tipo
  `https://tu-equipo.tu-red.ts.net` que ya no cambia; quien la use no instala nada.

> Si algún día quieres que funcione sin tener el ordenador encendido, hay que
> alojarla en un servidor, y eso ya cuesta dinero: en el repositorio están el
> `Dockerfile` y el `render.yaml` preparados para ese día, pero no hace falta
> para nada de lo anterior.

## Abrirla en el ordenador, de un clic

Descarga la carpeta `iptv/` y haz **doble clic** en el lanzador de tu sistema:

| Sistema | Solo en este equipo | Con enlace para el móvil |
| --- | --- | --- |
| macOS | `Iniciar Cookie Play.command` | `Compartir Cookie Play.command` |
| Windows | `Iniciar Cookie Play.bat` | `Compartir Cookie Play.bat` |
| Linux | `iniciar-cookie-play.sh` | `compartir-cookie-play.sh` |

Arranca la app, busca un puerto libre y **abre el navegador solo**. Para cerrarla,
cierra esa ventana. Lo único que necesitas instalado es
[Node.js](https://nodejs.org) (versión LTS); si falta, el lanzador te lo dice.

> En macOS, la primera vez: clic derecho en el archivo → **Abrir** → **Abrir**.

Con la app abierta, el botón **Instalar app** de la barra superior la deja
también en el escritorio con su icono.

## Añadir tus listas

En **Ajustes → Añadir lista** hay tres formas:

1. **URL M3U** — el típico enlace `http://servidor/get.php?username=…&type=m3u_plus`.
2. **Xtream Codes** — servidor, usuario y contraseña. Es la mejor opción: el panel
   devuelve valoraciones, géneros, sinopsis y carátulas, y las series llegan ya
   separadas por temporadas y episodios.
3. **Pegar / archivo** — pega el contenido de un `.m3u` o elige el archivo.

Al añadir una lista se sincroniza sola. Después puedes volver a sincronizar
cuando quieras desde el botón de la barra superior o desde Ajustes. Con
catálogos grandes (decenas de miles de entradas) el primer sincronizado tarda un
par de minutos.

## Cómo se ordena el contenido

El clasificador mira, por este orden, la ruta del stream (`/movie/`, `/series/`,
`/live/`), el patrón de episodio del título (`S01E02`, `1x02`, `T1 E2`), la
categoría (`group-title`) y la extensión del archivo. Además:

- Limpia los títulos de prefijos y etiquetas (`ES|`, `[1080p]`, `4K`, `CAST`…) y
  guarda esas etiquetas aparte para distinguir fuentes duplicadas.
- Une el mismo título que aparece en varias listas o calidades en una sola ficha
  con varias fuentes.
- Agrupa los episodios sueltos en series con sus temporadas.
- Oculta las categorías marcadas como adultas (se puede desactivar en Ajustes).

## Recomendaciones

La pestaña **Recomendados** puntúa cada título con:

- la **valoración** (la del proveedor Xtream o la de TMDB) como peso principal,
- la **afinidad** con lo que ya ves: géneros y categorías de tus favoritos y de
  tu historial,
- un empujón a lo **añadido recientemente** y a los estrenos.

Lo que ya tienes en favoritos no se repite, y lo ya visto baja posiciones.

### Valoraciones y carátulas (TMDB, opcional)

Si tu lista no trae valoraciones, en **Ajustes → Clave de TMDB** puedes pegar una
clave gratuita de [themoviedb.org](https://www.themoviedb.org/settings/api). Con
ella la app completa carátulas, sinopsis, género, año y nota, que es lo que
alimenta las recomendaciones. Los resultados se cachean un mes en
`data/meta-cache.json`.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `/` o `⌘/Ctrl + K` | Ir al buscador |
| `Esc` | Cerrar ficha, reproductor o buscador |
| `Espacio` | Pausa / reproducir |
| `←` `→` | Saltar 10 segundos |
| `↑` `↓` | Volumen |
| `F` | Pantalla completa |

## Variables de entorno

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PORT` | `8787` | Puerto del servidor |
| `HOST` | `127.0.0.1` | `0.0.0.0` para verlo desde otros dispositivos |
| `ACCESS_PIN` | vacía | Contraseña de acceso. Con «Compartir» se genera sola |
| `PLAYLIST_URL` | vacía | Configura una lista M3U al arrancar |
| `PLAYLIST_NAME` | `Lista principal` | Nombre de esa lista |
| `XTREAM_HOST` / `XTREAM_USER` / `XTREAM_PASS` | vacías | Configura una cuenta Xtream al arrancar |

Desde la terminal: `cd iptv && npm start` y abre <http://127.0.0.1:8787>.

## Cómo está montado

```
iptv/
├─ Iniciar Cookie Play…    lanzadores de un clic (solo este equipo)
├─ Compartir Cookie Play…  lanzadores con enlace público gratuito
├─ iniciar.mjs        elige puerto, arranca el servidor y abre el navegador
├─ server.js          API, archivos estáticos y proxy de vídeo (Node puro)
├─ Dockerfile         para publicarla en Render, Railway, Fly.io o un VPS
├─ src/
│  ├─ store.js        persistencia en JSON, escritura atómica
│  ├─ parse.js        parser M3U, limpieza de títulos y clasificador
│  ├─ xtream.js       cliente de Xtream Codes
│  ├─ library.js      catálogo unificado, búsqueda y recomendaciones
│  ├─ tmdb.js         enriquecimiento opcional con TMDB (con caché)
│  ├─ tunel.js        enlace público con Cloudflare Tunnel (sin cuentas)
│  └─ sync.js         orquesta descarga → parseo → catálogo
├─ tools/
│  └─ generar-iconos.py  regenera los iconos a partir del logo
└─ public/            interfaz (ES modules, sin build)
   ├─ index.html
   ├─ login.html     pantalla de acceso cuando hay ACCESS_PIN
   ├─ manifest.webmanifest + sw.js   para poder instalarla como app
   ├─ css/style.css
   ├─ icons/         logo, logotipo e iconos de la app
   └─ js/            app, vistas, componentes, reproductor
```

El vídeo pasa siempre por `/api/proxy`, que resuelve los problemas de CORS,
manda el `User-Agent` que esperan estos servidores, reescribe los manifiestos
HLS y soporta `Range` para poder saltar dentro de una película. La reproducción
usa HLS nativo cuando el navegador lo soporta (Safari) y `hls.js` en el resto.

## La marca

El logo, el logotipo y la paleta (cian `#11cbf1`, azul `#1b85c8`, galleta
`#e0a868` y blanco) son los de la lámina de Cookie Play. Los iconos de la app se
generan del logo con `python3 tools/generar-iconos.py`; si cambias
`public/icons/logo.png`, vuelve a ejecutarlo y se rehacen todos los tamaños.

## Aviso

La app no incluye ni distribuye contenido: solo reproduce las listas que tú le
des. Usa listas a las que tengas derecho de acceso.
